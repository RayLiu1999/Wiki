---
title: "C# 集合實務：LINQ 延遲求值陷阱、容量預估與 Span 零拷貝"
description: "直擊電商後端常見的 LINQ 多次列舉災難、List 擴容隱形代價，以及運用 ReadOnlySpan 達成零配置字串解析。"
articleId: "csharp-collections-linq"
topic: "csharp"
category: "collections-memory"
order: 1
tags: ["C#", "LINQ", "Span", "集合", "效能優化", "記憶體"]
articleType: "deep-dive"
prerequisites: ["csharp-value-reference-types"]
relatedArticles: ["csharp-syntax-traps", "csharp-thread-safety"]
applicableVersions: "C# 10+ / 14、.NET 6+ / .NET 10"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "避免對 IEnumerable 多次列舉重跑查詢；集合已知大小應預給 capacity；高頻字串處理優先使用 ReadOnlySpan 達成零記憶體配置。"
sources:
  - title: "Microsoft Learn：Span<T> 與 Memory<T> 最佳做法"
    url: "https://learn.microsoft.com/zh-tw/dotnet/standard/memory-and-spans/"
  - title: "Microsoft Learn：LINQ 查詢簡介"
    url: "https://learn.microsoft.com/zh-tw/dotnet/csharp/linq/"
---

## 案發現場

某電商結帳中台在促銷上線後，資料庫吞吐量驟降且連線數異常暴增。排查日誌發現，同一筆訂單的促銷規則檢查與庫存校驗，竟對同一張資料表重複發起 3 次完全相同的 SQL 查詢；另一邊，發票解析批次服務中，每次剖析幾萬筆訂單編號時觸發巨量 Gen 0 GC，造成整體排程延遲數十分鐘。

禍根正是 LINQ 的**延遲求值（Deferred Execution）與多次列舉**，以及在字串解析中肆意使用 `Substring()` 產生了千萬個暫存字串物件。

## 致命反模式 vs. 正確解法

```text
【多次列舉事故】
IEnumerable 查詢 ──► 第一次 Count() ──► 執行 SQL 查詢 1 (耗時 20ms)
                 ──► 第二次 Any()   ──► 執行 SQL 查詢 2 (重複耗費連線與 CPU)
                 ──► 第三次 foreach ──► 執行 SQL 查詢 3 (連線池耗盡！)
```

### 坑一：對 IEnumerable 進行多次列舉

LINQ 的 `Where` 與 `Select` 僅是查詢藍圖，每次列舉（如 `Count()`、`Any()`、`foreach`）都會重新評估整條管線。

```csharp
// 💣 Bad：重複觸發 2 次資料來源列舉
public void CheckOrdersBad(IEnumerable<Order> orders)
{
    if (!orders.Any()) return; // 第一次查詢
    foreach (var o in orders) Process(o); // 第二次查詢！
}
```

### 坑二：List 預設容量擴容與 Substring 記憶體碎裂

`new List<int>()` 預設容量僅為 4，每超過容量 CLR 就會重新配置 2 倍大的新陣列並執行全量拷貝。字串解析時若使用 `Substring()` 亦會反覆配置全新字串。

~~~csharp title="Program.cs"
// ✅ Good：具體化快取查詢、預給容量與 ReadOnlySpan 零配置解析
var source = new[] { 10, 20, 30, 40 };

// 1. 具體化（Materialize）：避免多次列舉重跑
var materialized = source.Where(x => x > 15).ToArray();
Console.WriteLine($"符合筆數: {materialized.Length}");
Console.WriteLine($"首筆數據: {materialized[0]}");

// 2. 集合預估容量：避免 4 -> 8 -> 16 反覆擴容拷貝
var resultList = new List<int>(capacity: materialized.Length);
resultList.AddRange(materialized);

// 3. ReadOnlySpan 零拷貝解析字串（不產生額外堆積物件）
string rawHeader = "ORDER-20261010-999";
ReadOnlySpan<char> span = rawHeader.AsSpan();
ReadOnlySpan<char> orderDate = span.Slice(6, 8); // 僅切片指標，0 堆積配置
Console.WriteLine($"解析日期: {orderDate.ToString()}");
~~~

預期輸出：
```text
符合筆數: 3
首筆數據: 20
解析日期: 20261010
```

## 踩坑與避坑指南

* **`ConcurrentDictionary.GetOrAdd` 不是嚴格原子執行**：其工廠委派（factory delegate）在多執行緒高競爭下可能會被呼叫多次。若委派內有昂貴計算或遠端呼叫，應搭配 `Lazy<T>` 確保只計算一次。
* **Span<T> 的生命週期限制（ref struct）**：
  * `Span<T>` 只能存在於 Stack 上，**不可**作為 class 的欄位，也**不可**跨越 `async/await` 邊界（因為狀態機會被編譯器提升至 Heap 物件）。跨 async 邊界請改用 `Memory<T>` 或 `ReadOnlyMemory<T>`。
* **避坑原則（什麼時候千萬不要提早呼叫 `.ToList()`？）**：
  * **EF Core 查詢組裝階段**：在 Repository 尚未疊加分頁、排序或租戶過濾條件前，絕不可提早呼叫 `.ToList()`。提早具體化會導致 EF Core 無法將條件轉譯為 SQL，而將整張大資料表撈回記憶體本機運算（Client Evaluation），造成記憶體爆掉。

## 線上排查指令

監測集合擴容與大量字串短生命週期物件配置：

```bash
# 抓取記憶體即時分配剖析（Profiling），尋找配置量前三大類別
dotnet-trace collect -p $(pgrep -n -f "dotnet.*MyService") --providers Microsoft-DotNETCore-SampleProfiler,Microsoft-Windows-DotNETRuntime:0x1:4

# 在 dotnet-dump 中檢視佔用記憶體最多的字串與陣列數量
dotnet-dump analyze dump.dmp
> dumpheap -stat -type System.String
> dumpheap -stat -type System.Object[]
```
