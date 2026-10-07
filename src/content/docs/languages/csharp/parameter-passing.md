---
title: "out、ref、in 與參數傳遞"
description: "分清傳值、共用物件與呼叫端變數的別名，避免把 ref 當成一般指標。"
articleId: "csharp-parameter-passing"
topic: "csharp"
category: "basics"
order: 16
tags: ["C#", "參數", "out", "ref", "in", "Go 指標"]
difficulty: "intermediate"
prerequisites: ["csharp-methods", "csharp-value-reference-types"]
relatedArticles: ["csharp-nullable", "csharp-type-operators"]
applicableVersions: "以 .NET 10 / C# 14 核對；個別語法與 API 的最低版本見內文。"
verifiedWith: ".NET SDK 10.0.105 / net10.0 / C# 14；完整 Program.cs 已納入編譯與輸出驗證。"
lastReviewed: "2026-10-07"
takeaway: "傳入物件參考的副本，與讓參數成為呼叫端變數的別名，是兩件事。"
noteDates: ["2026-06-04", "2026-06-25"]
sources: [{"title": "Microsoft Learn：方法參數", "url": "https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/method-parameters"}]
---

## 先看呼叫端的變數會不會被改寫

一般參數採傳值。傳入 class 物件時，複製的是參考：方法能改物件成員，但把參數重新指定到另一個物件，通常不會改寫呼叫端的變數。

| 宣告 | 呼叫前需要初始化 | 方法中的用途 |
| --- | --- | --- |
| 一般參數 | 是 | 使用值或參考的副本 |
| `ref` | 是 | 讀取並改寫呼叫端變數 |
| `out` | 否 | 每條正常返回路徑都必須指定結果 |
| `in` | 是 | 以唯讀參考使用；不能重新指定參數 |

## 一個輸入、一個輸出

~~~csharp title="Program.cs"
int count = 1;
Increment(ref count);
if (int.TryParse("42", out int parsed))
{
    Show(in parsed);
}
Console.WriteLine(count);

static void Increment(ref int value) => value++;
static void Show(in int value) => Console.WriteLine(value);
~~~

預期輸出：

~~~text
42
2
~~~

`TryParse` 透過回傳值表示成功，再用 `out` 傳回解析結果。若資料不一定合法，這通常比用例外控制一般流程更直接。

## ref 不是 Go 指標的完全等價物

`ref` 是受語言規則約束的變數別名，不提供一般指標運算。`in` 也不是深層不可變：若參數是參考型別，仍可能修改該物件的可變成員。

`in` 常用於較大的 struct，但編譯器可能產生暫存值或防禦性複製，需量測後再宣稱效能收益。`async` 方法不能宣告 `ref`、`out`、`in` 參數；多個非同步結果可以使用 tuple 或結果型別。
