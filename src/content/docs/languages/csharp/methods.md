---
title: 方法、參數與回傳值
description: 把一段有名字的行為整理成方法，明確表達輸入、輸出與責任。
articleId: csharp-methods
topic: csharp
category: basics
order: 4
tags: [C#, csharp, 方法, method, 參數, return]
difficulty: beginner
prerequisites: [csharp-control-flow]
relatedArticles: [csharp-classes, csharp-value-reference-types]
applicableVersions: 概念通用；範例以頂層陳述式中的區域函式示範，需 C# 9 以上。
verifiedWith: .NET SDK 10.0.105 / net10.0 / C# 14
lastReviewed: 2026-10-07
takeaway: 好的方法名稱說明行為，參數表達需求，回傳值表達結果。
sources:
  - title: Microsoft Learn：方法
    url: https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/classes-and-structs/methods
---

## 替一段行為取名字

方法讓程式可以重用某段行為，也讓呼叫端只需要關心輸入與結果。宣告通常包含回傳型別、名稱與參數；沒有回傳值時使用 <code>void</code>。

下例把計算整理成區域函式。放在類別內的成員方法也有相同的輸入與輸出觀念。

## 計算整數折扣

~~~csharp title="Program.cs"
int result = ApplyDiscount(200, 10);
Console.WriteLine(result);

static int ApplyDiscount(int price, int percent)
{
    return price * (100 - percent) / 100;
}
~~~

預期輸出：

~~~text
180
~~~

<code>price</code> 和 <code>percent</code> 是參數；呼叫時的 200 和 10 是引數。<code>return</code> 結束執行並交還結果。

此例使用整數，僅用來理解方法。真實價格計算應另外決定小數、四捨五入與輸入範圍規則。

## 讓責任保持清楚

當方法同時讀檔、解析、計算、存檔和顯示畫面，通常很難描述或測試。先讓一個方法做一件能清楚命名的事，再由上層串起流程。

## 常見錯誤

- 回傳型別不是 <code>void</code> 時，每條正常完成的路徑都必須回傳值。
- 引數預設以值傳遞；若傳入的是參考型別，複製的是參考，並非整個物件。
- 不要只依賴模糊的名稱，例如 <code>Process</code>，應說明實際處理的行為。
