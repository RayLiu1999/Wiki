---
title: "Options 的繫結、驗證與更新"
description: "用商品快取設定理解 IOptions、Snapshot、Monitor 與啟動驗證。"
articleId: "aspnet-core-options"
topic: "aspnet-core"
category: "services"
order: 13
tags: ["Options 的繫結、驗證與更新", "aspnet-core"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["aspnet-core-dependency-injection"]
relatedArticles: ["redis-dotnet-integration", "kubernetes-configuration-security"]
applicableVersions: "以 C# 14／.NET 10 說明；框架與供應商差異見內文。"
verifiedWith: "已依官方文件核對概念；文中示意片段未宣稱完成外部服務整合或效能量測。"
lastReviewed: "2026-10-08"
takeaway: "用商品快取設定理解 IOptions、Snapshot、Monitor 與啟動驗證。"
noteDates: []
sources: [{"title": "Options Pattern", "url": "https://learn.microsoft.com/en-us/dotnet/core/extensions/options"}, {"title": "ASP.NET Core 設定", "url": "https://learn.microsoft.com/en-us/aspnet/core/fundamentals/configuration?view=aspnetcore-10.0"}]
---

## 本篇的快取背景

商品副本需要 TTL，API 也需要 Redis 端點。設定來源可能是 JSON、環境變數或外部服務，本篇關心程式如何取得一致且有效的值。`ProductCacheOptions` 是自訂設定型別，不是 Redis SDK 的連線型別。

## 設定來源與服務生命週期

| 介面 | 使用目的 | 必須確認 |
| --- | --- | --- |
| IOptions<T> | 穩定的設定存取 | 不會因為你修改來源就直接提供更新通知 |
| IOptionsSnapshot<T> | 每個 scope 的快照 | Scoped，不能直接由 Singleton 長期持有 |
| IOptionsMonitor<T> | 目前設定與變更通知 | provider 必須支援變更；訂閱資源也有生命週期 |

讀取設定與重新建立外部連線是不同操作。把 Redis 端點改掉後，既有 Multiplexer 不會因為 Options 值變了就自動切換。

## .NET DI 註冊片段

以下需要 Web／Host 專案的 builder 與設定來源，示範驗證 TTL；沒有建立 Redis 連線。

~~~csharp title="服務註冊（整合示意）"
builder.Services.AddOptions<ProductCacheOptions>()
    .BindConfiguration("ProductCache")
    .Validate(options => options.TtlSeconds > 0 && options.TtlSeconds <= 3600,
        "商品快取 TTL 必須介於 1 與 3600 秒")
    .ValidateOnStart();

public sealed class ProductCacheOptions
{
    public int TtlSeconds { get; set; } = 30;
}
~~~

預期行為是啟動時發現不合法設定；不是看到這段片段就能假定所有來源或外部服務均正常。

## 接到容器與 Kubernetes

容器通常由環境或檔案供應設定；ConfigMap／Secret 的更新與 provider 是否重新載入有不同條件。指引要說明變更如何進到程序、何時需要重新啟動，以及更新失敗如何恢復。秘密不應出現在設定 log 或例外訊息。

完成檢查：能畫出「設定來源 → 繫結與驗證 → 使用者生命週期 → 變更後的行為」，並指出要重新建立哪些資源。
