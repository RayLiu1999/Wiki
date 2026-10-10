---
title: "BackgroundService 的啟停、Scope 與工作結果"
description: "用通知工作理解 Host 管理、取消、錯誤與資源，以及 .NET 10 的啟動差異。"
articleId: "dotnet-background-services"
topic: "dotnet"
category: "runtime-models"
order: 10
tags: ["BackgroundService 的啟停、Scope 與工作結果", "dotnet"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["dotnet-hosting", "aspnet-core-dependency-injection", "csharp-cancellation-disposable"]
relatedArticles: ["rabbitmq-dotnet-integration", "kubernetes-probes-resources"]
applicableVersions: "以 C# 14／.NET 10 說明；框架與供應商差異見內文。"
verifiedWith: "已依官方文件核對概念；文中示意片段未宣稱完成外部服務整合或效能量測。"
lastReviewed: "2026-10-08"
takeaway: "用通知工作理解 Host 管理、取消、錯誤與資源，以及 .NET 10 的啟動差異。"
noteDates: []
sources: [{"title": "Hosted Services", "url": "https://learn.microsoft.com/en-us/aspnet/core/fundamentals/host/hosted-services?view=aspnetcore-10.0"}, {"title": "ExecuteAsync .NET 10 變更", "url": "https://learn.microsoft.com/en-us/dotnet/core/compatibility/extensions/10.0/backgroundservice-executeasync-task"}]
---

## 本篇的通知背景

訂單 API 提交後，另一個程序處理通知。Generic Host 可以管理背景服務與應用生命週期；BackgroundService 表達持續的非同步工作。RabbitMQ 則保存和傳遞工作，兩者責任不同。

## .NET 10 的啟動差異

從 .NET 10 起，BackgroundService 的整個 ExecuteAsync 在背景執行，第一個 await 之前的部分也不再阻塞其他服務啟動。若有必須阻塞完成的啟動工作，要選 StartAsync 或明確的 lifecycle 階段，不能沿用舊假設。

啟動完成也不表示 broker 拓樸、資料庫與 Consumer 都已就緒；readiness 需要表達用例真正的可用條件。

## 一次工作建立自己的 scope

下面是 Host 專案中的示意類別。`INotificationJob` 是自訂應用介面，需要另行註冊實作；它不是 RabbitMQ SDK 提供的 Consumer。此範例每秒處理一次，沒有連到 broker。

~~~csharp title="背景服務（整合示意）"
public interface INotificationJob
{
    Task HandleAsync(CancellationToken token);
}

public sealed class NotificationWorker(IServiceScopeFactory scopes) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await using var scope = scopes.CreateAsyncScope();
            var job = scope.ServiceProvider.GetRequiredService<INotificationJob>();
            await job.HandleAsync(stoppingToken);
            await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken);
        }
    }
}
~~~

scope 活到 HandleAsync 完成，取消與例外離開時也安排釋放。實際訊息工作需要設計暫時失敗、毒訊息、重試與未觀察例外的處理，不能只是 catch 後永遠忽略。

## 停止與訊息確認

停止時先停接新工作，讓已接工作依契約完成或保留可重送狀態。提交資料後才 ACK；提交後 ACK 前中斷仍可能重送，所以 Inbox 冪等仍必要。Host 的停止時間、容器寬限和強制終止都要列在時間線。

現有實驗 OrderWorker 是 Console 程序，以 Ctrl+C 取消循環，尚未改成這個 BackgroundService 或驗證 GKE 的 SIGTERM。閱讀設計和跟做現有實驗時，請分別查看相應前提。
