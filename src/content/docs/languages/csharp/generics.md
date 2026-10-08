---
title: "自訂泛型、約束與協變／逆變"
description: "用商品契約理解泛型如何保留型別，以及讀取與輸入方向的限制。"
articleId: "csharp-generics"
topic: "csharp"
category: "types"
order: 26
tags: ["generic", "where", "covariance", "contravariance", "商品"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["csharp-interfaces", "csharp-collections"]
relatedArticles: ["csharp-parameter-passing", "architecture-creation-patterns"]
applicableVersions: "以 C# 14／.NET 10 說明；框架與供應商差異見內文。"
verifiedWith: "已以 .NET SDK 10.0.105 編譯與執行完整 Console 範例，核對文章、來源與預期輸出。"
lastReviewed: "2026-10-08"
takeaway: "用商品契約理解泛型如何保留型別，以及讀取與輸入方向的限制。"
noteDates: []
sources: [{"title": "泛型約束", "url": "https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/generics/constraints-on-type-parameters"}, {"title": "協變與逆變", "url": "https://learn.microsoft.com/en-us/dotnet/standard/generics/covariance-and-contravariance"}]
---

## 本篇的商品背景

商品清單可以裝一般商品或電子商品。本篇只在一個 Console 程序中操作記憶體資料，沒有 API、資料庫或 Redis；目的是理解型別關係。`Product`、`DigitalProduct` 與 `IIdentified` 都在下面定義，是教學型別。

## 泛型與約束各自解決什麼

`T` 讓演算法保留呼叫者的型別；`where T : IIdentified` 告訴編譯器每個元素都具有 `Id`。它保證成員能力，商品名稱、價格和庫存的合法性仍需業務驗證。先有重複的演算法與清楚契約，再考慮泛型。

## 完整的最小範例

~~~csharp
List<DigitalProduct> products = [new(1, "電子書"), new(2, "課程")];
IEnumerable<Product> readable = products;
Console.WriteLine(string.Join(", ", GetIds(readable)));
Action<Product> log = product => Console.WriteLine(product.Name);
Action<DigitalProduct> logDigital = log;
logDigital(products[0]);

static IEnumerable<int> GetIds<T>(IEnumerable<T> items) where T : IIdentified
{
    foreach (T item in items) yield return item.Id;
}

public interface IIdentified { int Id { get; } }
public class Product(int id, string name) : IIdentified
{
    public int Id { get; } = id;
    public string Name { get; } = name;
}
public sealed class DigitalProduct(int id, string name) : Product(id, name);
~~~

預期輸出：

~~~text
1, 2
電子書
~~~

## 為什麼輸出與輸入的方向不同

`IEnumerable<out T>` 的元素由介面輸出，因此電子商品序列可以當成商品序列來讀。`Action<in T>` 接受輸入，因此能處理任何商品的函式，也能處理電子商品。這些變異轉換適用於參考型別；不要推論 `IEnumerable<int>` 可以當成 `IEnumerable<object>`。

`List<T>` 同時提供讀寫，不能把 `List<DigitalProduct>` 當成 `List<Product>`，否則呼叫端就能放入非電子商品。介面是否唯讀與底層物件是否可修改，也要分別判斷。

## 其他約束與選擇

`class`、`struct`、`notnull`、`unmanaged`、介面與 `new()` 各指定不同能力；`notnull` 在 nullable 分析中有警告語意，不能代替執行期輸入檢查。泛型參數的 `in/out` 表示變異方向，方法參數的 `in/out` 表示傳遞方式，閱讀時先辨識它們出現的位置。

回到電商：共通分頁結果可以保留商品 DTO 的型別；庫存扣減與付款轉換有不同規則，不需要為了共用名稱而包成同一個萬用泛型服務。
