---
title: "C# 高效生產者消費者模式：System.Threading.Channels 與背壓實戰"
description: "深入剖析行程內非同步佇列 Channels 的高效無鎖設計、背壓控制策略（Backpressure），以及正確關閉管線最佳實務。"
articleId: "csharp-channels"
topic: "csharp"
category: "async-threading"
order: 5
tags: ["C#", "Channels", "生產者消費者", "背壓", "非同步", "高吞吐"]
articleType: "deep-dive"
prerequisites: ["csharp-async-await"]
relatedArticles: ["csharp-valuetask-tcs", "csharp-thread-safety"]
applicableVersions: "C# 10+ / 14、.NET 6+ / .NET 10"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "行程內解耦首選 BoundedChannel 並設定有界容量以實現背壓；消費者搭配 await foreach，生產結束必須顯式 Complete()。"
sources:
  - title: "Microsoft .NET Blog：An Introduction to System.Threading.Channels"
    url: "https://devblogs.microsoft.com/dotnet/an-introduction-to-system-threading-channels/"
---

## 案發現場

促銷大促期間，結帳微服務在每筆訂單完成後需要非同步寫入審計軌跡與推送通知。團隊採用了 `ConcurrentQueue` 作為內部緩衝，並以定時 Worker 批次寫入。然而下游外部推播服務因網路抖動出現 10 秒延遲，生產端的訂單流量卻以每秒 5,000 筆持續湧入。

緩衝佇列在幾分鐘內暴增至數百萬筆物件，行程記憶體直線衝破 4GB 上限，微服務觸發 OOM（Out Of Memory）直接重啟，造成記憶體中大量未處理的推播事件永久遺失。

## 致命反模式 vs. 正確解法

```text
【BoundedChannel 背壓機制 (Backpressure)】
生產者 (API Request) ──► 寫入通道 ──► [ 容量上限: 100 ] ──► 消費者 (背景 Worker)
                                            │
                                  (佇列滿載時非同步等待)
                                 生產者暫停，反推上游限流防崩潰
```

### 坑一：使用無界佇列，缺乏流量背壓防護

```csharp
// 💣 Bad：無界佇列在下游堵塞時會無限制吞噬記憶體，直到 OOM 崩潰
private readonly ConcurrentQueue<LogItem> _queue = new();
```

### 坑二：遺漏 Complete() 造成消費者死等

消費者端使用 `ReadAllAsync()` 時，若生產者在結束時未呼叫 `Writer.Complete()`，消費者的 `await foreach` 迴圈將永遠無法正常結束退出。

~~~csharp title="Program.cs"
// ✅ Good：有界佇列提供背壓防護，並優雅消費
using System.Threading.Channels;

var options = new BoundedChannelOptions(capacity: 2)
{
    FullMode = BoundedChannelFullMode.Wait, // 滿載時生產者非同步等待（背壓）
    SingleWriter = true,
    SingleReader = true
};
var channel = Channel.CreateBounded<string>(options);

// 啟動消費者 Worker
var consumerTask = Task.Run(async () =>
{
    await foreach (var item in channel.Reader.ReadAllAsync())
    {
        Console.WriteLine($"消費事件: {item}");
    }
});

// 生產者寫入事件
await channel.Writer.WriteAsync("訂單付款完成");
await channel.Writer.WriteAsync("庫存扣減通知");

// 生產完畢，明確告知管線關閉
channel.Writer.Complete();

// 等待所有排隊事件消費完畢
await consumerTask;
Console.WriteLine("所有通道事件處理完畢");
~~~

預期輸出：
```text
消費事件: 訂單付款完成
消費事件: 庫存扣減通知
所有通道事件處理完畢
```

## 踩坑與避坑指南

* **佇列滿載策略（BoundedChannelFullMode）**：
  * `Wait`（預設）：生產者以非同步方式等待空位，保障資料零遺失，但會將延遲反推給上游調用方（背壓）。
  * `DropOldest` / `DropWrite`：丟棄最舊或最新資料。適合「可遺失的高頻監控指標」或「最新股價推播」，以丟包換取系統存活。
* **單一讀寫者優化（SingleWriter / SingleReader）**：若業務確認只有單一 Producer 或 Consumer，應將此選項設為 `true`。Channel 會切換為專屬的高效無鎖演算法，進一步減少內部 CAS 開銷。
* **避坑原則（什麼時候千萬不要用 Channels？）**：
  * **跨伺服器節點的非同步解耦**：`System.Threading.Channels` 是純**記憶體內（In-Process）**佇列。若微服務重啟、當機，記憶體內的事件會立即遺失。需要「跨伺服器可靠投遞」、「持久化落地」或「水平分散式消費」的任務，必須選用 RabbitMQ、Kafka 等外部訊息中間件。

## 線上排查指令

監測行程內記憶體與執行緒狀況：

```bash
# 1. 抓取行程 CoreDump
dotnet-dump collect -p $(pgrep -n -f "dotnet.*MyService") -o dump.dmp

# 2. 檢視堆積中積壓的 Channel 與佇列項目數量
dotnet-dump analyze dump.dmp
> dumpheap -stat -type System.Threading.Channels
```
