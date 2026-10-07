---
title: "lock、SemaphoreSlim 與安全初始化"
description: "區分共享狀態保護、併發限制、執行緒安全集合與 Lazy 初始化。"
articleId: "csharp-thread-safety"
topic: "csharp"
category: "practice"
order: 25
tags: ["lock", "ConcurrentQueue", "ConcurrentDictionary", "SemaphoreSlim", "WaitAsync", "Wait", "Lazy<T>", "雙重檢查鎖定", "GetOrAdd"]
difficulty: "intermediate"
prerequisites: ["csharp-async-coordination"]
relatedArticles: ["csharp-channels", "data-access-batch-updates", "data-access-pools-locks"]
applicableVersions: "以 .NET 10 / C# 14 核對；個別語法與 API 的最低版本見內文。"
verifiedWith: ".NET SDK 10.0.105 / net10.0 / C# 14；完整 Program.cs 已納入編譯與輸出驗證。"
lastReviewed: "2026-10-07"
takeaway: "安全集合只保護自身操作；跨多步的商業規則與非同步等待仍需要明確協調。"
noteDates: ["2026-05-21", "2026-05-27", "2026-06-02", "2026-06-22", "2026-06-24"]
sources: [{"title": "Microsoft Learn：SemaphoreSlim", "url": "https://learn.microsoft.com/en-us/dotnet/api/system.threading.semaphoreslim?view=net-10.0"}, {"title": "Microsoft Learn：ConcurrentDictionary.GetOrAdd", "url": "https://learn.microsoft.com/en-us/dotnet/api/system.collections.concurrent.concurrentdictionary-2.getoradd?view=net-10.0"}, {"title": "Microsoft Learn：Lazy 初始化", "url": "https://learn.microsoft.com/en-us/dotnet/framework/performance/lazy-initialization"}]
---

## 依保護的目標選工具

| 工具 | 適合用途 | 限制 |
| --- | --- | --- |
| `lock` | 短時間同步保護共享狀態 | 區塊內不能 await，競爭時阻塞執行緒 |
| `SemaphoreSlim` | 限制同時進行數，或非同步互斥 | 使用 WaitAsync，成功取得後才能 Release |
| `ConcurrentQueue<T>` | 多方安全入隊與出隊 | 不保證工作耐久性或多步流程原子性 |
| `ConcurrentDictionary<K,V>` | 安全單次查改 | GetOrAdd 的 factory 可能並行執行多次 |
| `Lazy<T>` | 延後並協調物件初始化 | 初始化物件安全，不代表物件日後使用安全 |

## await 不阻塞地等待名額

~~~csharp title="Program.cs"
using System.Collections.Concurrent;

using var gate = new SemaphoreSlim(1, 1);
var values = new ConcurrentDictionary<int, int>();
var queue = new ConcurrentQueue<int>();
var settings = new Lazy<string>(() => "已初始化");
await gate.WaitAsync();
try
{
    values.GetOrAdd(1, static key => key * 10);
    queue.Enqueue(values[1]);
}
finally { gate.Release(); }
if (queue.TryDequeue(out int value)) Console.WriteLine(value);
Console.WriteLine(settings.Value);
~~~

預期輸出：

~~~text
10
已初始化
~~~

`Wait()` 仍是同步阻塞；WaitAsync 在無名額時才非同步等待。若 WaitAsync 被取消，並未取得名額，不能無條件 Release。只在所有使用者結束後釋放 gate。

## Lazy 與雙重檢查鎖定

預設 Lazy 的 ExecutionAndPublication 協調一次初始化，並保留 factory 的例外。自行實作「先檢查、加鎖、再檢查」還牽涉記憶體可見性與安全發佈，通常先用 Lazy 或框架提供的機制。

ConcurrentDictionary.GetOrAdd 在鎖外執行 factory；不要把扣款、寄信等必須恰好一次的副作用放進去。多 Pod 的資料競爭也不會被 process 內的 lock 解決，需由資料庫約束、交易或分散式協調處理。
