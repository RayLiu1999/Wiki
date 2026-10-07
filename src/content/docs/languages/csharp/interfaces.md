---
title: 介面、繼承與多型
description: 讓呼叫端依賴行為契約，理解介面與類別繼承各自的用途。
articleId: csharp-interfaces
topic: csharp
category: oop
order: 7
tags: [C#, csharp, interface, 介面, 繼承, 多型, polymorphism]
difficulty: beginner
prerequisites: [csharp-classes]
relatedArticles: [csharp-delegates, csharp-disposable]
applicableVersions: 基本介面與多型概念通用；完整範例使用 C# 9 以上。
verifiedWith: .NET SDK 10.0.105 / net10.0 / C# 14
lastReviewed: 2026-10-07
takeaway: 介面描述可以做什麼，呼叫端不必知道每個實作的內部細節。
sources:
  - title: Microsoft Learn：多型
    url: https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/object-oriented/polymorphism
  - title: Microsoft Learn：介面
    url: https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/types/interfaces
---

## 先定義行為契約

介面（interface）讓不同型別提供共同的操作。呼叫端使用介面時，關心的是「能否完成這個行為」，而不是具體類別如何完成。

類別繼承則建立基底類別與衍生類別的關係。可覆寫的行為可以使用 <code>virtual</code> 與 <code>override</code>。C# 類別只能直接繼承一個基底類別，但可以實作多個介面。

## 替換通知的實作

~~~csharp title="Program.cs"
INotifier notifier = new ConsoleNotifier();
notifier.Notify("Hello");

interface INotifier
{
    void Notify(string message);
}

class ConsoleNotifier : INotifier
{
    public void Notify(string message)
    {
        Console.WriteLine($"通知：{message}");
    }
}
~~~

預期輸出：

~~~text
通知：Hello
~~~

變數型別是 <code>INotifier</code>，實際物件是 <code>ConsoleNotifier</code>。之後加入另一個通知實作時，呼叫端仍可以使用同一個契約。

## 何時使用繼承

當型別之間存在合理的「是一種」關係，且需要共同狀態或基底行為時，再考慮類別繼承。只為了共享少量程式碼而建立深層繼承，往往使修改更困難。

## 常見錯誤

- 介面不會自動讓設計變好；契約仍應保持小而清楚。
- 用 <code>new</code> 隱藏成員，與用 <code>override</code> 覆寫虛擬成員的呼叫行為不同。
- 呼叫端若持續轉型成具體類別才能工作，應重新檢視契約是否完整。
