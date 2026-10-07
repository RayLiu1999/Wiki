---
title: "擴充方法與 Attribute"
description: "區分呼叫語法上的擴充與宣告上的中繼資料，避免誤以為它們會自動改變行為。"
articleId: "csharp-extensions-attributes"
topic: "csharp"
category: "oop"
order: 19
tags: ["this", "extension method", "擴充方法", "Attribute", "反射"]
difficulty: "intermediate"
prerequisites: ["csharp-methods", "csharp-class-design"]
relatedArticles: ["aspnet-core-model-binding", "aspnet-core-api-styles-aot"]
applicableVersions: "以 .NET 10 / C# 14 核對；個別語法與 API 的最低版本見內文。"
verifiedWith: ".NET SDK 10.0.105 / net10.0 / C# 14；完整 Program.cs 已納入編譯與輸出驗證。"
lastReviewed: "2026-10-07"
takeaway: "擴充方法仍是靜態方法；Attribute 只有被框架或程式讀取時才產生效果。"
noteDates: ["2026-05-27", "2026-05-28", "2026-06-24"]
sources: [{"title": "Microsoft Learn：擴充成員", "url": "https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/classes-and-structs/extension-methods"}, {"title": "Microsoft Learn：Attribute", "url": "https://learn.microsoft.com/en-us/dotnet/csharp/advanced-topics/reflection-and-attributes/"}]
---

## 用 this 擴充既有型別的呼叫方式

傳統擴充方法宣告在靜態類別中，第一個參數用 `this` 標示接收型別。呼叫看似實例方法，實際仍是靜態方法；無法取得型別的 private 成員，也不會修改原型別的定義。C# 14 另外提供 extension blocks，既有 `this` 寫法仍可使用。

## 讀取宣告上的資料

~~~csharp title="Program.cs"
using System.Reflection;

Console.WriteLine("Ada".Greet());
Console.WriteLine(typeof(Job).GetCustomAttribute<NoteAttribute>()?.Message);

static class GreetingExtensions
{
    public static string Greet(this string name) => $"Hello, {name}";
}

[Note("每日排程")]
sealed class Job { }

[AttributeUsage(AttributeTargets.Class)]
sealed class NoteAttribute : Attribute
{
    public NoteAttribute(string message) => Message = message;
    public string Message { get; }
}
~~~

預期輸出：

~~~text
Hello, Ada
每日排程
~~~

`Attribute` 本身是中繼資料，不會自己執行驗證或排程。範例用反射讀取 `NoteAttribute`；ASP.NET Core 則由框架解讀 `[FromBody]`、`[Authorize]` 等宣告。

## 避免藏住重要行為

擴充方法適合可讀的小操作；資料庫查詢、交易或外部呼叫應讓成本在命名與介面上可見。反射讀取 Attribute 的流程若部署到 Native AOT，需確認 metadata 保留、來源產生器或明確註冊方式，不能只用一般 JIT 測試就宣稱相容。
