---
title: nullable 與空值處理
description: 用可為空的型別表達缺少資料，理解問號、空值條件與預設值。
articleId: csharp-nullable
topic: csharp
category: types
order: 8
tags: [C#, csharp, nullable, "null", 空值, 空值處理]
difficulty: beginner
prerequisites: [csharp-value-reference-types]
relatedArticles: [csharp-exceptions]
applicableVersions: 可為空參考型別需 C# 8 以上；完整頂層範例需 C# 9 以上。
verifiedWith: .NET SDK 10.0.105 / net10.0 / C# 14 / Nullable enabled
lastReviewed: 2026-10-07
takeaway: 問號表示資料可能缺少；應處理這種可能，而不是只壓掉警告。
sources:
  - title: Microsoft Learn：可為空參考型別
    url: https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/null-safety/nullable-reference-types
---

## 讓缺少資料變得明確

<code>int?</code> 是可為空值型別，可以包含整數或 <code>null</code>。<code>string?</code> 在啟用可為空參考型別分析時，告訴編譯器這個參考可能是 <code>null</code>。

參考型別的註記與分析主要在編譯期提供警告，並不會在執行時自動阻止空值。

## 安全取得資料

~~~csharp title="Program.cs"
#nullable enable

string? nickname = null;
string displayName = nickname ?? "訪客";
int? length = nickname?.Length;

Console.WriteLine(displayName);
Console.WriteLine(length?.ToString() ?? "沒有長度");
~~~

預期輸出：

~~~text
訪客
沒有長度
~~~

<code>??</code> 在左側為空時提供替代值。<code>?.</code> 只有在物件不為空時存取成員，否則結果仍是空值。

## 選擇適合的預設值

「沒有暱稱」可以顯示「訪客」，但「沒有價格」不一定等於零。預設值需要符合資料的實際意義；必要時讓呼叫端明確處理缺少資料。

## 常見錯誤

- <code>!</code> 是空值警告抑制運算子，不會建立物件，也不會避免執行時錯誤。
- 單純關閉 nullable 警告，通常只是把問題留到執行時。
- 呼叫外部 API 或解析資料時，仍需檢查輸入是否符合宣告。
