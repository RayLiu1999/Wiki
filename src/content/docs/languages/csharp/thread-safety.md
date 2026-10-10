---
title: "C# 執行緒安全與鎖實務：持鎖最小化、Interlocked 與 SemaphoreSlim"
description: "深入剖析多執行緒資料競爭、鎖範圍過大造成的全站阻塞，以及 Interlocked 無鎖原子操作與 SemaphoreSlim 最佳實務。"
articleId: "csharp-thread-safety"
topic: "csharp"
category: "async-threading"
order: 4
tags: ["C#", "Thread Safety", "Interlocked", "SemaphoreSlim", "併發控制", "多執行緒"]
articleType: "deep-dive"
prerequisites: ["csharp-async-await"]
relatedArticles: ["csharp-channels", "csharp-valuetask-tcs"]
applicableVersions: "C# 10+ / 14、.NET 6+ / .NET 10"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "數值遞增與狀態切換優先使用 Interlocked 無鎖操作；非同步臨界區採用 SemaphoreSlim 並嚴格最小化持鎖時間，禁在鎖內執行慢速 I/O。"
sources:
  - title: "Microsoft Learn：執行緒處理指示詞概觀"
    url: "https://learn.microsoft.com/zh-tw/dotnet/standard/threading/overview-of-synchronization-primitives"
  - title: "Microsoft Learn：Interlocked 類別"
    url: "https://learn.microsoft.com/zh-tw/dotnet/api/system.threading.interlocked"
---

## 案發現場

限時限量搶購活動中，熱門商品本機快取庫存頻繁發生超賣現象（資料競爭）；開發團隊為了防護，在方法外層加上了互斥鎖。然而上線後更嚴重的災難爆發：所有並行請求全數卡住，API 回應時間從 5ms 暴增至 30,000ms，執行緒池迅速被佔滿，觸發大量 504 Gateway Timeout。

排查原因：工程師在 `SemaphoreSlim` 鎖定範圍內呼叫了遠端 HTTP 金流驗證與資料庫日誌寫入，將原本微秒級的臨界區拉長了上萬倍，引發災難性的鎖競爭。

## 致命反模式 vs. 正確解法

```text
【粗粒度持鎖阻塞（壞） vs. 持鎖範圍最小化（好）】
[❌ Bad]  ┌── Lock 獲取 ──► [慢速遠端 I/O 200ms] ──► [更新變數 1μs] ──► 釋放 Lock ──┐ (全站排隊卡死)
[✅ Good] ┌── Lock 獲取 ──► [更新變數 1μs] ──► 釋放 Lock ───────────────────────────┘
          └──► 後續在鎖外獨立執行慢速遠端 I/O (無競爭阻塞)
```

### 坑一：單純數值計算用粗鎖，或以 count++ 裸跑

`count++` 看似只有一行，底層卻包含「讀取、遞增、寫回」三道 CPU 指令，多執行緒下會被交錯執行而遺失更新。

```csharp
// 💣 Bad：非原子操作引發資料競爭
private int _activeOrders;
public void OnOrderReceived() => _activeOrders++; // 線上高併發必然算錯！
```

### 坑二：鎖內包含耗時 I/O 呼叫

~~~csharp title="Program.cs"
// ✅ Good：運用 Interlocked 無鎖原子操作與 SemaphoreSlim 最小化持鎖
var metrics = new OrderMetrics();

// 1. Interlocked 無鎖遞增（由 CPU 硬體保證原子性，0 鎖競爭）
Parallel.For(0, 100, _ => metrics.IncrementOrder());
Console.WriteLine($"累計訂單數: {metrics.TotalOrders}");

// 2. 非同步臨界區持鎖範圍最小化
await metrics.SafeDeductStockAsync();
Console.WriteLine("庫存安全扣減完成");

public sealed class OrderMetrics
{
    private int _totalOrders;
    private int _stock = 10;
    private readonly SemaphoreSlim _lock = new(1, 1);

    public int TotalOrders => Volatile.Read(ref _totalOrders);

    public void IncrementOrder() => Interlocked.Increment(ref _totalOrders);

    public async Task SafeDeductStockAsync()
    {
        await _lock.WaitAsync();
        try
        {
            // 臨界區內僅做極速記憶體狀態變更，絕對不呼叫非同步 I/O
            if (_stock > 0) _stock--;
        }
        finally
        {
            _lock.Release();
        }
    }
}
~~~

預期輸出：
```text
累計訂單數: 100
庫存安全扣減完成
```

## 踩坑與避坑指南

* **鎖物件必須封閉且私有**：永遠使用 `private readonly object _gate = new();`（.NET 9+ 可使用新引進的 `System.Threading.Lock`）。嚴禁 `lock(this)` 或 `lock(typeof(Foo))`，外部程式碼若無意間鎖定同一個物件會造成全域死鎖。
* **SemaphoreSlim 的計數洩漏**：`Release()` 必須永遠放在 `finally` 區塊中。若業務程式碼拋出例外而未釋放，後續請求將永久處於等待狀態。
* **避坑原則（什麼時候千萬不能用 C# 記憶體鎖？）**：
  * **多 Pod / 多台主機部署的架構**：C# 的 `lock`、`Monitor` 與 `SemaphoreSlim` 只能約束「當前行程（Process）內部」的執行緒。若微服務水平擴展成 3 個 Pod，不同 Pod 間的記憶體是隔離的，本機鎖完全無法防禦超賣！此時必須升級為 Redis 分散式鎖（如 RedLock）或資料庫交易悲觀鎖。

## 線上排查指令

線上排查鎖競爭與死鎖事故：

```bash
# 1. 抓取 CoreDump 檔案
dotnet-dump collect -p $(pgrep -n -f "dotnet.*MyService") -o dump.dmp

# 2. 檢視行程中同步區塊（SyncBlock）與鎖持有狀態
dotnet-dump analyze dump.dmp
> syncblk
> deadlocks
```
