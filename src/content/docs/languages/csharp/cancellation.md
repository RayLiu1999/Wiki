---
title: CancellationToken 與取消作業
description: 把取消要求傳給非同步作業，理解協作式取消與例外的界線。
articleId: csharp-cancellation
topic: csharp
category: practice
order: 15
tags: [C#, csharp, CancellationToken, CancellationTokenSource, 取消, 非同步]
difficulty: intermediate
prerequisites: [csharp-async-await, csharp-disposable]
relatedArticles: [csharp-exceptions, csharp-async-await]
applicableVersions: 取消權杖概念通用；完整範例使用 C# 9 以上的頂層 await。
verifiedWith: .NET SDK 10.0.105 / net10.0 / C# 14
lastReviewed: 2026-10-07
takeaway: Cancel 發出取消要求；作業必須接收並回應權杖，才會停止。
sources:
  - title: Microsoft Learn：受控執行緒中的取消
    url: https://learn.microsoft.com/en-us/dotnet/standard/threading/cancellation-in-managed-threads
---

## 取消是一種協作

<code>CancellationTokenSource</code> 管理取消要求，<code>CancellationToken</code> 把要求傳給需要執行工作的程式。呼叫 <code>Cancel</code> 並不會強制中止所有程式碼。

支援取消的 API 會觀察權杖。自己撰寫的長時間迴圈，也可以在適當位置檢查取消要求。

## 傳遞取消要求

這個範例先取消，再把權杖傳給延遲作業，讓輸出保持一致。

~~~csharp title="Program.cs"
using var source = new CancellationTokenSource();
source.Cancel();

try
{
    await Task.Delay(1000, source.Token);
}
catch (OperationCanceledException) when (source.IsCancellationRequested)
{
    Console.WriteLine("已取消");
}
~~~

預期輸出：

~~~text
已取消
~~~

已被取消的權杖會使這個等待作業取消。呼叫端用 <code>await</code> 觀察結果，並以過濾條件處理自己預期的取消情況。

## 讓權杖沿呼叫鏈傳遞

上層收到取消要求後，應把權杖傳給下層 API，例如 HTTP 請求、非同步讀取或另一個業務方法。若某一層丟掉權杖，底層工作可能繼續執行。

## 常見錯誤

- <code>Dispose</code> 釋放來源使用的資源，不等於發出取消要求。
- 不要把所有取消都當成系統故障；應區分使用者取消、逾時與其他錯誤。
- 取消後不會自動回復已完成的外部操作；有副作用的流程仍需要自己的交易或補償設計。
