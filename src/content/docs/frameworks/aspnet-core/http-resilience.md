---
title: "HTTP 例外、串流、重試與限流"
description: "區分取消、逾時、狀態碼和 JSON 問題，避免大回應與不受控重試壓垮服務。"
articleId: "aspnet-core-http-resilience"
topic: "aspnet-core"
category: "services"
order: 4
tags: ["HttpRequestException", "TaskCanceledException", "OperationCanceledException", "SocketException", "JsonException", "EnsureSuccessStatusCode", "ReadAsStringAsync", "ReadAsStreamAsync", "Polly", "429", "Retry-After"]
difficulty: "intermediate"
prerequisites: ["aspnet-core-http-client-factory", "csharp-cancellation", "csharp-exceptions"]
relatedArticles: ["csharp-query-abstractions", "engineering-metrics-tracing"]
applicableVersions: "以 .NET 10 生態系與本文列出的官方文件核對；套件及資料庫供應商的差異見內文。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-07"
takeaway: "先辨認失敗層級，再決定是否重試；串流與取消要覆蓋整個讀取過程。"
noteDates: ["2026-06-04", "2026-07-13", "2026-08-07"]
sources: [{"title": "Microsoft Learn：HttpClient.SendAsync", "url": "https://learn.microsoft.com/en-us/dotnet/api/system.net.http.httpclient.sendasync?view=net-10.0"}, {"title": "Microsoft Learn：HttpCompletionOption", "url": "https://learn.microsoft.com/en-us/dotnet/api/system.net.http.httpcompletionoption?view=net-10.0"}, {"title": "Polly：Retry strategy", "url": "https://www.pollydocs.org/strategies/retry.html"}, {"title": "Microsoft Learn：HTTP resilience", "url": "https://learn.microsoft.com/en-us/dotnet/core/resilience/http-resilience"}]
---

## 先辨認失敗層級

| 現象 | 觀察重點 |
| --- | --- |
| `OperationCanceledException` / `TaskCanceledException` | 呼叫端取消或逾時；檢查 token、期限與 inner exception，細節依 .NET 版本不同 |
| 非 2xx | 先得到 response；EnsureSuccessStatusCode 會轉成 HttpRequestException |
| DNS、TLS、連線失敗 | 常由 HttpRequestException 表示；底層可能含 SocketException，不能假定每次都有 |
| JSON 不符合契約 | JsonException；不是網路連不上 |
| HTTP 429 | 對方限流；檢查 Retry-After 與總等待預算 |

TaskCanceledException 是 OperationCanceledException 的子型別。分類 catch 時應先處理較具體者；不要把使用者主動取消當成需要重試的服務故障。

## 大回應逐步讀取

ReadAsStringAsync 會把內容讀進字串。改用 ResponseHeadersRead 可避免 SendAsync 預先緩衝全部 body，再用串流處理。以下為方法片段，未連線執行；factory 管理的 client 由外部傳入。

~~~csharp title="串流 JSON 陣列（整合片段）"
using System.Text.Json;

static async Task ReadOrdersAsync(HttpClient client, Uri endpoint,
    CancellationToken callerToken)
{
    using var deadline = CancellationTokenSource.CreateLinkedTokenSource(callerToken);
    deadline.CancelAfter(TimeSpan.FromSeconds(30));
    CancellationToken token = deadline.Token;
    using var request = new HttpRequestMessage(HttpMethod.Get, endpoint);
    using var response = await client.SendAsync(request,
        HttpCompletionOption.ResponseHeadersRead, token);
    response.EnsureSuccessStatusCode();
    await using var stream = await response.Content.ReadAsStreamAsync(token);
    await foreach (OrderDto? item in JsonSerializer.DeserializeAsyncEnumerable<OrderDto>(
        stream, cancellationToken: token))
    {
        if (item is not null) Console.WriteLine(item.Id);
    }
}
record OrderDto(int Id);
~~~

ResponseHeadersRead 下，HttpClient.Timeout 主要覆蓋取得 headers 的階段；body 讀取要自行傳遞取消與期限。DeserializeAsyncEnumerable 的串流格式必須符合 API 契約，不能把任何 JSON 都當成陣列。

## 有條件的重試

Polly 的 retry 會重新執行 callback。設定 ShouldHandle、最大次數、退避、jitter 與總期限，才有可控的行為；Polly 8 的 pipeline API 與舊 Policy 寫法不同。

429 可依 Retry-After（秒數或 HTTP 日期）決定延遲；不要立即密集重試。讀取請求通常較容易重試，付款或新增訂單需要冪等契約。每次嘗試需建立新的 HttpRequestMessage，並釋放先前 response；已部分消費的串流也不能直接假設能重播。
