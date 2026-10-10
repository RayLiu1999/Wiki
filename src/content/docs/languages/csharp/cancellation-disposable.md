---
title: "C# 資源釋放與取消權杖串聯"
description: "深入剖析 ASP.NET Core / .NET 後端如何正確傳遞 CancellationToken 防止無效空轉，以及 await using 資源釋放模式。"
articleId: "csharp-cancellation-disposable"
topic: "csharp"
category: "async-threading"
order: 2
tags: ["C#", "CancellationToken", "IAsyncDisposable", "資源釋放", "非同步"]
articleType: "deep-dive"
prerequisites: ["csharp-async-await"]
relatedArticles: ["csharp-syntax-traps", "csharp-valuetask-tcs"]
applicableVersions: "C# 10+ / 14、.NET 6+ / .NET 10"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "所有非同步 I/O 方法皆應一路串聯 CancellationToken；包含網路或連線資源的類別優先實作 IAsyncDisposable 並搭配 await using。"
sources:
  - title: "Microsoft Learn：非同步工作中的取消"
    url: "https://learn.microsoft.com/zh-tw/dotnet/standard/parallel-programming/task-cancellation"
  - title: "Microsoft Learn：實作 DisposeAsync 方法"
    url: "https://learn.microsoft.com/zh-tw/dotnet/standard/garbage-collection/implementing-disposeasync"
---

## 案發現場

使用者在前端快速切換分頁或直接關閉網頁，前端已斷開 HTTP 連線，但後端資料庫 CPU 卻衝上 100%——排查發現背後數十個昂貴的報表查詢與遠端 API 呼叫，依然在背景默默空轉，毫無節制地耗盡連線池；另一頭，未正確釋放的連線句柄持續堆積，最終釀成連線池耗盡（Pool Exhaustion）事故。

本質原因在於：後端沒有將用戶端取消信號一路串聯傳遞給下游 I/O，且非同步資源未依規範由 `IAsyncDisposable` 乾淨回收。

## 致命反模式 vs. 正確解法

```text
客戶端 (Browser)      後端 API (ASP.NET Core)           資料庫 / 外部 API
    │                        │                                 │
    ├─── 發送慢速查詢 ───────►│ ─── 執行資料庫查詢 ───────────►│
    ├─── 關閉連線 (Abort) ───►│ (❌ 若未串聯 Token，繼續空轉)  │
    │                        │ (✅ 串聯 Token: 即刻中止) ─────►│ 收到取消，停止 Scan
```

### 坑一：忽視 CancellationToken 導致幽靈查詢

```csharp
// 💣 Bad：丟棄 HttpContext.RequestAborted，客戶端斷線仍硬跑 30 秒大型查詢
[HttpGet("orders")]
public async Task<IActionResult> GetOrdersBad()
{
    var data = await _repo.QueryHeavyReportAsync(CancellationToken.None);
    return Ok(data);
}
```

### 坑二：使用同步 Dispose 釋放非同步連線

若在關閉網路 Socket 或刷新緩衝區時使用同步 `Dispose()`，會強行阻塞執行緒池，抵消非同步優勢。應優先實作 `IAsyncDisposable`。

~~~csharp title="Program.cs"
// ✅ Good：非同步資源釋放與取消權杖串聯實作
using var cts = new CancellationTokenSource();
cts.CancelAfter(TimeSpan.FromMilliseconds(50));

try
{
    await using var session = new DatabaseSession();
    await session.ExecuteQueryAsync(cts.Token);
}
catch (OperationCanceledException)
{
    Console.WriteLine("作業已依取消請求及時中止");
}

public sealed class DatabaseSession : IAsyncDisposable
{
    public async Task ExecuteQueryAsync(CancellationToken cancellationToken)
    {
        Console.WriteLine("查詢開始執行");
        // 將 Token 一路向下傳遞給支援取消的非同步 API
        await Task.Delay(200, cancellationToken);
        Console.WriteLine("查詢完成");
    }

    public async ValueTask DisposeAsync()
    {
        // 非同步釋放連線或清空緩衝區，不阻塞 ThreadPool
        await Task.Delay(10);
        Console.WriteLine("連線已非同步安全釋放");
    }
}
~~~

預期輸出：
```text
查詢開始執行
連線已非同步安全釋放
作業已依取消請求及時中止
```

## 踩坑與避坑指南

* **不可隨意吞掉 `OperationCanceledException`**：中介層與呼叫鏈依賴此例外識別請求已被中止。若必須捕捉日誌，應記錄後重新拋出（rethrow），讓框架終止流程。
* **聯合取消（Linked Token）**：若業務要求「客戶端中斷」或「自訂 5 秒超時」任一條件滿足即取消，應使用 `CancellationTokenSource.CreateLinkedTokenSource(tokenA, tokenB)`。
* **避坑原則（什麼時候千萬不要傳入客戶端 Token？）**：
  * **關鍵原子交易**：例如「扣款已完成，正在寫入出貨事件與更新庫存」的不可逆步驟。若傳入用戶斷線的 Token，會導致資料不一致。此類關鍵寫入應脫鉤，使用專屬超時 Token 執行。

## 線上排查指令

線上排查連線洩漏與未取消的慢查詢堆積：

```bash
# 1. 抓取當前行程的記憶體快照
dotnet-dump collect -p $(pgrep -n -f "dotnet.*MyService") -o dump.dmp

# 2. 檢視堆疊中是否有大量積壓的慢查詢 Task 與未釋放連線
dotnet-dump analyze dump.dmp
> dumpheap -type DatabaseSession
> clrstack -all
```
