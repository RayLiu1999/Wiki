---
title: "C# 後端語法陷阱速查：金額、null、record 與相等性"
description: "整理電商後端最常踩到的 C# 語法陷阱：金額用錯型別與捨入、record 的 with 只複製一層、可為 null 的參考型別只在編譯期檢查，以及相等性與閉包。"
articleId: "csharp-syntax-traps"
topic: "csharp"
category: "syntax-runtime"
order: 1
tags: ["C#", "decimal", "MidpointRounding", "record", "Nullable", "相等性"]
articleType: "reference"
difficulty: "beginner"
prerequisites: []
relatedArticles: ["csharp-value-reference-types", "csharp-collections-linq", "architecture-domain-modeling"]
applicableVersions: "C# 12～14、.NET 8～10；RespectNullableAnnotations 需 .NET 9 以上。"
lastReviewed: "2026-10-21"
takeaway: "金額一律用 decimal 並明確指定捨入方式；record 的 with 只複製一層；可為 null 的參考型別只是編譯期提示，外部輸入仍要在執行期檢查。"
omitSections:
  - section: "運作原理"
    reason: "本篇是速查，各條陷阱彼此獨立，原理直接寫在每一條的說明裡。"
sources:
  - title: "Microsoft Learn：浮點數值型別"
    url: "https://learn.microsoft.com/dotnet/csharp/language-reference/builtin-types/floating-point-numeric-types"
  - title: "Microsoft Learn：Math.Round 與 MidpointRounding"
    url: "https://learn.microsoft.com/dotnet/api/system.math.round"
  - title: "Microsoft Learn：Records（with 運算式）"
    url: "https://learn.microsoft.com/dotnet/csharp/language-reference/builtin-types/record"
  - title: "Microsoft Learn：可為 Null 的參考型別"
    url: "https://learn.microsoft.com/dotnet/csharp/nullable-references"
  - title: "Microsoft Learn：System.Text.Json 的必要屬性與 nullable 註記"
    url: "https://learn.microsoft.com/dotnet/standard/serialization/system-text-json/nullable-annotations"
---

## 這是什麼

這篇整理寫電商後端時，C# 最容易「編譯會過、上線才出錯」的幾個地方。它們都不是複雜的語法，而是語言的預設行為和直覺不一樣：金額算出來差一塊錢、改了副本卻動到原本的資料、編譯器說不會是 null 結果還是 null。

每一條都獨立，可以直接跳到需要的段落。語法本身的入門請先讀 [Microsoft Learn 的 C# 導覽](https://learn.microsoft.com/dotnet/csharp/tour-of-csharp/)。

## 常見錯誤與正確寫法

### 1. 金額用 double，或忽略捨入方式

`double` 以二進位儲存，像 0.1 這樣的十進位小數無法精確表示，多次加總後會出現微小誤差。`decimal` 以十進位儲存，適合金額。

但只換成 `decimal` 還不夠。`Math.Round` 的預設捨入方式是「四捨六入五成雙」（`MidpointRounding.ToEven`，又稱銀行家捨入）：剛好在 .5 時，捨入到偶數。所以 `Math.Round(2.5m)` 是 2，不是 3。

```csharp
decimal unitPrice = 19.99m;
decimal discountRate = 0.15m;

// 錯：用預設捨入，剛好 .5 的情況會往偶數靠
decimal wrong = Math.Round(unitPrice * (1 - discountRate), 0);

// 對：明確寫出業務規則要的捨入方式（這裡是一般的四捨五入）
decimal finalPrice = Math.Round(unitPrice * (1 - discountRate), 0, MidpointRounding.AwayFromZero);
```

捨入方式是業務規則，要和財務確認，並在程式裡寫明，不要依賴預設值。另外，捨入的時機也會影響結果：每一行先捨入再加總，和加總後再捨入，金額可能差 1 元。

### 2. 以為 record 的 with 會複製整個物件

`with` 會建立新的 record，但只複製「第一層」的欄位。如果欄位是 `List<T>` 這種參考型別，新舊兩個 record 會指向同一個 List。

```csharp
public record OrderDraft(string BuyerId, List<string> Items);

var original = new OrderDraft("A", new List<string> { "保溫杯" });
var promo = original with { BuyerId = "B" };
promo.Items.Add("贈品");

// original.Items 也多了「贈品」：兩者共用同一個 List
```

正確做法是讓集合本身也不可變，例如使用 `ImmutableList<T>` 或 `IReadOnlyList<T>`；需要修改時建立新的集合：

```csharp
using System.Collections.Immutable;

public record OrderDraft(string BuyerId, ImmutableList<string> Items);

var promo = original with { Items = original.Items.Add("贈品") }; // 原本的 Items 不變
```

### 3. 以為開了 Nullable 就不會有 null

`<Nullable>enable</Nullable>` 讓編譯器在編譯期提醒你哪裡可能是 null，但它不會在執行期擋住任何東西。最常見的漏洞是 JSON 反序列化：請求少了某個欄位，屬性就會是 null，即使型別宣告為 `string`。

`= null!` 是告訴編譯器「相信我，不會是 null」，等於把提醒關掉。改用 `required`，讓缺少欄位時在反序列化階段就失敗：

```csharp
public class CreateCustomerRequest
{
    // System.Text.Json 會要求 JSON 一定要有這個欄位，缺少時丟出 JsonException
    public required string Nickname { get; init; }
}
```

.NET 9 起，`JsonSerializerOptions.RespectNullableAnnotations = true` 還能讓「欄位存在但值是 null」也被擋下。ASP.NET Core 會把反序列化失敗轉成 400 回應，不會讓 null 流進業務邏輯。

### 4. 覆寫 Equals 卻沒覆寫 GetHashCode

`Dictionary` 和 `HashSet` 先用 `GetHashCode` 找位置，再用 `Equals` 比較。只覆寫 `Equals`，兩個「相等」的物件會落在不同位置，查不到資料。

最簡單的做法是用 `record` 或 `readonly record struct`，編譯器會一起產生兩者。另外，當成字典鍵的物件不要在放進去之後修改它的欄位，否則雜湊值改變，也會查不到。

### 5. for 迴圈裡的 lambda 捕獲到同一個變數

`foreach` 每一圈都是新變數，沒有問題；但 `for` 迴圈的 `i` 只有一個，lambda 捕獲的是變數本身，不是當下的值。

```csharp
var actions = new List<Action>();
for (var i = 0; i < 3; i++)
{
    var index = i;                       // 先複製到這一圈自己的變數
    actions.Add(() => Console.WriteLine(index));
}
```

不複製的話，三個 lambda 執行時都會印出 3。

### 6. enum 的預設值是 0

沒有被設定的 enum 欄位值是 0。如果 0 對應到有意義的狀態（例如 `Paid = 0`），漏設值的訂單就會被當成已付款。讓 0 代表「未知」或「未設定」，並在驗證時拒絕它：

```csharp
public enum OrderStatus
{
    Unknown = 0,       // 沒設定時的預設值，業務上不合法
    PendingPayment = 1,
    Paid = 2,
}
```

## 使用邊界

- `decimal` 比 `double` 慢，但金額計算的量通常不大，正確性優先。科學計算、統計或座標才用 `double`。
- 不可變集合每次修改都會建立新的版本，適合「建立後很少改」的資料，例如訂單草稿；需要頻繁增刪的暫存資料，用一般 List 並避免共用。
- `required` 與 `RespectNullableAnnotations` 只保護反序列化的入口。從資料庫讀出或其他來源取得的資料，仍要依情況檢查。
- 型別在記憶體中如何複製、何時用 struct，見 [值型別與參考型別](/languages/csharp/value-reference-types/)。
