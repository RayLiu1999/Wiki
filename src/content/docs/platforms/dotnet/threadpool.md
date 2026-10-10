---
title: ".NET ThreadPool 飢餓防範與爬山演算法調校"
description: "深入剖析 ThreadPool 工作竊取機制、Sync-over-Async 引發的執行緒飢餓災難、Hill-Climbing 注入延遲與 SetMinThreads 調校指南。"
articleId: "dotnet-threadpool"
topic: "dotnet"
category: "runtime-performance"
order: 2
tags: [".NET", "ThreadPool", "執行緒池飢餓", "Hill-Climbing", "並行效能", "效能調校"]
articleType: "deep-dive"
prerequisites: ["csharp-async-await"]
relatedArticles: ["dotnet-gc-memory", "dotnet-profiling"]
applicableVersions: ".NET 8 / .NET 10、C# 12+ / 14"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "杜絕一切在非同步任務上的同步阻塞；針對可預期的秒殺流量突波，合理提高 MinThreads 繞過爬山演算法冷注入瓶頸。"
sources:
  - title: "Microsoft Learn：Managed 執行緒集區"
    url: "https://learn.microsoft.com/zh-tw/dotnet/standard/threading/the-managed-thread-pool"
  - title: "Microsoft .NET Blog：Performance Improvements in .NET ThreadPool"
    url: "https://devblogs.microsoft.com/dotnet/performance-improvements-in-net-8/"
---

## 案發現場

某電商秒殺開跑瞬間，流量從 500 QPS 衝至 2,000 QPS。出乎意料的是，伺服器 CPU 使用率僅有 18%，但所有 API 延遲卻由 15ms 斷崖式飆升至 8,000ms，閘道器（Gateway）被大批 504 Gateway Timeout 淹沒，服務呈現「看似閒置卻完全卡死」的怪異現象。

排查堆疊發現：系統中某處共用程式碼使用了 `.GetAwaiter().GetResult()`，突波湧入時迅速佔滿了現有 ThreadPool 執行緒；而 CLR 內部的**爬山演算法（Hill Climbing）**每秒僅保守注入 1~2 條新執行緒，在執行緒池枯竭（ThreadPool Starvation）下，所有非同步回呼排隊等待，導致整體服務癱瘓。

## 致命反模式 vs. 正確解法

```text
【ThreadPool 飢餓骨牌效應】
請求 A ──► 佔用 Thread 1 (同步阻塞 .Result 等待非同步子任務完成)
子任務 ──► 排入 ThreadPool 佇列，等待可用執行緒執行 Continuation
結果   ──► 執行緒池被借光，子任務排隊無法執行 ──► Thread 1 永不釋放 ──► 💥 全局卡死！
```

### 坑一：Sync-over-Async 阻塞執行緒池

在 Controller、Filter 或 Service 中呼叫非同步方法卻以 `.Result` 同步阻塞，是引發 ThreadPool 飢餓的頭號元兇。

### 坑二：把無窮長任務直接丟進 Task.Run

將長生命週期的背景監聽或輪詢任務直接塞入 `Task.Run`，會永遠剝奪該執行緒服務其他短任務的權利。

~~~csharp title="Program.cs"
// ✅ Good：查詢與配置 ThreadPool 最小執行緒數，消除突波注入瓶頸
ThreadPool.GetMinThreads(out int defaultMinWorker, out int defaultMinIocp);
Console.WriteLine($"預設 MinWorker: {defaultMinWorker}");

// 針對已知突發流量情境，將最小執行緒數調高至預期並行基準線（例如 100）
int targetMinWorker = Math.Max(defaultMinWorker, 100);
ThreadPool.SetMinThreads(targetMinWorker, defaultMinIocp);

ThreadPool.GetMinThreads(out int currentMinWorker, out _);
Console.WriteLine($"調整後 MinWorker: {currentMinWorker}");

// 長時間運行的背景任務應明確指定 LongRunning，指派獨立實體執行緒
var backgroundTask = Task.Factory.StartNew(() =>
{
    // 獨立於 ThreadPool 之外的 Dedicated Thread 執行，不佔用集區額度
    return "背景專屬執行緒運行完畢";
}, TaskCreationOptions.LongRunning);

string result = await backgroundTask;
Console.WriteLine(result);
~~~

預期輸出：
```text
預設 MinWorker: 8
調整後 MinWorker: 100
背景專屬執行緒運行完畢
```

## 踩坑與避坑指南

* **爬山演算法（Hill-Climbing）的盲點**：CLR 預設只有等於 CPU 核心數量的初始工作執行緒。突發流量時，演算法為了避免過度 Context Switch，每隔 500ms 僅謹慎建立 1 條執行緒。若有 200 個請求同時被阻塞，光是排隊建立執行緒就需要幾十秒！
* **`SetMinThreads` 不是越大越好**：不可盲目設定為 5,000 或 10,000。每條執行緒佔用記憶體（Linux 預設 1MB 虛擬棧），過多執行緒在 CPU 核心間劇烈切換會引發大量的 CPU 核心抖動與快取失效。
* **避坑原則（什麼時候千萬不要用 `TaskCreationOptions.LongRunning`？）**：
  * **短期高頻執行的微任務**：`LongRunning` 底層會請求作業系統建立全新的實體執行緒，建立成本遠高於 ThreadPool 分配。若每秒執行數百次短任務，會直接打爆 OS 執行緒上限。

## 線上排查指令

線上排查 ThreadPool 飢餓事故：

```bash
# 1. 即時監控執行緒總數與佇列積壓深度
dotnet-counters monitor System.Runtime --counters threadpool-thread-count,threadpool-queue-length,threadpool-completed-items-count

# 2. 抓取行程轉儲分析卡住的 ThreadPool 狀態
dotnet-dump analyze dump.dmp
> threadpool
> clrstack -all
```
