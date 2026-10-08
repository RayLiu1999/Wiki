---
title: "資料庫專題：高併發與大量訂單"
description: "將 C# 連線、高併發 CRUD、上億筆資料與 GKE 容量串回商品和訂單。"
group: "ecommerce"
order: 18
environment: "reading"
verification: "2026-10-09 加入資料庫設計專題；C# 設定範例編譯及離線解析通過；未執行高併發 CRUD、上億列、分片或雲端復原。"
linkedArticles: ["data-access-csharp-connections", "data-access-mysql-dotnet", "data-access-postgresql-dotnet", "data-access-pool-capacity", "data-access-concurrent-crud", "data-access-isolation-locking", "data-access-large-table-queries", "data-access-bulk-retention", "data-access-partitioning-sharding", "data-access-replication-recovery", "data-access-load-validation"]
prerequisites: ["start/responsibilities", "ecommerce/ordering-inventory"]
sources: [{"title": "Npgsql DataSource", "url": "https://www.npgsql.org/doc/basic-usage.html"}, {"title": "MySqlConnector 連線設定", "url": "https://mysqlconnector.net/connection-options/"}]
---

這是十七個主線章節之外的深入專題。從[商品 API](/projects/ecommerce/product-api/)、[訂單與庫存](/projects/ecommerce/ordering-inventory/)或[多副本與擴縮](/projects/ecommerce/scaling/)閱讀到容量問題時，可以進入這裡。

## 先選權威交易來源

MySQL 與 PostgreSQL 是兩種可比較的方案，不要求同一筆訂單同時寫入兩套資料庫。現有快取與訊息實驗仍以 PostgreSQL 為來源；本專題加入 MySQL 設計與 driver 範例，沒有將它改成雙資料庫系統。

| 電商需求 | 設計重點 | 深入文章 |
| --- | --- | --- |
| 商品 API 同時接受很多查價 | 正確借還連線、有限等待、投影與索引 | [C# 連線](/data-access/csharp-connections/)、[池容量](/data-access/pool-capacity/) |
| 促銷尖峰多人購買同一 SKU | 原子條件更新、交易、鎖順序與去重 | [高併發 CRUD](/data-access/concurrent-crud/)、[隔離與鎖](/data-access/isolation-locking/) |
| 下單成功後查詢訂單 | 權威讀取、冪等結果、副本延遲 | [讀副本與復原](/data-access/replication-recovery/) |
| 訂單歷史累積到一億列 | 查詢範圍、穩定游標、資料寬度與工作集 | [大表查詢](/data-access/large-table-queries/) |
| 匯入商品、回填價格、清理歷史 | 批次、checkpoint、日誌、vacuum／purge | [大量寫入與保留](/data-access/bulk-retention/) |
| 歷史維護或主庫容量達到限制 | 分割、封存、分片與一致性成本 | [分割與分片](/data-access/partitioning-sharding/) |
| GKE 增加 API／Worker 副本 | 所有池合計、rollout 額外 Pod、依賴容量 | [池容量](/data-access/pool-capacity/)、[GKE 資料服務](/platforms/gke/data-services/) |
| 證明服務在尖峰和故障下仍正確 | 工作負載、p99、業務不變量和恢復結果 | [容量驗證](/data-access/load-validation/) |

## 買家流量如何進入資料庫

<figure class="concept-flow"><figcaption>查詢與交易各有自己的容量邊界</figcaption><ol><li>買家請求</li><li>API 的有限工作量</li><li>命中 Redis 或回源</li><li>driver 借出連線</li><li>主庫查詢／交易</li><li>歸還連線與回應</li></ol></figure>

Redis 可以減少部分重複查詢，失效時仍需限制回源；RabbitMQ 可以延後允許非同步的工作，但佇列和 Worker 也要有處理容量。庫存權威更新不會因加入快取或佇列而自動完成。

## 設定、模型與容量一起決定

MySqlConnector／Npgsql 的池、逾時、取消與 TLS 屬於用戶端；max_connections、記憶體與維護屬於資料庫；查詢、交易、冪等與工作量上限屬於應用。設定要跟部署的全部程序合計，不只看單一 API。

MySQL InnoDB 預設 Repeatable Read，PostgreSQL 預設 Read Committed。兩者的鎖、維護、分割約束、driver 參數與雲端方案需分別核對；不要把一份設定表視為所有資料庫都通用。

## 演進順序

先完成正確且可觀測的單一主庫用例，量測 SQL 和持有時間，再核對池及入場上限。之後依證據加入索引／游標、批次與保留、允許延遲的讀副本；分割按維護需求評估，分片在實際容量與邊界方案清楚後再考慮。

先讀[資料存取主題](/data-access/)。需要執行指令時，進[驗證指南](/practice/ecommerce/database-validation/)，先確認工具、目錄與驗證層次。

此處的庫存、分割、分片、壓測與恢復是設計案例。本次新增程式只完成編譯與離線設定解析，沒有實際高併發 CRUD 或一億列驗證。
