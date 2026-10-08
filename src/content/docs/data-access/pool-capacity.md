---
title: "連線池預算、背壓與高併發容量"
description: "用持有時間與系統總量推算候選池大小，分清 session 上限和安全的資料庫工作量。"
articleId: "data-access-pool-capacity"
topic: "data-access"
category: "database-connections"
order: 13
tags: ["連線池", "高併發", "Little’s Law", "背壓", "HPA", "SemaphoreSlim"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["data-access-pools-locks", "data-access-csharp-connections"]
relatedArticles: ["kubernetes-autoscaling", "redis-reliability", "data-access-load-validation"]
applicableVersions: "以 .NET 10、MySQL 8.4（InnoDB）、PostgreSQL 18 說明；driver／EF provider 的主版相容性須各自核對。"
verifiedWith: "2026-10-09 核對官方文件；SQL 為有前提的設計示意，未執行實際 CRUD、故障切換或上億筆壓測。"
lastReviewed: "2026-10-09"
takeaway: "用持有時間與系統總量推算候選池大小，分清 session 上限和安全的資料庫工作量。"
noteDates: []
sources: [{"title": "Npgsql：DataSource 與借還連線", "url": "https://www.npgsql.org/doc/basic-usage.html"}, {"title": "MySqlConnector：連線設定", "url": "https://mysqlconnector.net/connection-options/"}, {"title": "PostgreSQL 18：連線容量", "url": "https://www.postgresql.org/docs/18/runtime-config-connection.html"}, {"title": "Kubernetes：Deployment 與終止中 Pod", "url": "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/"}]
---

## 流量高，不等於需要同樣多的連線

假設每秒有 1000 個資料庫操作，平均借用連線 20 毫秒。在穩定、同一觀測邊界下，用 Little’s Law 推算平均在途借用量約為 `1000 × 0.020 = 20`。這是平均值估算，不是應設池大小 20 的結論；尖峰、尾端延遲、慢交易、重試與多次查詢都會改變需求。

W 應是連線從借到歸還的持有時間，不能只用 SQL 執行 2 毫秒而漏掉 Reader 消費、鎖等待與交易。資料庫過載後 W 會增加，使需求再次上升；把池調大不保證可以恢復。

## 所有池加總的預算

對每個資料庫 endpoint、角色與 pooler 後端分別算：

~~~text
配置連線上限 = Σ（程序數 × 該程序內每個相關池的 MaxPoolSize）
可供應用使用的 session = 平台上限 − 管理／恢復保留 − 其他工作需求
~~~

假設學習模型有 8 個 API Pod、更新最多多 2 個、2 個 Worker Pod。每個程序對 primary 只有一個池；API 候選最大 20，Worker 最大 10，另外工具與其他應用共留 30：

| 項目 | 上限估算 |
| --- | --- |
| API 含 rolling surge | (8 + 2) × 20 = 200 |
| Worker | 2 × 10 = 20 |
| 工具與其他應用 | 30 |
| 合計 | 250 |

如果 primary 實際可用預算是 300，尚有 50 的配置餘裕。這些是算術示例，沒有驗證主機真的能安全同時執行 250 個 SQL。讀副本池、不同 tenant／帳號、額外 worker、failover 集中流量與 pooler 對應 server session 需要另算。

這裡假設更新時額外存活的 API 確實最多 2 個。實際 rollout 要包含尚未釋放連線的 terminating Pod；Kubernetes 的總存活 Pod 可能暫時超過 replicas + maxSurge，不能只以 maxSurge 當作池預算的保證。

## 連線上限之外，控制 active 工作

每個 API 實例可先限制能進入資料庫的工作數，超額者短期、有界等待或按契約拒絕。程序內 SemaphoreSlim 只限制該程序；HPA 擴容也會倍增限制總量。排隊上限、最大副本與讀寫配額要一起設計，並觀察全系統 active query 和池等待。

| 現象 | 優先診斷 | 單純加大池的後果 |
| --- | --- | --- |
| 漏釋放／長 Reader | 連線持有時間和歸還 | 更晚才耗盡 |
| 熱點鎖等待 | 交易、鎖順序與熱門列 | 讓更多工作一起等待 |
| CPU／I/O 飽和 | 計畫、索引、傳輸量與磁碟 | 增加競爭及尾端延遲 |
| DB 尚有容量，應用池等待高 | 目前池上限、重建與借用量 | 可小步調整，但要重新驗證 |

背景匯入可用獨立小池和限速，避免佔滿線上 API 的名額；它仍與 API 共用資料庫 CPU／I/O。Queue 也須有界，RabbitMQ 堆積或無限記憶體等待不會提高 DB 吞吐量。

## 逾時、重試與失敗模式

配置整筆 deadline，將應用排隊、Open、Command、交易與取消收尾放進時間線。重試限定可識別的暫時錯誤，採有界次數與退避；寫入先有冪等與未知結果恢復契約。

驗證快取失效／Redis 停止、read replica 不可用與 primary 切換時的回源量。不要只依高快取命中率估計正常時的資料庫負載，再允許 HPA 無限制擴容。
