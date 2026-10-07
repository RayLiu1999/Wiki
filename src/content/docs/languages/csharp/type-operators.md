---
title: "typeof、nameof、default 與泛型"
description: "依需求取得型別、名稱或預設值，理解 GetType 與 sizeof 的邊界。"
articleId: "csharp-type-operators"
topic: "csharp"
category: "types"
order: 17
tags: ["typeof", "nameof", "GetType", "default", "sizeof", "泛型", "generics"]
difficulty: "intermediate"
prerequisites: ["csharp-variables", "csharp-classes"]
relatedArticles: ["csharp-collections", "aspnet-core-api-styles-aot"]
applicableVersions: "以 .NET 10 / C# 14 核對；個別語法與 API 的最低版本見內文。"
verifiedWith: ".NET SDK 10.0.105 / net10.0 / C# 14；完整 Program.cs 已納入編譯與輸出驗證。"
lastReviewed: "2026-10-07"
takeaway: "typeof 看指定型別，GetType 看執行時物件；nameof 產生名稱，不是反射查詢。"
noteDates: ["2026-05-21", "2026-05-25", "2026-06-03"]
sources: [{"title": "Microsoft Learn：型別運算子", "url": "https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/type-testing-and-cast"}, {"title": "Microsoft Learn：nameof", "url": "https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/nameof"}, {"title": "Microsoft Learn：sizeof", "url": "https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/sizeof"}]
---

## 用途不同，別互相代替

| 表達式 | 意義 |
| --- | --- |
| `typeof(List<int>)` | 指定型別的 `System.Type` |
| `value.GetType()` | 非空物件的執行時型別 |
| `nameof(total)` | 編譯期產生字串 `total`，重構時能跟著改名 |
| `default(int)` / `default(T)` | 型別的預設值；參考型別通常為 null |
| `sizeof(int)` | int 的儲存大小；不是整個物件圖的記憶體用量 |

## 保留型別資訊的泛型

~~~csharp title="Program.cs"
int total = default;
object boxed = 42;
Console.WriteLine(nameof(total));
Console.WriteLine(total);
Console.WriteLine(typeof(int) == boxed.GetType());
Console.WriteLine(sizeof(int));
Console.WriteLine(Echo("泛型保留字串型別"));

static T Echo<T>(T value) => value;
~~~

預期輸出：

~~~text
total
0
True
4
泛型保留字串型別
~~~

泛型讓 `List<T>`、`Dictionary<TKey, TValue>` 與可重用方法保有型別檢查。必要時使用 `where T : ...` 表達實際需要的能力，而不是到處轉成 object 再做強制轉型。

## 容易混淆的邊界

`GetType()` 對 null 呼叫會失敗；`typeof` 不需要先建立實例。`default` 不代表商業上有效，例如訂單數量 0 可能不合法。`sizeof` 用於特定內建型別可以在安全程式碼使用；其他 unmanaged 型別的情況可能需要 unsafe，不能用它估算 class 及其子物件的大小。

動態反射與組件掃描牽涉 trimming、Native AOT 的可達性分析；不是所有 `typeof` 或 `nameof` 的使用都會造成 AOT 問題。
