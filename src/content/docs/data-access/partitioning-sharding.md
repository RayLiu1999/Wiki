---
title: "分割、封存與分片：一億列之後的選擇"
description: "依維護與容量證據區分 partition、archive 和 shard，保留唯一性與交易邊界。"
articleId: "data-access-partitioning-sharding"
topic: "data-access"
category: "database-scale"
order: 18
tags: ["Partition", "Shard", "分割表", "分片", "封存", "CDC", "上億筆"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["data-access-large-table-queries", "data-access-bulk-retention"]
relatedArticles: ["data-access-replication-recovery", "data-access-load-validation"]
applicableVersions: "以 .NET 10、MySQL 8.4（InnoDB）、PostgreSQL 18 說明；driver／EF provider 的主版相容性須各自核對。"
verifiedWith: "2026-10-09 核對官方文件；SQL 為有前提的設計示意，未執行實際 CRUD、故障切換或上億筆壓測。"
lastReviewed: "2026-10-09"
takeaway: "依維護與容量證據區分 partition、archive 和 shard，保留唯一性與交易邊界。"
noteDates: []
sources: [{"title": "PostgreSQL 18：分割表", "url": "https://www.postgresql.org/docs/18/ddl-partitioning.html"}, {"title": "MySQL 8.4：分割鍵與唯一鍵", "url": "https://dev.mysql.com/doc/refman/8.4/en/partitioning-limitations-partitioning-keys-unique-keys.html"}, {"title": "MySQL 8.4：分割表與外鍵限制", "url": "https://dev.mysql.com/doc/refman/8.4/en/partitioning-limitations-storage-engines.html"}, {"title": "PostgreSQL 18：高可用與複寫", "url": "https://www.postgresql.org/docs/18/high-availability.html"}]
---

## 先指出真正的瓶頸

一億列本身不表示一定要分片。如果查詢只讀少量索引頁，寫入、備份與維護仍達標，可以繼續用單一資料庫。需要變更時，說明是時間區間清理、活躍工作集、單機 CPU／I/O，還是交易熱點造成限制。

| 手段 | 解決方向 | 新增的責任 |
| --- | --- | --- |
| 索引／查詢調整 | 減少不必要讀取、排序與傳輸 | 寫入代價、統計與計畫核對 |
| 封存 | 分開常用與歷史資料 | 可查詢性、保留規則與還原 |
| 表分割 partition | 管理資料區段、可能裁剪查詢 | 分割維護、約束、跨區段查詢 |
| 讀副本 | 分擔允許延遲的讀取 | 路由、複寫延遲與故障負載 |
| 分片 shard | 將資料與工作分到不同資料庫 | 路由、跨片操作、搬遷與恢復 |

## 表分割仍屬於同一套資料庫資源

按訂單時間分割，可協助管理歷史區段與符合條件的 partition pruning。查詢必須能讓規劃器裁剪；只有訂單 id 而沒有時間條件的查詢，未必得到相同好處。過多分割也增加規劃與維護成本。

分割不會自動增加主庫的 CPU 或寫入能力；熱門商品的同一列競爭也不會因歷史訂單分割而消失。新增未來區段、遲到資料和移除歷史區段都要設計。

## 唯一性與外鍵先確認

| 資料庫 | 必須確認的限制 |
| --- | --- |
| PostgreSQL 18 | 在分割表上建立 UNIQUE／PRIMARY KEY 有條件，須包含所有分割鍵欄位，分割鍵的 expression／function 也受限制 |
| MySQL 8.4 | 每個 UNIQUE／PRIMARY KEY 需包含分割運算使用的所有欄位；InnoDB 的使用者分割表與外鍵不相容 |

例如把 `(order_id)` 改成 `(created_at, order_id)`，約束保證的是組合唯一，不能據此宣稱 order_id 跨所有時間仍唯一。request id 的冪等與外部訂單查詢，也要有真正成立的唯一性方案。由應用產生 ID 不是免除資料庫一致性設計的理由。

不要因為需要外鍵就直接拿掉它，也不要以分割 DDL 遮蓋整體模型改變。本篇提供決策原理，沒有將現有實驗訂單表改成分割表。

## 何時才進入分片

在索引、工作量限制、適當規格與資料保留仍無法符合可量測的容量／維護需求時，再評估分片。先定 shard key：買家、商家或租戶會改變哪些交易能留在同一片；跨商家購物與熱門 SKU 特別需要說明。

單一熱點不一定能被 hash 分散。分片還要處理路由版本、全域識別與去重、跨片查詢、交易替代方案、重平衡、故障隔離、備份與每片 schema 更新。至少先畫出一筆訂單的寫入、回復和搬遷時序，再討論增加節點數量。

## 分析與交易可以使用不同讀取模型

跨所有年份的大型報表可考慮獨立分析系統，透過 CDC／批次建立讀取模型，避免與尖峰下單搶同一資源。必須標示資料新鮮度、刪除／schema 演進、重送與對帳方式；分析結果不能直接當作即時庫存的權威來源。

回到[電商資料庫專題](/projects/ecommerce/database-capacity/)，用訂單查詢、扣庫存與歷史維護逐項選擇，避免一次導入所有手段。
