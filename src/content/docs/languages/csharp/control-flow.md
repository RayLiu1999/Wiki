---
title: 條件判斷與迴圈
description: 用 if 決定分支，用 foreach、for 與 while 讓程式重複處理資料。
articleId: csharp-control-flow
topic: csharp
category: basics
order: 3
tags: [C#, csharp, if, foreach, for, while, 流程控制, 迴圈]
difficulty: beginner
prerequisites: [csharp-variables]
relatedArticles: [csharp-methods, csharp-collections]
applicableVersions: 概念通用；完整範例使用 C# 9 以上的頂層陳述式。
verifiedWith: .NET SDK 10.0.105 / net10.0 / C# 14
lastReviewed: 2026-10-07
takeaway: 條件決定是否執行，迴圈決定如何重複；先把停止條件想清楚。
sources:
  - title: Microsoft Learn：迴圈陳述式
    url: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/iteration-statements
---

## 讓程式做選擇

<code>if</code> 接受布林條件。條件為真時執行對應區塊，否則可以走 <code>else</code>。比較使用 <code>==</code>，指派使用 <code>=</code>，兩者用途不同。

需要逐一處理集合元素時，<code>foreach</code> 通常最清楚。需要索引或固定次數時可以使用 <code>for</code>；依條件持續執行時可以使用 <code>while</code>。

## 累加後判斷結果

~~~csharp title="Program.cs"
int[] numbers = { 2, 4, 6 };
int total = 0;

foreach (int number in numbers)
{
    total += number;
}

if (total >= 10)
{
    Console.WriteLine("總和至少是 10");
}
else
{
    Console.WriteLine("總和小於 10");
}
~~~

預期輸出：

~~~text
總和至少是 10
~~~

每次迴圈把一個值加入 <code>total</code>。走完集合後，總和是 12，因此執行第一個分支。

## 控制重複的範圍

<code>break</code> 結束目前迴圈，<code>continue</code> 跳過本次剩餘內容並繼續下一次。它們可以讓條件更直觀，但過多跳轉也會增加閱讀負擔。

## 常見錯誤

- 使用索引時，最後一個位置通常是長度減一，不是長度本身。
- <code>while</code> 的條件若永遠不變，可能形成無窮迴圈。
- 列舉 <code>List&lt;T&gt;</code> 時增刪元素，通常會讓列舉失敗；先整理修改清單再處理。
