---
title: "非同步狀態機（async/await）與執行緒上下文"
description: "直擊 Sync-over-Async 造成的 ThreadPool 飢餓與死結，剖析編譯器狀態機時序與生產排查方法。"
articleId: "csharp-async-await"
topic: "csharp"
category: "async-threading"
order: 1
tags: ["C#", "非同步", "async", "await", "狀態機", "ThreadPool", "死結"]
articleType: "deep-dive"
prerequisites: ["csharp-syntax-traps"]
relatedArticles: ["csharp-valuetask-tcs", "csharp-cancellation-disposable", "csharp-thread-safety"]
applicableVersions: "C# 12+ / 14、.NET 8+ / .NET 10"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "一路非同步到底（Async all the way down），絕不在非同步方法上呼叫 .Result 或 .Wait()；杜絕 async void。"
sources:
  - title: "Microsoft Learn：以非同步方式使用 async 和 await 進行程式設計"
    url: "https://learn.microsoft.com/zh-tw/dotnet/csharp/asynchronous-programming/"
  - title: "Stephen Cleary：Async and Await"
    url: "https://blog.stephencleary.com/2012/02/async-and-await.html"
---

## 案發現場

流量尖峰時，線上微服務的所有 API 突然集體超時。令人費解的是，伺服器 CPU 使用率極低（不到 15%），但 ThreadPool 執行緒數量卻從 20 條一路狂飆到數百條，最終引發全站雪崩停擺！

這正是因為在非同步呼叫鏈中混用了 `.Result` 或 `.Wait()`，引發了後端最致命的「Sync-over-Async（同步阻塞非同步）」與「ThreadPool 執行緒飢餓（Starvation）」。

## 致命反模式 vs. 正確解法

### 時序圖：Sync-over-Async 造成的雪崩死鎖

```text
時間軸 ────────────────────────────────────────────────────────►
Thread A : 呼叫 Async 方法 ──► 呼叫 .Result (阻塞 Thread A，等待 Callback)
ThreadPool : 忙碌中，延遲分配新執行緒 ──► 找不到可用 Thread 執行 Callback ──► 💥 互相卡死！
```

### 坑一：使用 .Result 或 .Wait() 同步阻塞

在非同步呼叫上同步等待，會強行佔用當前執行緒；而非同步操作完成後的延續（Continuation）又需要執行緒池調度執行緒來處理，極易在負載升高時造成執行緒注入速率（Hill Climbing 每秒僅 1~2 條）趕不上阻塞速度。

~~~csharp title="Program.cs"
// ✅ Good：一路非同步到底（Async all the way），交還執行緒控制權
Console.WriteLine("非同步作業開始");
string data = await FetchDataAsync();
Console.WriteLine($"非同步作業完成: {data}");

static async Task<string> FetchDataAsync()
{
    // await 遇到未完成的作業時，立即釋放當前執行緒給 ThreadPool 去服務其他 HTTP 請求
    await Task.Delay(10);
    return "結果資料";
}
~~~

預期輸出：
```text
非同步作業開始
非同步作業完成: 結果資料
```

```csharp
// 💣 Bad：在同步方法硬叫 .Result 或 .GetAwaiter().GetResult()
public string GetDataBad()
{
    // 致命反模式：強行阻塞執行緒，在負載升高時迅速拖垮 ThreadPool
    return FetchDataAsync().Result;
}
```

### 坑二：使用 async void（未捕捉例外將崩潰進程）

`async void` 僅限於 UI 事件處理器。在後端使用時，其內部拋出的任何例外皆無法被呼叫端的 `try-catch` 捕捉，會直接升級為未處理例外導致整座 .NET 伺服器程序 Crash 退出！

```csharp
// 💣 Bad：拋出例外時整座 API 進程直接當機退出
public async void FireAndForgetBad() { await DoWorkAsync(); }

// ✅ Good：回傳 Task，並由呼叫端明確 await 或妥善處理例外
public async Task FireAndForgetGood() { await DoWorkAsync(); }
```

## 踩坑與避坑指南

* **編譯器狀態機真相**：宣告 `async` 的方法會被編譯為實作 `IAsyncStateMachine` 的 Struct。遇到 `await` 時，若作業已同步完成（`IsCompleted == true`），會原地繼續執行；若未完成，則註冊回呼並將控制權交還。
* **ASP.NET Core 與 ConfigureAwait**：ASP.NET Core 已移除舊版 .NET Framework 的 `SynchronizationContext`，在 Controller/Service 層無需強制加上 `ConfigureAwait(false)`；但若是開發通用 NuGet 套件，仍建議加上以提升跨平台效能。
* **避坑原則（什麼時候不要用 Task.Run？）**：
  * 面對 I/O 密集操作（資料庫、Redis、HTTP 呼叫），直接使用非同步 API，絕不要在外層包 `Task.Run`，那只會平白浪費一次執行緒排程切換。

## 線上排查指令

若線上懷疑發生 ThreadPool 飢餓或非同步死結：

```bash
# 監控執行緒池佇列積壓與即時執行緒數（queue-length 持續 > 0 即代表執行緒飢餓）
dotnet-counters monitor System.Runtime --counters threadpool-thread-count,threadpool-queue-length

# 抓取進程 dump 並分析是否有大量執行緒卡在 Task.Wait
dotnet-dump collect -p <PID>
dotnet-dump analyze <dump_file>
> clrstack -all
```
