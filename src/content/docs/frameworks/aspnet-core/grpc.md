---
title: "ASP.NET Core gRPC 通訊實戰：HTTP/2 多工、Proto 契約與雙向串流"
description: "深入剖析 gRPC 二進位序列化效能、HTTP/2 單連線多工機制、Kestrel H2C 協定設定、L4/L7 負載平衡陷阱與 RpcException 處理。"
articleId: "aspnet-core-grpc"
topic: "aspnet-core"
category: "integration"
order: 1
tags: ["ASP.NET Core", "gRPC", "Protobuf", "HTTP/2", "微服務通訊", "高效能", "串流"]
articleType: "deep-dive"
prerequisites: ["aspnet-core-http-client-factory", "csharp-async-await"]
relatedArticles: ["aspnet-core-dapr", "engineering-metrics-tracing"]
applicableVersions: ".NET 8 / .NET 10、C# 12+ / 14"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "內部微服務高頻通訊首選 gRPC；Kestrel 必須正確啟用 HTTP/2；跨 Pod 呼叫務必搭配 L7 代理或 Client-side 負載平衡。"
sources:
  - title: "Microsoft Learn：ASP.NET Core 的 gRPC 簡介"
    url: "https://learn.microsoft.com/zh-tw/aspnet/core/grpc/"
  - title: "Microsoft Learn：使用 ASP.NET Core gRPC 的效能最佳做法"
    url: "https://learn.microsoft.com/zh-tw/aspnet/core/grpc/performance"
---

## 案發現場

某微服務體系中，訂單服務每秒需向商品中心發起 30,000 次查詢。由於全面採用傳統 HTTP/1.1 JSON REST API，伺服器間充斥著 TCP 連線重複交握、TLS 協商與巨量 JSON 鍵值字串序列化開銷，網路頻寬被吃滿，P99 延遲高達 120ms；團隊決定引入 gRPC，不料在內部未加密網路測試時，客戶端頻繁拋出 `HttpRequestException: An HTTP/2 connection could not be established`，通訊全面受阻。

根因在於：對 **HTTP/2 協定交握機制（TLS ALPN vs. H2C）** 與 **gRPC 連線特性** 認識不足。

## 致命反模式 vs. 正確解法

```text
【通訊協定效能架構對比】
[HTTP/1.1 REST] 單一 TCP 連線串行傳輸 ──► [隊頭阻塞 Head-of-Line Blocking] ──► 文字 JSON 體積大 (耗頻寬)
[HTTP/2 gRPC]   單一 TCP 連線多工 (Multiplexing) ──► 數百請求並行交錯 Frames ──► ProtoBuf 二進位超高密度
```

### 坑一：內部無 TLS 網路未配置 H2C

HTTP/2 預設透過 TLS 的 ALPN 協商。若在內網關閉 TLS，Kestrel 必須明確配置 `HttpProtocols.Http2`，且客戶端必須開啟 `SocketsHttpHandler.EnableMultipleHttp2Connections`。

### 坑二：L4 負載平衡器導致單點熱點

傳統 L4（TCP 層）負載平衡器僅在連線建立時分配。由於 gRPC 長期複用同一條 HTTP/2 TCP 連線，所有並行請求會永久壓在同一台 Pod 上，其他 Pod 處於閒置狀態！

~~~csharp title="Program.cs"
// ✅ Good：gRPC 例外狀態碼對應與取消權杖串聯
using Grpc.Core;

var handler = new OrderGrpcMockHandler();
var context = new MockServerCallContext();

try
{
    string response = await handler.GetOrderDetailAsync(orderId: 0, context);
    Console.WriteLine(response);
}
catch (RpcException ex)
{
    Console.WriteLine($"捕捉 gRPC 狀態碼: {ex.StatusCode}");
    Console.WriteLine($"狀態細節合規: {ex.Status.Detail}");
}

public sealed class OrderGrpcMockHandler
{
    public async Task<string> GetOrderDetailAsync(int orderId, ServerCallContext context)
    {
        // 串聯通訊端點之取消權杖（若用戶端中斷，即時終止後續處理）
        if (context.CancellationToken.IsCancellationRequested)
        {
            throw new RpcException(new Status(StatusCode.Cancelled, "用戶端已取消請求"));
        }

        if (orderId <= 0)
        {
            // 關鍵：業務參數非法應拋出具型別的 InvalidArgument 狀態碼
            throw new RpcException(new Status(StatusCode.InvalidArgument, "訂單識別碼非法"));
        }

        await Task.Delay(5);
        return $"訂單 #{orderId} 資料已返回";
    }
}

public sealed class MockServerCallContext : ServerCallContext
{
    protected override string MethodCore => "GetOrderDetail";
    protected override string HostCore => "localhost";
    protected override string PeerCore => "127.0.0.1";
    protected override DateTime DeadlineCore => DateTime.UtcNow.AddSeconds(30);
    protected override Metadata RequestHeadersCore => [];
    protected override CancellationToken CancellationTokenCore => CancellationToken.None;
    protected override Metadata ResponseTrailersCore => [];
    protected override Status StatusCore { get; set; }
    protected override WriteOptions? WriteOptionsCore { get; set; }
    protected override AuthContext AuthContextCore => null!;
    protected override ContextPropagationToken CreatePropagationTokenCore(ContextPropagationOptions? options) => null!;
    protected override Task WriteHeadersAsyncCore(Metadata responseHeaders) => Task.CompletedTask;
}
~~~

預期輸出：
```text
捕捉 gRPC 狀態碼: InvalidArgument
狀態細節合規: 訂單識別碼非法
```

## 踩坑與避坑指南

* **gRPC 負載平衡解決方案**：
  * **L7 代理（Proxy-based）**：使用 Envoy、Traefik 或 Kubernetes Gateway API 進行 HTTP/2 訊框級解包與分發。
  * **客戶端負載平衡（Client-side）**：透過 `grpc://dns:///service-name:5000` 讓客戶端查詢 Headless Service DNS，自動在多台 Pod 之間建立多條 HTTP/2 實體連線。
* **雙向串流反壓（Backpressure）**：在撰寫 `IAsyncStreamReader<T>` 接收串流時，必須以 `await foreach` 循序處理。禁止以未受限的 `Task.Run` 並行激增消費，以免下游崩潰。
* **避坑原則（什麼時候千萬不要用 gRPC？）**：
  * **對外公開之瀏覽器用戶端或公開合作夥伴 API**：瀏覽器不具備直接操作 HTTP/2 原始 Frame 的能力，且二進位 ProtoBuf 無法直接在瀏覽器 DevTools 中可讀檢視。對公網端點一律優先選用標準 REST/JSON。

## 線上排查指令

線上排查 gRPC 服務健康與呼叫：

```bash
# 1. 使用 grpc_cli 列出服務端所有公開之 gRPC 方法（需支援 Reflection）
grpc_cli ls localhost:5000

# 2. 檢視 Kestrel HTTP/2 訊框處理狀況與重置（RST_STREAM）事件
dotnet-counters monitor Microsoft.AspNetCore.Server.Kestrel --counters http2-connections,http2-streams
```
