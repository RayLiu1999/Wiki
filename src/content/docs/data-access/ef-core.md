---
title: "EF Core 模型、查詢與 DbContext"
description: "從 DbSet 與 Fluent API 走到 SQL 翻譯，理解 tracking、查詢成本與 context 生命週期。"
articleId: "data-access-ef-core"
topic: "data-access"
category: "querying"
order: 1
tags: ["EF Core", "DbContext", "DbSet", "LINQ", "Fluent API", "OnModelCreating", "ApplyConfigurationsFromAssembly", "AsNoTracking", "SQL"]
difficulty: "intermediate"
prerequisites: ["csharp-query-abstractions", "aspnet-core-dependency-injection"]
relatedArticles: ["data-access-migrations", "data-access-transactions", "data-access-type-mapping"]
applicableVersions: "以 .NET 10 生態系與本文列出的官方文件核對；套件及資料庫供應商的差異見內文。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-07"
takeaway: "DbContext 是短生命週期的工作單位；查詢要看產生的 SQL，模型要寫清楚資料語意。"
noteDates: ["2026-06-04", "2026-10-05", "2026-10-06"]
sources: [{"title": "Microsoft Learn：EF Core 模型配置", "url": "https://learn.microsoft.com/en-us/ef/core/modeling/"}, {"title": "Microsoft Learn：查詢效能", "url": "https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying"}, {"title": "Microsoft Learn：DbContext 生命週期", "url": "https://learn.microsoft.com/en-us/ef/core/dbcontext-configuration/"}]
---

## Context、集合與模型

DbContext 協調查詢、追蹤與儲存；`DbSet<TEntity>` 是某類 Entity 的查詢及變更入口，不是已載入全部資料的 List。Context 不支援平行操作；一個操作完成後再開始下一個，或為獨立工作使用獨立 context。

模型可以用 convention、Attribute 或 Fluent API 配置。OnModelCreating 是 Fluent API 常見入口；IEntityTypeConfiguration<T> 可依型別拆分設定，再由 ApplyConfigurationsFromAssembly 掃描套用。組件掃描在 trimming / AOT 環境要另查支援方式。

## 把篩選與投影放在實體化之前

下面假設已有 Orders 模型，欄位 Id 是訂單識別碼、Total 是訂單總金額；僅示範查詢片段，沒有建立資料表或連線執行。

~~~csharp title="查詢片段"
using Microsoft.EntityFrameworkCore;

var orders = await context.Orders
    .AsNoTracking()
    .Where(order => order.Total >= 100m)
    .OrderBy(order => order.Id)
    .Select(order => new OrderSummary(order.Id, order.Total))
    .Take(50)
    .ToListAsync(cancellationToken);

record OrderSummary(int Id, decimal Total);
~~~

避免先 ToList 再篩選。依 provider 查看 ToQueryString、query log 與執行計畫，檢查索引、分頁、N+1 及實際傳回欄位。AsNoTracking 適合不需更新的讀取，不代表資料不再消耗記憶體。

## 配置應包含可維護的語意

明確設定必要的 key、長度、precision、required、關聯與索引，並為資料表及每個欄位寫可持久化的註解，說清資料粒度、單位、狀態與 null 意義。EF Core 可用 table / property 的 HasComment API；是否產生資料庫註解以及 migration SQL，須由實際 provider 驗證。

資料庫 schema 與 .NET 型別不能只靠名稱猜測。Migration 產物需檢查型別、約束與資料轉換，不要把 ORM 設定完成視為部署已驗證。
