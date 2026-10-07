---
title: 理解 async 與 await
description: 理解 Task 如何代表作業，讓等待中的方法交還控制權，並在完成後繼續執行。
articleId: csharp-async-await
topic: csharp
category: practice
order: 14
tags: [C#, csharp, 非同步, asynchronous, async, await, Task, I/O]
difficulty: intermediate
prerequisites: [csharp-methods, csharp-exceptions]
relatedArticles: [csharp-cancellation, csharp-disposable]
applicableVersions: async / await 自 C# 5 起提供；完整頂層範例使用 C# 9 以上。
verifiedWith: .NET SDK 10.0.105 / net10.0 / C# 14
lastReviewed: 2026-10-07
takeaway: await 等待的是作業結果；未完成時可交還控制權，不代表自動建立新執行緒。
sources:
  - title: Microsoft Learn：非同步程式設計
    url: https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/
---

## 作業與執行緒

<code>Task</code> 表示作業的完成狀態；<code>Task&lt;T&gt;</code> 還會提供結果。宣告 <code>async</code> 方法，讓方法可以使用 <code>await</code> 等待可等待的作業。

方法會先同步執行。當 <code>await</code> 遇到尚未完成的作業時，方法可以暫停並把控制權交還呼叫端；作業完成後，才繼續處理後面的程式。

## 等待一段小作業

~~~csharp title="Program.cs"
Console.WriteLine("開始");
string message = await ReadMessageAsync();
Console.WriteLine(message);

static async Task<string> ReadMessageAsync()
{
    await Task.Delay(10);
    return "完成";
}
~~~

預期輸出：

~~~text
開始
完成
~~~

<code>Task.Delay</code> 用來示範等待。方法交還 <code>Task&lt;string&gt;</code>；呼叫端透過 <code>await</code> 取得字串，而不是直接把工作物件當成結果。

## 依工作性質選擇

等待網路或檔案等 I/O 時，優先使用相應的非同步 API。CPU 密集計算是另一種情況，可能需要適當排程；單純加上 <code>async</code> 不會讓計算自動平行。

## 常見錯誤

- <code>.Result</code> 與 <code>.Wait()</code> 會同步阻塞，某些執行環境也可能死結；通常應一路使用 <code>await</code>。
- 除了必要的事件處理器，避免使用 <code>async void</code>，讓呼叫端能等待及觀察例外。
- 忘記等待作業，可能使錯誤無法被正確觀察，或讓程式提早結束。
