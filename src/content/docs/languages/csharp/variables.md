---
title: 變數、型別與型別轉換
description: 用合適的型別表達資料，理解 var、數值運算與型別轉換的界線。
articleId: csharp-variables
topic: csharp
category: basics
order: 2
tags: [C#, csharp, 變數, 型別, var, decimal, 轉換]
difficulty: beginner
prerequisites: [csharp-getting-started]
relatedArticles: [csharp-value-reference-types, csharp-nullable]
applicableVersions: 概念通用；完整範例使用 C# 9 以上的頂層陳述式。
verifiedWith: .NET SDK 10.0.105 / net10.0 / C# 14
lastReviewed: 2026-10-07
takeaway: var 只是讓編譯器推斷型別，變數仍然有固定的型別。
sources:
  - title: Microsoft Learn：C# 型別系統
    url: https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/types/
---

## 用型別表達資料

變數可以視為有名字的資料。<code>int</code> 表達整數、<code>bool</code> 表達真假、<code>string</code> 表達文字。型別會限制可以賦予哪些值，以及可以執行哪些運算。

<code>var quantity = 3;</code> 的型別仍是 <code>int</code>，後續不能改放字串。當右側已清楚表達型別時，<code>var</code> 可以減少重複。

## 計算一筆小訂單

~~~csharp title="Program.cs"
using System.Globalization;

decimal unitPrice = 198m;
int quantity = 3;
decimal total = unitPrice * quantity;

Console.WriteLine(total.ToString("0.00", CultureInfo.InvariantCulture));
~~~

預期輸出：

~~~text
594.00
~~~

數值後的 <code>m</code> 代表 <code>decimal</code>。格式化時指定不隨文化變動的格式，讓這段範例的輸出一致。實際面向讀者的價格顯示則應依需求選擇地區格式。

## 理解轉換的代價

部分轉換可隱含完成，例如 <code>int</code> 到 <code>long</code>。可能失去資訊的轉換通常需要明確指定，例如把小數轉為整數會捨棄小數部分。

文字轉數值是「解析」，可以用 <code>int.TryParse</code> 回報成功或失敗。它與數值型別間的轉換不同。

## 常見錯誤

- 整數相除仍可能得到整數。若需要小數，先讓運算元具有合適的型別。
- <code>double</code> 與 <code>decimal</code> 有不同的精度與運算特性，不宜任意混用。
- 明確轉型不代表一定安全；也要考慮範圍、溢位與資料來源。
