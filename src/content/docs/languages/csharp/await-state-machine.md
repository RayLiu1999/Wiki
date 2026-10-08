---
title: "await、狀態機與例外傳播"
description: "從作業的回傳與完成分清 async 的執行流程，以及例外如何回到呼叫端。"
articleId: "csharp-await-state-machine"
topic: "csharp"
category: "practice"
order: 28
tags: ["await、狀態機與例外傳播", "csharp"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["csharp-async-await", "csharp-cancellation"]
relatedArticles: ["dotnet-threadpool", "dotnet-background-services"]
applicableVersions: "以 C# 14／.NET 10 說明；框架與供應商差異見內文。"
verifiedWith: "完整 Console 範例納入 test:examples；狀態機說明不代表反編譯或排程效能實驗。"
lastReviewed: "2026-10-08"
takeaway: "從作業的回傳與完成分清 async 的執行流程，以及例外如何回到呼叫端。"
noteDates: []
sources: [{"title": "非同步程式設計", "url": "https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/"}, {"title": "Task 例外處理", "url": "https://learn.microsoft.com/en-us/dotnet/standard/parallel-programming/exception-handling-task-parallel-library"}]
---

## 本篇的查價背景

商品 API 等待遠端報價時，呼叫端拿到的是未來會完成的作業。本篇使用 `Task.Yield` 示範非同步延續與失敗；沒有真的呼叫付款或報價服務，也不以這段程式量測執行緒效能。

## 編譯器保存哪些狀態

async 方法會保存需要跨 await 使用的狀態，讓尚未完成的等待之後繼續。一般 async 方法會執行到需要暫停的 await；若等待物件已完成，可以繼續同步執行。它沒有承諾每次都建立新執行緒。

作業物件、排程與執行緒是不同層次。I/O 等待、CPU 計算與背景程序，也需要不同安排；不要用 `Task.Run` 把每個網路操作再包一次。

## 完整的最小範例

~~~csharp
Task<int> quote = LoadQuoteAsync();
Console.WriteLine("已取得作業");
try
{
    Console.WriteLine(await quote);
}
catch (InvalidOperationException error)
{
    Console.WriteLine(error.Message);
}

static async Task<int> LoadQuoteAsync()
{
    await Task.Yield();
    throw new InvalidOperationException("報價暫時不可用");
}
~~~

預期輸出：

~~~text
已取得作業
報價暫時不可用
~~~

## 例外、取消與多個作業

await 觀察作業結果：成功回傳值，失敗拋出例外，取消則依作業及 token 契約處理。取消是協作要求，不能推論遠端交易沒有成功。`async void` 的例外與完成缺少一般 Task 呼叫端的控制，通常留給框架事件處理入口。

WhenAll 等全部作業完成後反映結果；若需要診斷全部失敗，要保留各作業或檢查合併作業的例外集合。`.Result`／`.Wait()` 會同步等待，可能耗用 request 執行緒並引發死結或 ThreadPool 飢餓。

## 接回 API 與 Worker

商品查詢應把 token 傳到資料庫和外部呼叫；通知 Worker 應 await 效果完成，再決定 ACK。Kubernetes 停止 Pod 的訊號會增加另一個取消來源，而它對尚未完成工作造成什麼結果，必須由用例契約說明。
