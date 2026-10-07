---
title: "Task、ValueTask 與 WhenAll"
description: "協調多個非同步作業，分清等待集合、限制併發與觀察失敗。"
articleId: "csharp-async-coordination"
topic: "csharp"
category: "practice"
order: 22
tags: ["Task", "ValueTask", "Task.WhenAll", "非同步", "併發", "CancellationToken"]
difficulty: "intermediate"
prerequisites: ["csharp-async-await", "csharp-cancellation"]
relatedArticles: ["csharp-thread-safety", "csharp-channels", "aspnet-core-dependency-injection"]
applicableVersions: "以 .NET 10 / C# 14 核對；個別語法與 API 的最低版本見內文。"
verifiedWith: ".NET SDK 10.0.105 / net10.0 / C# 14；完整 Program.cs 已納入編譯與輸出驗證。"
lastReviewed: "2026-10-07"
takeaway: "WhenAll 等待一組作業，沒有替你限制併發、取消同伴或建立新執行緒。"
noteDates: ["2026-05-21", "2026-05-27"]
sources: [{"title": "Microsoft Learn：Task.WhenAll", "url": "https://learn.microsoft.com/en-us/dotnet/api/system.threading.tasks.task.whenall?view=net-10.0"}, {"title": "Microsoft Learn：ValueTask<TResult>", "url": "https://learn.microsoft.com/en-us/dotnet/api/system.threading.tasks.valuetask-1?view=net-10.0"}]
---

## 作業已開始，再一起等待

呼叫非同步方法時，方法會先執行到尚未完成的 await。`Task.WhenAll` 接收這些作業，等全部結束後完成，泛型版本的結果順序對應輸入順序，而非完成順序。

~~~csharp title="Program.cs"
using var cancellation = new CancellationTokenSource();
Task<int>[] tasks = Enumerable.Range(1, 3)
    .Select(id => ReadAsync(id, cancellation.Token)).ToArray();
int[] results = await Task.WhenAll(tasks);
Console.WriteLine(string.Join(", ", results));
Console.WriteLine(await GetCachedAsync());

static async Task<int> ReadAsync(int id, CancellationToken token)
{
    await Task.Delay(1, token);
    return id * 10;
}
static ValueTask<int> GetCachedAsync() => ValueTask.FromResult(99);
~~~

預期輸出：

~~~text
10, 20, 30
99
~~~

## ValueTask 要有量測支持

ValueTask 可在常見同步完成情境降低 Task 配置，卻帶來消費方式的限制與額外結構成本。一般 API 先使用 Task；除非契約明確允許，ValueTask 應只 await 一次。若必須多次等待或交給 WhenAll，先呼叫一次 AsTask 並保存轉換結果。

## 併發、取消與失敗是分開的

大量建立 Task 可能壓垮下游連線或資料庫。使用 SemaphoreSlim、Channel 或適當的並行 API 控制同時執行數；同一個 DbContext 不支援平行執行多個操作。

WhenAll 不會在第一個失敗時自動取消其他作業。fault 優先於 cancellation 決定組合作業狀態；await 通常擲出其中一個例外，如需完整診斷可保留組合作業並查看其 Exception。取消需由各作業合作遵守 CancellationToken。
