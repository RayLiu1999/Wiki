---
title: 例外與錯誤處理
description: 分辨正常的失敗結果與例外，讓程式在能處理的位置回應錯誤。
articleId: csharp-exceptions
topic: csharp
category: practice
order: 12
tags: [C#, csharp, 例外, exception, try, catch, throw, TryParse]
difficulty: beginner
prerequisites: [csharp-methods]
relatedArticles: ["csharp-disposable", "csharp-cancellation", "aspnet-core-http-resilience"]
applicableVersions: 例外處理概念通用；完整範例使用 C# 9 以上。
verifiedWith: .NET SDK 10.0.105 / net10.0 / C# 14
lastReviewed: "2026-10-08"
takeaway: 只在能恢復、補充脈絡或回報的位置捕捉例外，不要默默吞掉錯誤。
sources:
  - title: Microsoft Learn：例外與例外處理
    url: https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/exceptions/
noteDates: ["2026-07-13"]
learningDepth: "basic"
---

例外表示目前操作無法正常完成，會沿呼叫鏈傳遞。解析數量失敗、資料庫不可用與程式錯誤需要不同處理；先辨識失敗原因，再決定回應、重試或向上傳遞。

## 錯誤如何向上傳遞

當方法不能完成預期操作時，可以丟出例外。執行流程會尋找符合型別的 <code>catch</code>；若目前方法沒有處理器，就繼續向呼叫端傳遞。

<code>try</code> 放可能失敗的操作，<code>catch</code> 處理特定例外，<code>finally</code> 用於離開區塊時應執行的清理。

## 處理輸入格式錯誤

~~~csharp title="Program.cs"
try
{
    int count = int.Parse("oops");
    Console.WriteLine(count);
}
catch (FormatException)
{
    Console.WriteLine("請輸入有效整數");
}
~~~

預期輸出：

~~~text
請輸入有效整數
~~~

這段程式用來觀察例外流程。若無效輸入是正常且常見的情況，實務上可以優先使用 <code>int.TryParse</code>，讓失敗以回傳值表達。

## 保留錯誤脈絡

捕捉後要原樣重新丟出時，使用 <code>throw;</code> 保留原始堆疊資訊。若轉換成更適合上層理解的例外，也應保留原始例外作為內部原因。

## 常見錯誤

- 空白 <code>catch</code> 讓失敗消失，後續程式可能繼續使用無效資料。
- 過度捕捉 <code>Exception</code>，容易把程式錯誤當成可恢復情況。
- 非同步方法的例外通常透過回傳的工作傳遞，應使用 <code>await</code> 觀察。

## 深入理解：HTTP 失敗要先分類

取消或逾時可能表現為 OperationCanceledException / TaskCanceledException；非 2xx 回應預設仍是 response，EnsureSuccessStatusCode 才會轉為 HttpRequestException。連線問題可能含底層 SocketException，JSON 格式或契約錯誤則可能是 JsonException。

例外型別的細節依 API 與 .NET 版本不同，取消更不應一律當成故障重試。HTTP 實務文章把狀態碼、串流、Retry-After 與 Polly 的條件放在一起說明。

## 套用到電商情境

非法數量可以是可預期的驗證結果，資料庫斷線是系統相依失敗。API 應提供穩定錯誤契約與請求識別；記錄診斷時保留原始例外脈絡，並避免把密碼或內部堆疊直接回給買家。

[閱讀對應的電商章節](/projects/ecommerce/product-api/)，把本篇概念接到整個用例。
