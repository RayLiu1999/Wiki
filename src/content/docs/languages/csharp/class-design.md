---
title: "類別邊界、繼承與 partial"
description: "用 internal、sealed、virtual、base 與 partial 清楚表達類別的責任與擴充方式。"
articleId: "csharp-class-design"
topic: "csharp"
category: "oop"
order: 18
tags: ["internal", "partial", "sealed", "virtual", "override", "base", "建構子多載"]
difficulty: "intermediate"
prerequisites: ["csharp-classes", "csharp-interfaces"]
relatedArticles: ["csharp-extensions-attributes", "architecture-domain-modeling"]
applicableVersions: "以 .NET 10 / C# 14 核對；個別語法與 API 的最低版本見內文。"
verifiedWith: ".NET SDK 10.0.105 / net10.0 / C# 14；完整 Program.cs 已納入編譯與輸出驗證。"
lastReviewed: "2026-10-07"
takeaway: "存取範圍、繼承能力與檔案拆分是不同決策；每個修飾詞都應對應明確的用途。"
noteDates: ["2026-05-27", "2026-05-28", "2026-06-24"]
sources: [{"title": "Microsoft Learn：類別", "url": "https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/types/classes"}, {"title": "Microsoft Learn：partial 類別與方法", "url": "https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/classes-and-structs/partial-classes-and-methods"}]
---

## 分清三種邊界

`internal` 限制在同一組件內使用，不是同一資料夾。`sealed` 阻止類別再被繼承；`virtual` 允許衍生類別覆寫行為。`partial` 讓同一個型別的宣告分散在多處，編譯後仍是同一型別，常見於產生器與手寫程式的分工。

## 用 base 初始化共同狀態

~~~csharp title="Program.cs"
Report report = new OrderReport(42);
Console.WriteLine(report.Describe());

internal abstract class Report
{
    protected Report(string name) => Name = name;
    protected string Name { get; }
    public virtual string Describe() => Name;
}

internal sealed partial class OrderReport : Report
{
    public OrderReport() : this(0) { }
    public OrderReport(int id) : base("訂單") => Id = id;
    private int Id { get; }
}

internal sealed partial class OrderReport
{
    public override string Describe() => $"{Name}：{Id}";
}
~~~

預期輸出：

~~~text
訂單：42
~~~

`this(...)` 串接同類別建構子多載；`base(...)` 呼叫父類別建構子。建構子不會像 virtual 方法一樣被覆寫。範例的無參數版本只是展示多載；實際模型應決定 0 是否為有效識別碼。

## 為何不把所有行為設成 virtual

若子類可以繞過關鍵驗證，領域不變量就不再可靠。優先讓公開方法維持規則，再用介面或組合提供真正需要的替換點。`partial` 也不會自動改善責任過多的類別；拆成檔案後仍需檢查型別的職責。
