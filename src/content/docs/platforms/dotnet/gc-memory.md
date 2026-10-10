---
title: ".NET GC 記憶體管理與容器 OOM 防禦"
description: "深入剖析 Gen 0/1/2 世代回收機制、LOH 碎裂災難、ArrayPool 借還優化，以及 Kubernetes 容器環境防範 OOMKilled 的核心設定。"
articleId: "dotnet-gc-memory"
topic: "dotnet"
category: "runtime-performance"
order: 1
tags: [".NET", "GC", "記憶體優化", "LOH", "ArrayPool", "Kubernetes", "OOMKilled"]
articleType: "deep-dive"
prerequisites: ["csharp-value-reference-types"]
relatedArticles: ["dotnet-threadpool", "dotnet-profiling"]
applicableVersions: ".NET 8 / .NET 10、C# 12+ / 14"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "高頻大型緩衝區（>= 85KB）一律使用 ArrayPool 杜絕 LOH 碎裂；容器環境務必明確設定 GCHeapHardLimit 或對齊 cgroup v2 限制防範 OOMKilled。"
sources:
  - title: "Microsoft Learn：記憶體管理與記憶體回收 (GC) 基本概念"
    url: "https://learn.microsoft.com/zh-tw/dotnet/standard/garbage-collection/fundamentals"
  - title: "Microsoft Learn：容器中的記憶體回收"
    url: "https://learn.microsoft.com/zh-tw/dotnet/core/run-time-config/garbage-collector#container-resource-limits"
---

## 案發現場

某電商大促期間，部署在 Kubernetes 上的結帳微服務（Memory Limits 設為 1Gi）突發大規模崩潰重啟，監控上未見任何 .NET 未處理例外，只有終端殘酷的 `Exit Code 137 (OOMKilled)`；另一端，圖片批次轉檔服務運行數小時後，明明總配置記憶體僅 300MB，卻頻繁噴出 `OutOfMemoryException`。

排查確認：前者是預設 Server GC 在高核心數節點為每個 Core 切割獨立 Heap，當記憶體逼近容器上限時未及時收縮，被 Linux cgroup 判定違規直接殺死；後者則是頻繁配置超過 85,000 位元組的大陣列進大型物件堆積（LOH），引發致命的記憶體碎裂。

## 致命反模式 vs. 正確解法

```text
【CLR 記憶體堆積世代流動】
新物件配置 ──► [ Gen 0 (短期) ] ──(存活)──► [ Gen 1 (緩衝) ] ──(存活)──► [ Gen 2 (長期) ]
>= 85,000 bytes ──────────────────────────────────────────► [ LOH (大型物件，不壓縮易碎裂) ]
```

### 坑一：高頻建立大型 byte[] 塞爆 LOH

在微服務中解析上傳檔案或序列化巨量 JSON 時，隨手宣告 `new byte[100_000]` 會直接進 LOH。LOH 預設只在 Gen 2 回收時清理，且預設**不做記憶體壓縮（No Compaction）**，迅速形成無法填補的碎裂空洞。

### 坑二：靜態事件訂閱造成根引導洩漏（Leak）

長生命週期物件（如 Singleton 服務）公開事件，短期請求 Scoped 物件訂閱卻未取消，GC 沿著根節點搜尋視為存活，物件永遠無法回收。

~~~csharp title="Program.cs"
// ✅ Good：使用 ArrayPool 租借緩衝區，0 配置進 LOH 且避免 GC 負擔
using System.Buffers;

Console.WriteLine("開始處理大型資料串流");
ProcessLargePayload(size: 100_000);
Console.WriteLine("大型資料處理完成並已歸還緩衝區");

static void ProcessLargePayload(int size)
{
    // 從共用池中租借記憶體陣列（底層重複利用，避免反覆配置與 LOH 碎裂）
    byte[] buffer = ArrayPool<byte>.Shared.Rent(size);
    try
    {
        // 實際取得的陣列長度可能大於請求的 size
        Span<byte> payload = buffer.AsSpan(0, size);
        payload.Fill(0xAA);
        Console.WriteLine($"成功處理長度: {payload.Length} 位元組");
    }
    finally
    {
        // 必須在 finally 中確保歸還至物件池
        ArrayPool<byte>.Shared.Return(buffer, clearArray: false);
    }
}
~~~

預期輸出：
```text
開始處理大型資料串流
成功處理長度: 100000 位元組
大型資料處理完成並已歸還緩衝區
```

## 踩坑與避坑指南

* **容器化關鍵 GC 環境變數**：
  * 在 Kubernetes 中若 Pod 限制記憶體（如 1Gi），應確保宣告環境變數：
    `DOTNET_GCHeapHardLimitPercent=75`（或指定絕對位元組數 `DOTNET_GCHeapHardLimit`），強制 CLR 在達到容器上限 75% 前主動觸發 GC，而非被動等待系統 OOMKill。
* **避坑原則（什麼時候千萬不要呼叫 `GC.Collect()`？）**：
  * **線上高吞吐請求鏈路中嚴禁手動呼叫**：`GC.Collect()` 會觸發耗時的 Full GC（Stop-The-World 全局停頓），而且會強行將剛配置的短命物件過早提升（Premature Promotion）至 Gen 1 / Gen 2，徹底破壞 CLR 自適應啟發式調度。

## 線上排查指令

線上診斷記憶體洩漏與 GC 停頓：

```bash
# 1. 即時監看 GC 世代回收次數、配置速率與暫停時間比率
dotnet-counters monitor System.Runtime --counters alloc-rate,gc-count,gc-pause-ratio,loh-size

# 2. 擷取輕量級 GCDump 分析物件實體分佈與保留路徑
dotnet-gcdump collect -p $(pgrep -n -f "dotnet.*MyService") -o mem.gcdump

# 3. 使用 dotnet-dump 分析 LOH 碎裂情況
dotnet-dump analyze dump.dmp
> dumpheap -stat -min 85000
```
