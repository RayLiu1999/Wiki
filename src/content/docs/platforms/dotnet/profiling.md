---
title: ".NET 生產環境效能診斷：CLI 診斷工具鏈實戰"
description: "深入剖析 dotnet-counters、dotnet-trace、dotnet-gcdump 與 dotnet-dump 四大生產排查利器之分工矩陣、容器 IPC 權限與實戰避坑。"
articleId: "dotnet-profiling"
topic: "dotnet"
category: "runtime-performance"
order: 5
tags: [".NET", "效能診斷", "dotnet-trace", "dotnet-dump", "dotnet-counters", "dotnet-gcdump", "生產排查"]
articleType: "deep-dive"
prerequisites: ["dotnet-gc-memory"]
relatedArticles: ["dotnet-threadpool", "dotnet-reflection"]
applicableVersions: ".NET 8 / .NET 10、Linux / macOS / Windows"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "即時監控看 dotnet-counters；CPU 瓶頸取樣用 dotnet-trace；記憶體分析優先選輕量 dotnet-gcdump，死鎖才採集完整 dotnet-dump。"
sources:
  - title: "Microsoft Learn：.NET 診斷工具概觀"
    url: "https://learn.microsoft.com/zh-tw/dotnet/core/diagnostics/"
  - title: "Microsoft Learn：dotnet-trace 效能分析公用程式"
    url: "https://learn.microsoft.com/zh-tw/dotnet/core/diagnostics/dotnet-trace"
---

## 案發現場

線上微服務在黑色星期五晚間突發 CPU 100% 飆高，API 全部逾時。因為生產環境嚴格遵守資安合規，無法安裝重型 IDE 也禁止開啟遠端偵錯埠；維運人員情急之下對一個佔用 12GB 記憶體的行程執行了完整 Memory Dump，不料磁碟 I/O 瞬間被打爆，寫入耗時 2 分鐘，直接觸發 Kubernetes Liveness 探針超時將 Pod 暴力重啟，關鍵事故現場瞬間灰飛煙滅。

根因在於：團隊對現代 .NET **非侵入式 CLI 診斷工具鏈**認識不足，未依故障情境選擇正確的採集代價（Overhead）工具。

## 致命反模式 vs. 正確解法

```text
【四大 .NET CLI 診斷工具代價與分工矩陣】
dotnet-counters (負擔 ~0%)   ──► 即時儀表板：GC 頻率、ThreadPool 深度、CPU 佔比
dotnet-trace    (負擔 1%~3%) ──► CPU 火焰圖：找出哪行程式碼在吃 CPU
dotnet-gcdump   (負擔極低)   ──► 輕量 Heap 快照：僅抓型別關係，防範 OOMKill
dotnet-dump     (需暫停行程) ──► 完整 CoreDump：死鎖、未處理例外與原生記憶體
```

### 坑一：記憶體排查直接盲目採集完整 Dump

完整 Dump 會複製所有虛擬記憶體頁面至硬碟，不僅暫停行程數十秒，更可能直接擠爆磁碟容量引發 Pod 崩潰。

### 坑二：排查 CPU 瓶頸使用全量事件追蹤

追蹤 CPU 應使用**取樣模式（Sample Profiler）**，而非捕捉每個分配事件，以控制損耗在 2% 以內。

~~~csharp title="Program.cs"
// ✅ Good：在程式碼中整合標準診斷計量（Metrics），供 CLI 工具監控
using System.Diagnostics.Metrics;

var meter = new Meter("DevWiki.Commerce", "1.0.0");
var orderCounter = meter.CreateCounter<long>("orders_completed", description: "累計完成訂單數");

// 模擬業務事件發布
for (int i = 0; i < 3; i++)
{
    orderCounter.Add(1, new KeyValuePair<string, object?>("status", "success"));
}

Console.WriteLine("業務指標已成功暴露至 Diagnostics IPC");
Console.WriteLine("可隨時透過 dotnet-counters 進行無侵入式採集");
~~~

預期輸出：
```text
業務指標已成功暴露至 Diagnostics IPC
可隨時透過 dotnet-counters 進行無侵入式採集
```

## 踩坑與避坑指南

* **Linux 容器內診斷必備條件**：
  * CLR 透過 `/tmp/dotnet-diagnostic-{PID}-socket` 建立跨行程 Unix Domain Socket 通訊。
  * 執行診斷工具的帳號必須與 .NET 行程擁有相同的使用者 ID（UID），且容器需具備 `SYS_PTRACE` 權限才能附加。
* **避坑原則（什麼時候千萬不要用 `dotnet-dump`？）**：
  * **當容器剩餘記憶體或磁碟低於 50% 時**：若行程本身已逼近容器 Memory Limit，下達 `dotnet-dump` 產生的暫存複製極易直接觸發 Linux cgroup OOMKilled。此時應優先使用僅數十 MB 的 `dotnet-gcdump`。

## 線上排查指令

四大工具現場實戰指令：

```bash
# 1. dotnet-counters：即時監看核心指標
dotnet-counters monitor System.Runtime --process-id <PID>

# 2. dotnet-trace：採集 30 秒 CPU 取樣並轉為火焰圖 Speedscope 格式
dotnet-trace collect -p <PID> --duration 00:00:30 --providers Microsoft-DotNETCore-SampleProfiler
dotnet-trace convert trace.nettrace --format Speedscope

# 3. dotnet-gcdump：快速擷取輕量級記憶體物件分佈
dotnet-gcdump collect -p <PID> -o heap.gcdump

# 4. dotnet-dump：抓取完整轉儲並分析死鎖
dotnet-dump collect -p <PID> -o crash.dmp
dotnet-dump analyze crash.dmp
> deadlocks
> clrstack -all
```
