---
title: 值型別與參考型別
description: 看懂指派時複製的是值，還是指向同一個物件的參考。
articleId: csharp-value-reference-types
topic: csharp
category: types
order: 6
tags: [C#, csharp, 值型別, 參考型別, struct, class, 記憶體]
difficulty: beginner
prerequisites: [csharp-variables, csharp-classes]
relatedArticles: ["csharp-methods", "csharp-nullable", "csharp-records-invariants", "csharp-parameter-passing"]
applicableVersions: 型別語意通用；完整範例使用 C# 9 以上的頂層陳述式。
verifiedWith: .NET SDK 10.0.105 / net10.0 / C# 14
lastReviewed: 2026-10-07
takeaway: 一般指派會複製變數的值；參考型別變數的值，就是物件參考。
sources:
  - title: Microsoft Learn：值型別
    url: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/value-types
noteDates: ["2026-05-22", "2026-06-01"]
---

## 從指派的行為理解

<code>int</code>、<code>bool</code>、<code>struct</code> 是值型別。<code>class</code>、陣列與 <code>string</code> 是參考型別。一般指派會複製變數的值。

對值型別而言，複製後的值可以各自改變。對參考型別而言，兩個變數可能指向同一個物件，因此透過其中一個參考修改物件，另一個參考也會看到變化。

## 比較兩種指派

~~~csharp title="Program.cs"
int original = 1;
int copy = original;
copy = 2;
Console.WriteLine($"{original}, {copy}");

var first = new Counter { Value = 1 };
var second = first;
second.Value = 2;
Console.WriteLine($"{first.Value}, {second.Value}");

class Counter
{
    public int Value { get; set; }
}
~~~

預期輸出：

~~~text
1, 2
2, 2
~~~

第一組各自持有整數值。第二組的兩個變數指向同一個 <code>Counter</code>，所以看見相同的 <code>Value</code>。

## 參數傳遞也要分清楚

參數預設以值傳遞。傳入物件時，方法收到的是參考的副本；它可以修改同一個物件，但重新指派該參數不會重新指派呼叫端的變數。<code>ref</code> 則另有語意。

## 常見誤解

- 不要用「值型別一定在 stack、參考型別一定在 heap」取代語意理解；實際儲存位置受上下文影響。
- 值型別包含參考型別欄位時，複製結構仍可能共享欄位指向的物件。
- <code>string</code> 雖然是參考型別，但內容不可變，不能直接套用可變物件的直覺。

## 工作筆記：值型別也可能含共用參考

struct 被複製時會複製欄位值；若欄位是 List 或其他 class，欄位值就是參考，因此兩份 struct 仍可能共用同一物件。record 的 with 也採淺拷貝，不會自動深拷貝參考欄位。

唯讀介面、init 與 readonly 能限制部分修改入口，卻不保證整棵物件圖不可變。設計 Value Object 時，還需考慮內部集合及其相等性。
