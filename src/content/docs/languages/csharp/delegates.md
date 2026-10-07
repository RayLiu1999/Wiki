---
title: 委派、Lambda 與事件
description: 把行為傳入另一段程式，並用事件通知外部訂閱者。
articleId: csharp-delegates
topic: csharp
category: oop
order: 10
tags: [C#, csharp, 委派, delegate, Lambda, event, Func, Action]
difficulty: intermediate
prerequisites: [csharp-methods, csharp-interfaces]
relatedArticles: [csharp-linq]
applicableVersions: 委派與 Lambda 概念通用；完整範例使用 C# 9 以上並啟用 nullable。
verifiedWith: .NET SDK 10.0.105 / net10.0 / C# 14 / Nullable enabled
lastReviewed: 2026-10-07
takeaway: 委派描述可呼叫的行為，Lambda 是簡潔的寫法，事件控制通知的發布與訂閱。
sources:
  - title: Microsoft Learn：委派
    url: https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/delegates/
  - title: Microsoft Learn：事件
    url: https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/events/
---

## 把行為當成輸入

委派（delegate）是一種型別，用來表示符合特定參數與回傳值的可呼叫行為。<code>Func&lt;int, int&gt;</code> 接受整數並回傳整數；<code>Action&lt;int&gt;</code> 接受整數但不回傳值。

Lambda 表達式以 <code>=&gt;</code> 分隔參數與內容，常用於集合處理或簡短的回呼。

## 計算與通知

~~~csharp title="Program.cs"
#nullable enable

Func<int, int> doubleValue = value => value * 2;
Console.WriteLine(doubleValue(3));

var sensor = new Sensor();
sensor.Changed += value => Console.WriteLine($"溫度：{value}");
sensor.Update(26);

class Sensor
{
    public event Action<int>? Changed;

    public void Update(int value)
    {
        Changed?.Invoke(value);
    }
}
~~~

預期輸出：

~~~text
6
溫度：26
~~~

<code>+=</code> 訂閱事件。事件宣告讓外部程式可以加入或移除處理器，但不能任意發布這個事件；發布由 <code>Sensor</code> 控制。

## 留意捕捉的資料

Lambda 可以使用外層變數，形成閉包。它使用的是捕捉到的變數，不一定是建立 Lambda 當下的一份值快照。

## 常見錯誤

- 長時間存在的發布者可能透過訂閱保留物件；不需要通知時應取消訂閱。
- 若要取消某個匿名處理器的訂閱，先保留該委派實例。
- 非同步回呼需要合適的委派型別；不要隨意把有回傳工作的程式塞入 <code>Action</code>。
