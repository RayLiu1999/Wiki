---
title: "值型別、參考型別與記憶體佈局"
description: "深入解析 Stack 與 Heap 分配、Struct 防禦性複製開銷、裝箱陷阱與高吞吐極限優化實務。"
articleId: "csharp-value-reference-types"
topic: "csharp"
category: "syntax-runtime"
order: 2
tags: ["C#", "值型別", "參考型別", "記憶體", "Struct", "Boxing", "GC 效能"]
articleType: "deep-dive"
prerequisites: ["csharp-syntax-traps"]
relatedArticles: ["csharp-collections-linq", "csharp-async-await"]
applicableVersions: "C# 12+ / 14、.NET 8+ / .NET 10"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "小型不可變資料（<= 16 bytes）優先使用 readonly struct；方法傳遞大型 struct 必須搭配 in 關鍵字避免隱形拷貝。"
sources:
  - title: "Microsoft Learn：結構型別 (C# 參考)"
    url: "https://learn.microsoft.com/zh-tw/dotnet/csharp/language-reference/builtin-types/struct"
  - title: "Microsoft Learn：撰寫安全的有效率 C# 程式碼"
    url: "https://learn.microsoft.com/zh-tw/dotnet/csharp/write-safe-efficient-code"
---

## 案發現場

在高併發商品報價 API 中，每秒請求吞吐破萬。監控發現記憶體分配率（Allocation Rate）高達每秒數百 MB，造成 CLR 頻繁觸發 Gen 0 / Gen 1 垃圾回收（GC），API 的 p99 延遲瞬間飆升至 800ms 以上。工程師試圖將核心資料結構全數改為 `struct` 期望消除 GC，結果 CPU 使用率反而大幅飆高！

這正是因為忽略了值型別（Value Type）的傳值拷貝特性，觸發了編譯器層級的「隱形防禦性複製（Defensive Copy）」與「裝箱（Boxing）」災難。

## 致命反模式 vs. 正確解法

### 記憶體佈局直覺對照

```text
Stack (執行緒棧)       : 速度極快、隨方法返回立即歸還，不需 GC 介入
Managed Heap (託管堆積) : 需指派記憶體位址、由 GC 標記-清除回收，有停頓代價
```

### 坑一：大型 Struct 傳值造成的隱形記憶體拷貝

若 `struct` 體積較大（例如超過 32 位元組），每次作為方法參數傳遞時，CLR 都會在 CPU 暫存器或 Stack 上完整複製每一筆位元組。

~~~csharp title="Program.cs"
// ✅ Good：宣告為 readonly struct 並透過 in 傳遞參照，零拷貝且執行期不可竄改
var point = new GeoPoint(10, 20);
ProcessLocation(in point);
Console.WriteLine($"座標計算: {point.X}, {point.Y}");
Console.WriteLine("防禦性複製已避免");

static void ProcessLocation(in GeoPoint location)
{
    // location 透過記憶體指標傳遞，不產生整筆 struct 的值拷貝
    _ = location.X + location.Y;
}

public readonly struct GeoPoint(double x, double y)
{
    public double X { get; } = x;
    public double Y { get; } = y;
}
~~~

預期輸出：
```text
座標計算: 10, 20
防禦性複製已避免
```

### 坑二：隱形裝箱（Boxing）引發的託管堆積配置

當把 `struct` 當作 `object` 或透過未經泛型約束的介面傳遞時，CLR 會強制在 Heap 上配置一個包裝物件，失去值型別的免 GC 優勢：

```csharp
// 💣 Bad：強制將值型別轉為 object 或介面，觸發隱形 Boxing 配置
struct OrderId { public int Value; }
object boxed = new OrderId { Value = 42 }; // 發生 Boxing，配置 Heap 記憶體！

// ✅ Good：使用泛型約束，避免裝箱
public void Process<T>(T id) where T : struct, IEquatable<T> { ... }
```

## 踩坑與避坑指南

* **微軟官方 Struct 設計準則**：
  1. 邏輯上代表單一純量值（類似 int、double）。
  2. 記憶體佔用小於或等於 16 位元組。
  3. 物件生命週期短暫。
  4. 物件具備不可變性（務必加上 `readonly struct`）。
* **避坑原則（什麼時候千萬不要用 Struct？）**：
  * 物件生命週期需要橫跨多個非同步 `await` 斷點時，不要宣告 `ref struct`（無法穿越 await）。
  * 資料模型具有繼承體系，或體積大於 64 bytes 時，堅持使用 `class` 或 `record class`。

## 線上排查指令

若懷疑系統發生大量 Boxing 或 GC 停頓：

```bash
# 監控每秒 GC 次數與記憶體分配率（alloc-rate 飆高代表有大量小物件配置）
dotnet-counters monitor System.Runtime --counters alloc-rate,gc-count,gc-pause-ratio

# 取樣排查熱路徑分配（收集 30 秒 trace 檔並用 dotnet-trace 分析調用堆疊）
dotnet-trace collect --process-id <PID> --providers Microsoft-DotNETCore-SampleProfiler
```
