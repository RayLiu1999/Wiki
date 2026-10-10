---
title: ".NET 反射效能治理：熱路徑優化與 Source Generator 實戰"
description: "深入剖析熱路徑反射效能黑洞、Expression Tree 編譯委派快取、C# Source Generator 編譯期生成，以及 Native AOT 剪裁防護。"
articleId: "dotnet-reflection"
topic: "dotnet"
category: "runtime-performance"
order: 4
tags: [".NET", "反射", "Reflection", "Expression Tree", "Source Generator", "Native AOT", "效能優化"]
articleType: "deep-dive"
prerequisites: ["csharp-syntax-traps"]
relatedArticles: ["dotnet-clr-jit", "dotnet-profiling"]
applicableVersions: ".NET 8 / .NET 10、C# 12+ / 14"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "熱路徑嚴禁裸調未快取的反射；高頻動態存取優先以 Expression Tree 編譯並快取為委派，現代架構首選 Source Generator 達成編譯期零開銷。"
sources:
  - title: "Microsoft Learn：.NET 中的反映 (Reflection)"
    url: "https://learn.microsoft.com/zh-tw/dotnet/framework/reflection-and-codedom/reflection"
  - title: "Microsoft Learn：來源產生器 (Source Generators)"
    url: "https://learn.microsoft.com/zh-tw/dotnet/csharp/roslyn-sdk/source-generators-overview"
---

## 案發現場

某微服務上線後，CPU 使用率長期徘徊在 90% 高檔，且隨著訂單筆數增加呈現非線性暴增。火焰圖（Flame Graph）剖析結果令人震驚：超過 60% 的 CPU 時間並非花在資料庫查詢或業務運算，而是集中在自製 DTO 轉換器內的 `type.GetProperties()` 與 `property.GetValue()`；另一端，團隊為了提升冷啟動嘗試啟用 Native AOT，上線後大量 JSON 欄位反序列化直接噴出 `MissingMetadataException` 導致結帳失敗。

根因在於：高頻呼叫鏈中肆意濫用**未快取的動態反射**，引發大量的 CLR 元資料查詢與裝箱（Boxing）；且未顧及現代 .NET 剪裁（Trimming）對動態型別的靜態程式碼分析要求。

## 致命反模式 vs. 正確解法

```text
【動態屬性存取效能開銷階梯】
原生直接存取               [ 1.0x ]  ──── 基準線 (極速)
編譯期 Source Generator    [ 1.0x ]  ──── 靜態程式碼生成，天然相容 Native AOT
Expression Tree 編譯委派   [ 1.2x ]  ──── 首次 Compile 慢，後續快取呼叫逼近原生
已快取 PropertyInfo.Invoke [ 35.0x ] ──── 涉及動態呼叫與裝箱
未快取 type.GetProperty()  [ 250.0x+] ─── 💥 每次進行中繼資料字串搜尋，毀滅性效能
```

### 坑一：在每秒數千次的熱路徑中重複呼叫 GetProperty

每次呼叫反射方法，CLR 都要在型別元資料表執行字串搜尋、存取控制檢查並產生裝箱暫存物件。

### 坑二：忽略 Native AOT 剪裁警告

Native AOT 在發布時會修剪未被明確靜態引用的程式碼。若動態以反射呼叫屬性，該屬性會被 IL 剪裁器視為死碼直接移除。

~~~csharp title="Program.cs"
// ✅ Good：利用 Expression Tree 將反射編譯為具型別委派並快取
using System.Collections.Concurrent;
using System.Linq.Expressions;
using System.Reflection;

var getter = PropertyAccessorCache.GetGetter<OrderDto>("TotalAmount");
var order = new OrderDto { TotalAmount = 999.50m };

object? value = getter(order);
Console.WriteLine($"透過快取委派讀取數值: {value}");

public sealed class OrderDto
{
    public decimal TotalAmount { get; set; }
}

public static class PropertyAccessorCache
{
    private static readonly ConcurrentDictionary<(Type, string), Func<object, object?>> _cache = new();

    public static Func<object, object?> GetGetter<T>(string propertyName)
    {
        return _cache.GetOrAdd((typeof(T), propertyName), key =>
        {
            PropertyInfo prop = key.Item1.GetProperty(key.Item2)
                ?? throw new InvalidOperationException($"屬性 {key.Item2} 不存在");

            // 建立 Expression: (object target) => ((T)target).Property
            ParameterExpression param = Expression.Parameter(typeof(object), "target");
            UnaryExpression castTarget = Expression.Convert(param, key.Item1);
            MemberExpression propertyAccess = Expression.Property(castTarget, prop);
            UnaryExpression castResult = Expression.Convert(propertyAccess, typeof(object));

            return Expression.Lambda<Func<object, object?>>(castResult, param).Compile();
        });
    }
}
~~~

預期輸出：
```text
透過快取委派讀取數值: 999.50
```

## 踩坑與避坑指南

* **現代首選：Source Generator（如 System.Text.Json）**：.NET 8+ / .NET 10 的 `System.Text.Json` 支援 `[JsonSerializable]` 屬性。在編譯期 Roslyn 就為 DTO 生成強型別序列化邏輯，兼具極致效能與 100% Native AOT 相容性。
* **快取粒度防護**：使用 `ConcurrentDictionary` 快取委派時，Key 必須複合型別與屬性名稱，避免跨型別混淆。
* **避坑原則（什麼時候千萬不要在熱路徑用反射？）**：
  * **批次迴圈內部或序列化核心鏈路**：若一筆請求需轉換 1,000 筆訂單明細，每次都裸調反射會引發上萬次元資料搜尋，使服務吞吐量下跌一個數量級。

## 線上排查指令

線上排查反射效能佔比：

```bash
# 1. 抓取 CPU 剖析 Trace
dotnet-trace collect -p $(pgrep -n -f "dotnet.*MyService") --providers Microsoft-DotNETCore-SampleProfiler

# 2. 以 dotnet-trace convert 轉為 Speedscope 格式檢視是否充斥 System.Reflection 呼叫棧
dotnet-trace convert trace.nettrace --format Speedscope
```
