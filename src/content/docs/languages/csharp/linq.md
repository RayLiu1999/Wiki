---
title: 用 LINQ 整理你的資料
description: 使用篩選與投影描述查詢，理解延遲執行與 ToList 的差別。
articleId: csharp-linq
topic: csharp
category: data
order: 11
tags: [C#, csharp, LINQ, Where, Select, ToList, 延遲執行, 資料處理]
difficulty: beginner
prerequisites: [csharp-collections, csharp-delegates]
relatedArticles: ["csharp-async-await", "csharp-query-abstractions", "data-access-ef-core"]
applicableVersions: LINQ to Objects 概念通用；完整範例使用 C# 9 以上。
verifiedWith: .NET SDK 10.0.105 / net10.0 / C# 14
lastReviewed: 2026-10-07
takeaway: 許多 LINQ 查詢在列舉時才執行；ToList 會立即建立結果清單。
sources:
  - title: Microsoft Learn：LINQ 查詢概觀
    url: https://learn.microsoft.com/en-us/dotnet/csharp/linq/get-started/introduction-to-linq-queries
  - title: "Microsoft Learn：EF Core 查詢評估"
    url: https://learn.microsoft.com/en-us/ef/core/querying/client-eval
noteDates: ["2026-06-04", "2026-10-06"]
---

## 用查詢描述資料

LINQ（Language Integrated Query）提供一組可組合的資料操作。<code>Where</code> 篩選元素，<code>Select</code> 把元素轉成另一種結果。

這篇先討論記憶體集合的 LINQ to Objects。資料庫查詢提供者的翻譯與執行限制，需要另外確認。

## 看見延遲執行

~~~csharp title="Program.cs"
var numbers = new List<int> { 5, 6, 7 };
var query = numbers.Where(number => number >= 6)
                   .Select(number => number * 2);

numbers.Add(8);
var snapshot = query.ToList();
Console.WriteLine(string.Join(", ", snapshot));

numbers.Add(9);
Console.WriteLine(string.Join(", ", query));
~~~

預期輸出：

~~~text
12, 14, 16
12, 14, 16, 18
~~~

建立 <code>query</code> 時沒有立即產生整份結果。<code>ToList</code> 列舉當下的資料並建立清單，因此包含後來加入的 8。再次列舉 <code>query</code> 時，又會看到新加入的 9。

## 何時具體化結果

需要重複使用同一次查詢結果，或想固定當下元素時，可以使用 <code>ToList</code>、<code>ToArray</code>。它們會配置空間；若結果很大，也要考量記憶體成本。

## 常見錯誤

- 不要以為所有 LINQ 方法都延遲執行；<code>Count</code>、<code>First</code> 等會立即取得結果。
- 重複列舉可能重做昂貴的工作，也可能得到不同資料。
- 清單快照不等於深層複製；若元素是可變物件，仍可能共享物件參考。

## 工作筆記：EF Core 的查詢邊界

對 EF Core DbSet 組合 LINQ 時，provider 可將支援的 Where、Select、OrderBy 等表達式翻成 SQL。ToListAsync 等方法才觸發實體化；不要先載入全部再篩選。

不是每個 C# 方法都能翻譯；AsEnumerable 後的操作也可能移到用戶端。需用實際 provider 檢查 SQL 與效能，不能由記憶體 List 的範例推論資料庫查詢結果。
