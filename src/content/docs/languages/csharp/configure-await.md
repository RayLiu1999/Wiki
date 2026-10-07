---
title: "ConfigureAwait 與同步內容"
description: "理解延續位置與同步阻塞，校準 .NET 8 ConfigureAwaitOptions 的語意。"
articleId: "csharp-configure-await"
topic: "csharp"
category: "practice"
order: 24
tags: ["ConfigureAwait", "ConfigureAwaitOptions", "SynchronizationContext", ".Result", ".Wait()", "死結", "ASP.NET Core"]
difficulty: "intermediate"
prerequisites: ["csharp-async-await"]
relatedArticles: ["csharp-thread-safety", "aspnet-core-middleware"]
applicableVersions: "ConfigureAwaitOptions 自 .NET 8 起；本例以 .NET 10 / C# 14 驗證。"
verifiedWith: ".NET SDK 10.0.105 / net10.0 / C# 14；完整 Program.cs 已納入編譯與輸出驗證。"
lastReviewed: "2026-10-07"
takeaway: "None 沒有要求捕捉同步內容；ContinueOnCapturedContext 才對應 ConfigureAwait(true)。"
noteDates: ["2026-06-02", "2026-10-05", "2026-10-06"]
sources: [{"title": "Microsoft .NET Blog：ConfigureAwait FAQ", "url": "https://devblogs.microsoft.com/dotnet/configureawait-faq/"}, {"title": "Microsoft Learn：ConfigureAwaitOptions", "url": "https://learn.microsoft.com/en-us/dotnet/api/system.threading.tasks.configureawaitoptions?view=net-10.0"}]
---

## await 之後在哪裡繼續

預設 await 會在適用時捕捉 SynchronizationContext 或 TaskScheduler。UI 程式常需要回 UI 執行緒；不依賴呼叫端內容的通用類別庫，常選擇 ConfigureAwait(false)。ASP.NET Core 預設沒有自訂的 SynchronizationContext，因此與傳統 ASP.NET 或 UI 環境不同。

ConfigureAwait(false) 不保證切換到另一條執行緒，也不會關閉 ExecutionContext 的流動；例如 AsyncLocal 的傳遞是另一個機制。作業已完成時，延續可能直接同步執行。

## .NET 8 起的選項

| 選項 | 意義 |
| --- | --- |
| `None` | 不啟用額外選項；不要求捕捉原內容，對應 false 的意圖 |
| `ContinueOnCapturedContext` | 嘗試在捕捉的內容繼續，對應 true |
| `ForceYielding` | 即使 Task 已完成，也要求非同步讓出執行 |
| `SuppressThrowing` | 在支援的 Task 用法中抑制等待時擲出的 fault / cancellation；不是忽略錯誤的通用策略 |

~~~csharp title="Program.cs"
await Task.Delay(1).ConfigureAwait(false);
await Task.Delay(1).ConfigureAwait(ConfigureAwaitOptions.None);
await Task.CompletedTask.ConfigureAwait(ConfigureAwaitOptions.ForceYielding);
Console.WriteLine("沒有要求回原同步內容");
Console.WriteLine((int)ConfigureAwaitOptions.ContinueOnCapturedContext);
~~~

預期輸出：

~~~text
沒有要求回原同步內容
1
~~~

本例只展示 API 選項，未建立 UI 同步內容，也不是死結重現程式。不要由一次執行的執行緒 ID 推論所有 await 的排程行為。

## 同步阻塞的問題

在需要回原內容的環境，呼叫端 `.Result` / `.Wait()` 卡住該內容，延續又等著回去，就可能死結。在 ASP.NET Core 中，即使沒有這種預設同步內容，阻塞仍可能造成 ThreadPool 飢餓與延遲。

優先一路使用 await。只在外層加一個 ConfigureAwait(false) 不能修正內部先前已捕捉內容的 await，也不能替代正確的鎖、取消與例外處理。
