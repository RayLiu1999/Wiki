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
relatedArticles: ["csharp-exceptions", "csharp-parameter-passing", "csharp-records-invariants", "aspnet-core-model-binding"]
applicableVersions: 可為空參考型別需 C# 8 以上；完整頂層範例需 C# 9 以上。
verifiedWith: .NET SDK 10.0.105 / net10.0 / C# 14 / Nullable enabled
lastReviewed: "2026-10-08"
takeaway: 問號表示資料可能缺少；應處理這種可能，而不是只壓掉警告。
sources:
  - title: Microsoft Learn：可為空參考型別
    url: https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/null-safety/nullable-reference-types
noteDates: ["2026-06-04", "2026-06-25"]
learningDepth: "basic"
---

商品查詢可能找不到資料，優惠碼也可能未填。nullable 讓缺少值進入型別契約，使編譯器分析和呼叫端處理更明確；它不等於所有輸入都已被驗證。

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

## 深入理解：把 null 留在正確邊界

`Type?` 要依 Type 是值型別或參考型別解讀；`?.`、`??` 處理可能缺少的資料，`!` 只告訴編譯器你保證非空。它不會驗證 HTTP JSON 或資料庫的實際內容。

外部 DTO 可以保留「未提供」狀態，建立領域型別時再驗證必要條件。`out` 的輸出與 `ref` / `in` 的別名語意另見參數傳遞，不要把問號與傳參方式混為一談。

## 套用到電商情境

找不到商品應映射成既定的查詢結果，例如 404；選填優惠碼的 null 則可以是合法輸入。不要把缺少商品轉成預設商品後繼續下單，也不要用 null-forgiving 運算子掩蓋真正未處理的狀態。

[閱讀對應的電商章節](/projects/ecommerce/product-api/)，把本篇概念接到整個用例。
