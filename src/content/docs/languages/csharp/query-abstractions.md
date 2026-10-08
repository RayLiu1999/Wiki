---
title: "IEnumerable、IQueryable 與非同步列舉"
description: "區分記憶體列舉、可翻譯查詢與非同步逐筆讀取，找出資料執行的邊界。"
articleId: "csharp-query-abstractions"
topic: "csharp"
category: "data"
order: 21
tags: ["IEnumerable<T>", "IQueryable<T>", "IAsyncEnumerable<T>", "LINQ", "EF Core", "await foreach"]
difficulty: "intermediate"
prerequisites: ["csharp-collections", "csharp-linq", "csharp-async-await"]
relatedArticles: ["data-access-ef-core", "aspnet-core-http-resilience"]
applicableVersions: "以 .NET 10 / C# 14 核對；個別語法與 API 的最低版本見內文。"
verifiedWith: ".NET SDK 10.0.105 / net10.0 / C# 14；完整 Program.cs 已納入編譯與輸出驗證。"
lastReviewed: "2026-10-08"
takeaway: "查詢寫成 LINQ 不代表一定在資料庫執行；先確認 provider 與實體化的位置。"
noteDates: ["2026-06-04", "2026-10-06"]
sources: [{"title": "Microsoft Learn：IQueryable<T>", "url": "https://learn.microsoft.com/en-us/dotnet/api/system.linq.iqueryable-1?view=net-10.0"}, {"title": "Microsoft Learn：非同步串流", "url": "https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/generate-consume-asynchronous-stream"}, {"title": "Microsoft Learn：EF Core 用戶端與伺服器評估", "url": "https://learn.microsoft.com/en-us/ef/core/querying/client-eval"}]
learningDepth: "deep"
---

IEnumerable、IQueryable 與 IAsyncEnumerable 表達不同的讀取契約。商品結果究竟是可列舉資料、可繼續組合的查詢，或逐筆非同步產生，會影響執行位置與資源生命週期。

## 三種介面，三種能力

| 介面 | 表達的能力 | 要留意的事情 |
| --- | --- | --- |
| `IEnumerable<T>` | 同步逐項列舉 | 可能延遲執行，也可能觸發資料來源 |
| `IQueryable<T>` | 讓 provider 接收 expression tree | 能否翻成 SQL 由 provider 與表達式決定 |
| `IAsyncEnumerable<T>` | 非同步取得下一項 | `await foreach`，可傳遞取消要求 |

EF Core 的 DbSet 查詢通常是 IQueryable。先組合 Where、Select，再用 ToListAsync 等方法實體化。`AsEnumerable()` 後的 LINQ 操作走一般列舉模型；它本身不會先把全部資料載入，但可能使後續篩選移到用戶端。

## 逐筆等待資料

~~~csharp title="Program.cs"
using System.Runtime.CompilerServices;

using var cancellation = new CancellationTokenSource();
await foreach (int value in ReadAsync(cancellation.Token))
{
    Console.WriteLine(value);
}

static async IAsyncEnumerable<int> ReadAsync(
    [EnumeratorCancellation] CancellationToken token = default)
{
    for (int i = 1; i <= 3; i++)
    {
        await Task.Delay(1, token);
        yield return i;
    }
}
~~~

預期輸出：

~~~text
1
2
3
~~~

非同步逐筆讀取讓呼叫端逐步處理資料，不保證 provider 完全不緩衝。讀取期間也可能持有連線；若每筆處理很慢，要檢查連線池、逾時與背壓。

## 常見錯誤

過早 ToList 再 Where，可能先載入大量資料。自訂 C# 方法也不一定能翻成 SQL；現代 EF Core 對非頂層投影中無法翻譯的表達式通常會丟例外。應查看產生的 SQL 與實際執行計畫。

## 套用到電商情境

查商品時，把需要的篩選與投影留在可轉譯查詢中；大量資料可依用例分頁或逐筆讀取。非同步列舉期間資源可能仍被佔用，取消和 disposal 要沿整段列舉管理。傳出 IQueryable 也會讓呼叫端影響查詢邊界。

[閱讀對應的電商章節](/projects/ecommerce/product-api/)，把本篇概念接到整個用例。
