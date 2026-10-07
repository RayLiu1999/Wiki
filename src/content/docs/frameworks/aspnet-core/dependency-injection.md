---
title: "DI 生命週期與 Options Pattern"
description: "理解 Transient、Scoped、Singleton 的持有關係，正確建立背景工作 scope 與設定存取。"
articleId: "aspnet-core-dependency-injection"
topic: "aspnet-core"
category: "services"
order: 2
tags: ["DI", "Transient", "Scoped", "Singleton", "AddTransient", "AddScoped", "Options Pattern", "IServiceScopeFactory", "captured dependency"]
difficulty: "intermediate"
prerequisites: ["csharp-interfaces", "csharp-disposable"]
relatedArticles: ["aspnet-core-http-client-factory", "data-access-ef-core", "dotnet-hosting"]
applicableVersions: "以 .NET 10 生態系與本文列出的官方文件核對；套件及資料庫供應商的差異見內文。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-07"
takeaway: "較長生命週期的服務不可直接持有較短 scope 的資料；生命週期看的是物件持有關係。"
noteDates: ["2026-05-21", "2026-05-22", "2026-05-28", "2026-06-29", "2026-07-01", "2026-10-06"]
sources: [{"title": "Microsoft Learn：DI 概觀", "url": "https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/overview"}, {"title": "Microsoft Learn：DI 使用指南", "url": "https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/guidelines"}, {"title": "Microsoft Learn：Options Pattern", "url": "https://learn.microsoft.com/en-us/dotnet/core/extensions/options"}]
---

## 註冊與持有時間

| 註冊 | 建立時機 | 常見用途 |
| --- | --- | --- |
| `AddTransient` | 每次解析服務 | 輕量、無狀態行為 |
| `AddScoped` | 每個 scope 一個實例 | Web request 中的 DbContext 與工作單位 |
| `AddSingleton` | 根容器生命週期 | 可安全共享的設定、快取或協調器 |

Scoped 並非天然等於 HTTP request：背景服務可自行建立 scope。Singleton 持有 Scoped 會讓本應短命的依賴被延長，並可能讓 DbContext 被多個工作並行使用。啟用 scope validation 有助於提早發現，但不能替代設計。

## 背景工作為每次處理建立 scope

下列為整合片段；JobHandler 代表已註冊的應用程式服務，不是本站的實作。

~~~csharp title="背景服務中的方法（整合片段）"
static async Task RunJobAsync(IServiceScopeFactory scopeFactory,
    CancellationToken cancellationToken)
{
    await using var scope = scopeFactory.CreateAsyncScope();
    var handler = scope.ServiceProvider.GetRequiredService<JobHandler>();
    await handler.HandleAsync(cancellationToken);
}
~~~

scope 必須活到作業完成；不要返回尚未 await 的 Task 就先釋放 scope。

## Options 的更新與生命週期

`IOptions<T>` 提供穩定的設定存取；`IOptionsSnapshot<T>` 是 Scoped，適合每個 scope 的設定快照；`IOptionsMonitor<T>` 可供 Singleton 使用並支援變更通知，但來源是否能重新載入取決於 configuration provider。

可用 AddOptions、BindConfiguration、Validate 與 ValidateOnStart 把必要設定錯誤移到啟動時。設定值不應散落在每個方法中解析，也不應把秘密值寫進 log。

## 資源由誰釋放

容器建立的 IDisposable / IAsyncDisposable 服務由對應容器或 scope 釋放，使用端不應任意 Dispose 共用 Singleton。自行建立或註冊既有 instance 的資源，要確認自己的所有權與結束時機；Transient 若從根容器解析且需釋放，也可能被根容器持有很久。
