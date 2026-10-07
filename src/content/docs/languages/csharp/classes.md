---
title: class 與物件的基本輪廓
description: 用類別描述資料和行為，以建構函式與存取修飾詞建立可維護的公開介面。
articleId: csharp-classes
topic: csharp
category: types
order: 5
tags: [C#, csharp, class, 物件, 建構函式, public, private]
difficulty: beginner
prerequisites: [csharp-methods]
relatedArticles: [csharp-value-reference-types, csharp-interfaces]
applicableVersions: 類別概念通用；完整範例使用 C# 9 以上的頂層陳述式。
verifiedWith: .NET SDK 10.0.105 / net10.0 / C# 14
lastReviewed: 2026-10-07
takeaway: class 描述物件的形狀；公開哪些成員，是設計的一部分。
sources:
  - title: Microsoft Learn：類別
    url: https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/types/classes
---

## 型別與實例

類別（class）描述一種物件具有哪些資料與行為。使用 <code>new</code> 建立的物件是該類別的一個實例。多個實例可以具有不同的狀態。

建構函式負責讓新物件從有效狀態開始。屬性可以控制資料的讀寫方式；<code>public</code> 表示公開，<code>private</code> 表示只讓類別內部使用。

## 建立一份筆記

~~~csharp title="Program.cs"
var notebook = new Notebook("C# 程式筆記");
Console.WriteLine(notebook.Title);

class Notebook
{
    public string Title { get; }

    public Notebook(string title)
    {
        if (string.IsNullOrWhiteSpace(title))
            throw new ArgumentException("標題不能是空白", nameof(title));

        Title = title;
    }
}
~~~

預期輸出：

~~~text
C# 程式筆記
~~~

<code>Title</code> 只有公開的 getter。呼叫端能讀取標題，但無法在建立後任意改寫；建構函式同時排除空白標題。

## 設計公開介面

不要把每個欄位都設成公開可寫。先問「物件允許發生哪些變化」，再用方法或受控制的屬性表達這些行為。

## 常見錯誤

- <code>static</code> 成員屬於型別，而非某一個實例；可變的共用狀態需要特別留意。
- 類別是參考型別，指派變數不會自動複製物件。
- 建構時檢查必要條件，比讓無效狀態流到其他方法更容易維護。
