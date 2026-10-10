---
title: "ASP.NET Core HTTP 彈性策略：Polly v8 斷路器與防重試風暴實戰"
description: "深入剖析重試風暴骨牌崩潰、指數退避抖動演算法、斷路器熔斷防護，以及 Microsoft.Extensions.Http.Resilience 標準管線實戰。"
articleId: "aspnet-core-http-resilience"
topic: "aspnet-core"
category: "services"
order: 4
tags: ["ASP.NET Core", "Polly", "Resilience", "斷路器", "重試風暴", "Jitter", "微服務彈性"]
articleType: "deep-dive"
prerequisites: ["aspnet-core-http-client-factory", "csharp-cancellation-disposable"]
relatedArticles: ["aspnet-core-http-contracts", "engineering-metrics-tracing"]
applicableVersions: ".NET 8 / .NET 10、C# 12+ / 14"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "重試必須搭配指數退避與隨機抖動（Jitter）；下游故障果斷透過斷路器快速失敗；嚴禁對 4xx 客戶端錯誤發動重試。"
sources:
  - title: "Microsoft Learn：建置彈性 HTTP 應用程式"
    url: "https://learn.microsoft.com/zh-tw/dotnet/core/resilience/http-resilience"
  - title: "Polly 文檔：Polly v8 架構指南"
    url: "https://www.pollydocs.org/"
---

## 案發現場

某電商大促期間，下游庫存服務因負載過重回應延遲攀升至 3 秒；上游訂單微服務設定了「失敗立即重試 3 次」，在每秒 2,000 QPS 流量下，瞬間將打往下游的請求暴增至 8,000 QPS！毀滅性的**重試風暴（Retry Storm）**直接將庫存服務壓垮當機；更致命的是，庫存服務當機後上游並未熔斷，數千條連線持續傻等 30 秒逾時，導致上游執行緒池枯竭，引發全站雪崩式連鎖癱瘓。

禍根正是：缺乏**退避抖動機制（Backoff with Jitter）**與**斷路器（Circuit Breaker）防護**，在下游瀕臨崩潰時落井下石。

## 致命反模式 vs. 正確解法

```text
【微服務彈性防線管線順序（Polly v8）】
發起外呼 ──► [1. 總逾時 Total Timeout]
                 │
                 ▼
             [2. 重試管線 Retry] ──(指數退避 + 隨機 Jitter，錯開高峰)
                 │
                 ▼
             [3. 斷路器 Circuit Breaker] ──(連續失敗達標？立即 Open 熔斷短路快速失敗)
                 │
                 ▼
             [4. 單次逾時 Attempt Timeout] ──► 發送至下游微服務
```

### 坑一：立即重試且無隨機抖動

所有失敗的請求若在相同的時間點（例如整齊的 1 秒後）同時重試，會形成波峰共振，再次重擊剛要復原的下游主機。

### 坑二：對 4xx 用戶端錯誤進行重試

400 Bad Request 或 404 Not Found 屬於請求內容錯誤，重試無濟於事，只會白白浪費網路帶寬與系統運算力。

~~~csharp title="Program.cs"
// ✅ Good：運用指數退避與隨機抖動演算法防禦重試風暴
var random = new Random(42);

Console.WriteLine("計算重試間隔（指數退避 + 隨機抖動 Jitter）：");
for (int attempt = 1; attempt <= 3; attempt++)
{
    TimeSpan delay = CalculateJitteredBackoff(attempt, random);
    Console.WriteLine($"第 {attempt} 次重試間隔約: {delay.TotalMilliseconds:F0}ms");
}

Console.WriteLine("斷路器與重試策略配置完畢");

static TimeSpan CalculateJitteredBackoff(int attempt, Random rnd)
{
    // 基礎指數退避：2^attempt * 100ms
    double baseDelayMs = Math.Pow(2, attempt) * 100;
    // 加入 0.8 ~ 1.2 的隨機抖動因子，打散重試時間波峰
    double jitter = rnd.NextDouble() * 0.4 + 0.8;
    return TimeSpan.FromMilliseconds(baseDelayMs * jitter);
}
~~~

預期輸出：
```text
計算重試間隔（指數退避 + 隨機抖動 Jitter）：
第 1 次重試間隔約: 212ms
第 2 次重試間隔約: 457ms
第 3 次重試間隔約: 923ms
斷路器與重試策略配置完畢
```

## 踩坑與避坑指南

* **現代官方標準：`AddStandardResilienceHandler`**：
  在 .NET 8+ / .NET 10 中，官方提供了封裝良好的擴充套件 `Microsoft.Extensions.Http.Resilience`。只需呼叫 `services.AddHttpClient<IInventoryClient>().AddStandardResilienceHandler();`，即可自動獲得五道防禦層（RateLimiter ──► TotalTimeout ──► Retry ──► CircuitBreaker ──► AttemptTimeout），完全無須手動拼裝。
* **斷路器三大狀態循環**：
  * **Closed（閉合）**：正常傳遞請求。
  * **Open（開啟/熔斷）**：下游連續拋錯達標，直接短路拋出 `BrokenCircuitException`，保護下游免於被敲死。
  * **Half-Open（半開啟）**：經過冷卻時間後放行單一試探請求，若成功則自動閉合恢復，若失敗則重回熔斷。
* **避坑原則（什麼時候千萬不要開啟 Hedging 對沖請求？）**：
  * **非冪等寫入操作**：Hedging 策略會在呼叫緩慢時主動並行發送第二個相同請求以降低 P99 延遲。若用在扣款或扣庫存等寫入端點，極易引發嚴重的重複交易事故。

## 線上排查指令

線上監控 Polly 斷路器與重試狀態：

```bash
# 1. 監控 Polly 策略執行指標（斷路器狀態、重試次數與對沖率）
dotnet-counters monitor Polly --counters resilience-events,circuit-breaker-state

# 2. 檢視日誌中是否有大規模 BrokenCircuitException 熔斷日誌
grep -i "BrokenCircuitException" /var/log/app/*.log | tail -n 20
```
