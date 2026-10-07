---
title: "record、init、with 與有效狀態"
description: "用值相等性與型別封裝資料規則，理解 init 和淺拷貝不代表深層不可變。"
articleId: "csharp-records-invariants"
topic: "csharp"
category: "types"
order: 20
tags: ["class", "record", "set", "init", "new()", "with", "淺拷貝", "不變量", "非法狀態"]
difficulty: "intermediate"
prerequisites: ["csharp-classes", "csharp-value-reference-types"]
relatedArticles: ["architecture-domain-modeling", "engineering-business-tests"]
applicableVersions: "以 .NET 10 / C# 14 核對；個別語法與 API 的最低版本見內文。"
verifiedWith: ".NET SDK 10.0.105 / net10.0 / C# 14；完整 Program.cs 已納入編譯與輸出驗證。"
lastReviewed: "2026-10-07"
takeaway: "record 提供值相等性與便利複製；有效狀態與內部集合仍需要你設計。"
noteDates: ["2026-05-22", "2026-06-01"]
sources: [{"title": "Microsoft Learn：record", "url": "https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/record"}, {"title": "Microsoft Learn：init", "url": "https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/init"}]
---

## 依資料意義選型別

class 預設以參考識別判斷相等；record class 提供由成員組成的值相等性。record struct 是值型別。`set` 可在建立後改寫屬性；`init` 限制一般呼叫端在初始化階段指定，卻不會凍結屬性指向的集合。

目標型別 `new()` 自 C# 9 起，從左側推斷型別。它只是簡化建立語法，不改變建構子或配置行為。

## with 共用參考欄位

~~~csharp title="Program.cs"
List<string> tags = new() { "C#" };
var original = new Note("原始筆記", tags);
var copy = original with { Title = "副本" };
copy.Tags.Add("DDD");
Console.WriteLine(original.Title);
Console.WriteLine(string.Join(", ", original.Tags));
var quantity = new PositiveQuantity(2);
Console.WriteLine(quantity.Value);

record Note(string Title, List<string> Tags);

sealed record PositiveQuantity
{
    public PositiveQuantity(int value)
    {
        if (value < 1) throw new ArgumentOutOfRangeException(nameof(value));
        Value = value;
    }
    public int Value { get; }
}
~~~

預期輸出：

~~~text
原始筆記
C#, DDD
2
~~~

`with` 產生淺拷貝，兩個 Note 的 Tags 仍指向同一個 List。struct 複製其欄位值時，參考欄位同樣只是複製參考；不會自動把整棵物件圖深拷貝。

## 在邊界建立有效資料

PositiveQuantity 的公開建構子拒絕小於 1 的值，Value 只讀，正常呼叫端不能用物件初始化或 `with` 任意改成 0。不可變集合、複製集合或封裝修改方法，需要依使用情境選擇。

並非所有 record 都適合當 Value Object。集合的相等性、允許的建構入口、序列化與 ORM 行為，都需要一起設計；避免只有外層 Validator 驗證，內部仍能建立非法狀態。
