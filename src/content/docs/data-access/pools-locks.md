---
title: "連線池、交易、鎖與 Cloud SQL Proxy"
description: "分清應用程式連線資源與資料庫一致性，估算多 Process / Pod 的連線總量。"
articleId: "data-access-pools-locks"
topic: "data-access"
category: "database-runtime"
order: 5
tags: ["連線池", "Process", "Pod", "Cloud SQL Auth Proxy", "transaction", "資料庫鎖", "pooling", "DbContext pooling"]
difficulty: "intermediate"
prerequisites: ["data-access-transactions", "aspnet-core-dependency-injection"]
relatedArticles: ["data-access-batch-updates", "engineering-metrics-tracing", "aspnet-core-dapr"]
applicableVersions: "以 .NET 10 生態系與本文列出的官方文件核對；套件及資料庫供應商的差異見內文。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-07"
takeaway: "池解決連線重用，交易定義提交邊界，鎖協調資料存取；增加池大小不會解除鎖競爭。"
noteDates: ["2026-08-26", "2026-10-05"]
sources: [{"title": "Microsoft Learn：SQL Server 連線池", "url": "https://learn.microsoft.com/en-us/dotnet/framework/data/adonet/sql-server-connection-pooling"}, {"title": "Google Cloud：Cloud SQL Auth Proxy", "url": "https://docs.cloud.google.com/sql/docs/mysql/sql-proxy?hl=en"}, {"title": "Microsoft Learn：EF Core pooling", "url": "https://learn.microsoft.com/en-us/ef/core/performance/advanced-performance-topics"}]
---

## 四個層級分開看

| 層級 | 主要責任 |
| --- | --- |
| Driver connection pool | 重用實體資料庫連線，限制同時借出數量 |
| Transaction | 一組資料操作的提交與回滾邊界 |
| Database lock / MVCC | 協調相同資料的並行讀寫，行為依引擎與隔離層級不同 |
| Cloud SQL Auth Proxy | 授權與連線通道，不自行提供連線池 |

Cloud SQL 的受管理連線池是另一項服務；即使 Proxy 連向 pool endpoint，提供 pooling 的也不是 Proxy 本身。

## 一個 Pod 不代表只有一個池

一般 ADO.NET provider 的 client-side pool 位於 process 內；不同連線設定、身分或 data source 可能形成不同池，多個 process / Pod 不會天然共享它們。確切分池規則需查 provider。

假設 6 個 Pod、每個 1 個 process、每個 2 個池、每池最大 50，配置的上限合計可能達 600。這是容量估算，不代表立刻建立 600 條連線；還要加入背景工作、部署時新舊 Pod 重疊與其他應用程式。

## 正確歸還連線

Open 常是向池借出連線，Close / Dispose 在 pooling 開啟時通常是歸還。長時間串流、長交易或漏釋放會讓可借用連線減少；在 Task.Delay 或外部 HTTP 等待前，先確認能否結束交易並歸還連線。

DbContext pooling 重用 context 物件，與 driver connection pooling 不同。重用 context 也需處理 request / tenant 的可變狀態，不能只看效能數字。

## 診斷等待發生在哪裡

分別觀察取得連線等待、命令執行、transaction 時間與 lock wait。調大 Max Pool Size 可能只讓更多命令同時等待同一把鎖，甚至增加資料庫壓力；先找出真正的瓶頸。
