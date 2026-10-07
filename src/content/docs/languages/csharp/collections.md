---
title: 泛型與常用集合
description: 使用 List、Dictionary 與 HashSet，讓集合的資料型別與存取方式保持清楚。
articleId: csharp-collections
topic: csharp
category: data
order: 9
tags: [C#, csharp, 泛型, generic, List, Dictionary, HashSet, 集合]
difficulty: beginner
prerequisites: [csharp-control-flow, csharp-classes]
relatedArticles: ["csharp-linq", "csharp-query-abstractions", "csharp-type-operators", "csharp-thread-safety"]
applicableVersions: 泛型集合概念通用；完整範例使用 C# 9 以上。
verifiedWith: .NET SDK 10.0.105 / net10.0 / C# 14
lastReviewed: 2026-10-07
takeaway: 先根據資料的存取方式選集合，再用泛型保持型別安全。
sources:
  - title: Microsoft Learn：泛型型別與方法
    url: https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/types/generics
noteDates: ["2026-05-21", "2026-05-25", "2026-06-03", "2026-06-04", "2026-10-06"]
---

## 為什麼需要泛型

泛型（generics）讓型別或方法把資料型別當成參數。<code>List&lt;string&gt;</code> 明確表示元素是字串，加入不相容的型別時，編譯器會提醒你。

<code>List&lt;T&gt;</code> 適合有順序的元素；<code>Dictionary&lt;TKey, TValue&gt;</code> 適合依鍵查找；<code>HashSet&lt;T&gt;</code> 適合保留不重複的元素與檢查成員是否存在。

## 建立標籤清單

~~~csharp title="Program.cs"
var tags = new List<string> { "C#", "PWA" };
var counts = new Dictionary<string, int> { ["C#"] = 3 };

tags.Add("Wiki");
Console.WriteLine(string.Join(", ", tags));

if (counts.TryGetValue("C#", out int count))
{
    Console.WriteLine(count);
}
~~~

預期輸出：

~~~text
C#, PWA, Wiki
3
~~~

<code>TryGetValue</code> 同時表示鍵是否存在，並在成功時交還對應值，適合處理「找不到」是正常情況的查詢。

## 讓需求決定集合

若要依位置取元素，清單通常比字典更自然。若頻繁依 ID 查找物件，字典可避免每次逐一掃描。這些選擇也會影響重複值、順序與修改方式。

## 常見錯誤

- 使用字典索引讀取不存在的鍵會丟出例外。
- 多執行緒同時讀寫一般集合，需要同步或適合的並行集合。
- 泛型保證型別相容，不會自動保證商業資料有效。

## 工作筆記：集合契約與查詢成本

陣列的長度固定，`List<T>` 可增減項目，`Dictionary<TKey, TValue>` 依 key 存取。`IReadOnlyList<T>` 限制透過該介面修改集合，不保證背後物件或元素不可變。

`IEnumerable<T>` 只描述同步列舉；`IQueryable<T>` 可讓 provider 讀取 expression tree，`IAsyncEnumerable<T>` 則支援非同步逐筆讀取。這些介面都不等於「已經載入全部資料」。泛型保留元素型別資訊，查詢執行位置仍需另外確認。
