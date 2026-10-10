---
title: "IHttpClientFactory 實戰：Socket 耗盡與 DNS 刷新失效治理"
description: "深入剖析 new HttpClient() 引發的 Socket 耗盡災難、單例用戶端 DNS 漂移失效、HttpMessageHandler 池化機制與 SocketsHttpHandler 最佳實務。"
articleId: "aspnet-core-http-client-factory"
topic: "aspnet-core"
category: "services"
order: 3
tags: ["ASP.NET Core", "HttpClient", "IHttpClientFactory", "Socket耗盡", "TIME_WAIT", "DNS刷新", "連線集區"]
articleType: "deep-dive"
prerequisites: ["aspnet-core-dependency-injection", "csharp-cancellation-disposable"]
relatedArticles: ["aspnet-core-http-resilience", "engineering-metrics-tracing"]
applicableVersions: ".NET 8 / .NET 10、C# 12+ / 14"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "嚴禁在請求迴圈中使用 using new HttpClient()；採用 IHttpClientFactory 或 SocketsHttpHandler 設定 PooledConnectionLifetime 兼顧池化與 DNS 刷新。"
sources:
  - title: "Microsoft Learn：在 .NET 中使用 IHttpClientFactory"
    url: "https://learn.microsoft.com/zh-tw/dotnet/core/extensions/httpclient-factory"
  - title: "Microsoft Learn：使用 HttpClient 的架構問題"
    url: "https://learn.microsoft.com/zh-tw/dotnet/architecture/microservices/implement-resilient-applications/use-httpclientfactory-to-implement-resilient-http-requests"
---

## 案發現場

某電商結帳微服務在促銷高峰期間突發網路全面癱瘓，外呼金流與物流 API 頻繁拋出 `SocketException: Address already in use`。維運登入伺服器發現作業系統有上萬個 TCP 連線滯留在 `TIME_WAIT` 狀態，可用 Socket 埠號被消耗殆盡；為了解決問題，工程師將 HttpClient 改為 `static readonly` 單例，不料數週後第三方金流服務更換 DNS 指向新主機，微服務竟然在數天內持續向舊的已廢棄 IP 傳送封包，引發大規模扣款失敗。

根因在於：對 **HttpClient 與作業系統底層 Socket 的生命週期** 理解不深，在「Socket 耗盡（Socket Exhaustion）」與「DNS 漂移失效（DNS Drift）」兩大極端陷阱間顧此失彼。

## 致命反模式 vs. 正確解法

```text
【HttpClient 兩大傳統極端陷阱】
[❌ 陷阱一：using new HttpClient()] ──► 每次拋棄連線 ──► OS Socket 滯留 TIME_WAIT ──► 💥 埠號耗盡
[❌ 陷阱二：static 單例 HttpClient]  ──► 永久重用 Socket ──► 忽略 DNS 記錄更新 ──► 💥 請求打往死 IP
[✅ 正解：IHttpClientFactory 池化]  ──► 外層 Client 隨用隨丟；底層 Handler 2 分鐘定期輪替刷新 DNS
```

### 坑一：在請求處理中反覆 new 與 Dispose HttpClient

`HttpClient` 實作了 `IDisposable`，但 Dispose 僅關閉託管物件，作業系統底層的 TCP Socket 必須等待 240 秒的 `TIME_WAIT` 週期才會真正釋放。高併發下會迅速抽乾本機 65,535 個 Port 資源。

### 坑二：單例用戶端永久鎖定連線

單例 `HttpClient` 會長久保持底層連線連線池，除非伺服器主動中斷，否則不會重新查詢 DNS 解析。

~~~csharp title="Program.cs"
// ✅ Good：運用 SocketsHttpHandler 設定連線存活時間，兼顧池化與 DNS 刷新
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;

var services = new ServiceCollection();

// 註冊具型別客戶端（Typed Client）並配置連線池生命週期（2 分鐘輪替一次刷新 DNS）
services.AddHttpClient<LogisticsApiClient>()
    .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
    {
        PooledConnectionLifetime = TimeSpan.FromMinutes(2),
        PooledConnectionIdleTimeout = TimeSpan.FromMinutes(1),
        MaxConnectionsPerServer = 50
    });

var provider = services.BuildServiceProvider();
var client = provider.GetRequiredService<LogisticsApiClient>();

Console.WriteLine($"Typed Client 初始化成功: {client != null}");
Console.WriteLine("SocketsHttpHandler 已啟用 PooledConnectionLifetime 防護");

public sealed class LogisticsApiClient(HttpClient httpClient)
{
    private readonly HttpClient _client = httpClient;
    public HttpClient InnerClient => _client;
}
~~~

預期輸出：
```text
Typed Client 初始化成功: True
SocketsHttpHandler 已啟用 PooledConnectionLifetime 防護
```

## 踩坑與避坑指南

* **`PooledConnectionLifetime` 是現代最佳實務**：
  在 .NET 6+ / .NET 10 中，`SocketsHttpHandler.PooledConnectionLifetime = TimeSpan.FromMinutes(2)` 是兼具極致吞吐與 DNS 自動感知的官方標準方案。連線在存活 2 分鐘後會被標記過期並優雅關閉，下次請求即會重新查詢 DNS。
* **Typed Client 本質是 Transient**：
  透過 `AddHttpClient<TClient>()` 註冊的類別本質是 Transient 服務。絕對不要將 Typed Client 快取在 Singleton 欄位中，否則外層的取消權杖與 Handler 切換將失去意義。
* **避坑原則（什麼時候千萬不要在 HttpClientFactory 開啟過度重試？）**：
  * **非冪等（Non-idempotent）操作**：例如信用卡刷卡扣款 API（POST）。若因網路超時自動重試，在伺服器端已扣款但回應逾時的情境下，會直接引發重複請款爭議！非冪等外呼應改由應用程式層的交易補償或掛起重查機制處理。

## 線上排查指令

檢查生產環境 Socket 佔用與連線健康：

```bash
# 1. 檢視 Linux 伺服器當前滯留在 TIME_WAIT 狀態的 Socket 總數
ss -s || netstat -ant | grep TIME_WAIT | wc -l

# 2. 監控 HttpClient 目前開啟的實體連線數與請求率
dotnet-counters monitor System.Net.Http --counters requests-started-rate,current-requests
```
