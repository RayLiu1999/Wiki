---
title: "struct、record struct、相等性與 boxing"
description: "分清值複製、值相等與裝箱，理解型別選擇如何影響資料語意。"
articleId: "csharp-structs-equality"
topic: "csharp"
category: "types"
order: 27
tags: ["struct、record struct、相等性與 boxing", "csharp"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["csharp-value-reference-types", "csharp-records-invariants"]
relatedArticles: ["dotnet-gc-memory"]
applicableVersions: "以 C# 14／.NET 10 說明；框架與供應商差異見內文。"
verifiedWith: "完整 Console 範例納入 test:examples；沒有宣稱完成金額領域模型或配置量基準。"
lastReviewed: "2026-10-08"
takeaway: "分清值複製、值相等與裝箱，理解型別選擇如何影響資料語意。"
noteDates: []
sources: [{"title": "結構型別", "url": "https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/struct"}, {"title": "裝箱與取消裝箱", "url": "https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/types/boxing-and-unboxing"}]
---

## 本篇的價格背景

我們想用小型價格值比較兩筆報價。本篇的 `UnitPrice` 只示範值語意，尚未包含幣別、負值檢查或金額上限，不能直接當成完整訂單金額模型。商品本身有持續的身分；報價值則按內容比較。

## 複製與相等是兩個問題

struct 指派會複製值；若其中有參考欄位，複製後仍指向相同物件。record struct 產生按成員比較的相等性，class 或 record class 的選擇又有不同身分與複製語意。`readonly` 限制值本身的修改，不會把欄位指向的集合變成不可變。

## 完整的最小範例

~~~csharp
var price = new UnitPrice(120m);
var other = new UnitPrice(120m);
Console.WriteLine(price == other);
object boxed = price;
price = price with { Value = 100m };
Console.WriteLine(((UnitPrice)boxed).Value);
Console.WriteLine(price.Value);
Console.WriteLine(default(UnitPrice).Value);

public readonly record struct UnitPrice(decimal Value);
~~~

預期輸出：

~~~text
True
120
100
0
~~~

## boxing 與預設狀態

把值型別當成 object 使用會裝箱；範例中的 boxed 保存當時的值，後來替換 price 不會一起變動。介面使用也可能裝箱，泛型可以保留型別，但實際配置量應以工作負載與工具量測。

`default(UnitPrice)` 是零值。即使自訂建構子檢查數量，struct 仍有預設狀態，因此必須決定零值是否合法、在哪個邊界驗證，或改採更適合的型別。`required`、nullable 警告與 init 都有各自範圍。

## 在電商中如何選擇

| 資料 | 先考慮的語意 |
| --- | --- |
| 商品 Entity | 身分延續，名稱或售價可以變動 |
| 金額與幣別 | 按內容比較，運算需核對相同幣別與捨入規則 |
| API DTO | 外部格式與驗證，不能直接暴露所有領域修改入口 |

大型 struct 的複製成本、可變 struct 的行為與 boxing 都會增加理解成本。先選正確資料語意，再透過量測評估效能，避免把值型別一律等同於 stack 配置。
