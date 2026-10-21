---
title: "資料庫專題：高併發與大量訂單"
description: "將 C# 連線、高併發 CRUD、上億筆資料與 GKE 容量串回商品和訂單。"
group: "ecommerce"
order: 18
linkedArticles: ["data-access-csharp-connections", "data-access-mysql-dotnet", "data-access-postgresql-dotnet", "data-access-pool-capacity", "data-access-concurrent-crud", "data-access-isolation-locking", "data-access-large-table-queries", "data-access-bulk-retention", "data-access-partitioning-sharding", "data-access-replication-recovery", "data-access-load-validation"]
prerequisites: ["start/responsibilities", "ecommerce/ordering-inventory"]
sources: [{"title": "Npgsql DataSource", "url": "https://www.npgsql.org/doc/basic-usage.html"}, {"title": "MySqlConnector 連線設定", "url": "https://mysqlconnector.net/connection-options/"}]
---

這是十七個主線章節之外的深入專題。從[商品 API](/projects/ecommerce/product-api/)、[訂單與庫存](/projects/ecommerce/ordering-inventory/)或[多副本與擴縮](/projects/ecommerce/scaling/)閱讀到容量問題時，可以進入這裡。

## 先選權威交易來源

MySQL 與 PostgreSQL 是兩種可比較的方案，不要求同一筆訂單同時寫入兩套資料庫。本站的電商案例以 PostgreSQL 為權威來源；本專題同時說明 MySQL 的差異，但不是雙資料庫系統。

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

## 怎麼證明容量足夠

連得上資料庫，只代表帳密、網路和 TLS 正確，不代表查詢、交易或容量沒問題。正確性要先於效能驗證，每個情境都要核對業務結果：

| 情境 | 必須核對的結果 |
| --- | --- |
| 同一個請求重送 | 只有一筆業務結果；同一個鍵帶不同內容能被辨識 |
| 多人購買同一 SKU | 不超賣；交易內訂單與庫存一致 |
| 兩次並行修改 | 版本衝突或條件更新的結果符合契約 |
| COMMIT 附近取消或斷線 | 先查詢權威結果，再決定要不要重試 |
| 長交易與連線池耗盡 | 能定位等待在哪裡，工作量有上限，恢復後能再借到連線 |
| 讀副本或 Redis 失效 | 回到主庫的流量仍在預算內 |
| HPA 擴容與 rollout | 所有 API、Worker 與額外 Pod 的連線池加總，資料庫容納得下 |
| 大量更新、回填與清理 | 中斷後可續跑，前台延遲與維護負擔符合目標 |

資料量分小量、代表性、大表三個階段逐步加大。只有實際跑到目標資料量與工作負載，才能說容量已驗證。

每次測試都記下同一組資訊，前後結果才能比較：

| 項目 | 記錄內容 |
| --- | --- |
| 版本與拓撲 | driver、EF、資料庫版本、CPU／RAM／I/O、網路、主副本與 Pod 數 |
| 資料 | 列數、資料與索引大小、分布、熱點、統計與快取狀態 |
| 負載 | 讀寫比例、SQL 次數、到達率或固定併發、測試時長 |
| 容量設定 | 每個池的上限、池的數量、入場上限、deadline、重試、伺服器限制 |
| 服務結果 | 完成／拒絕／逾時、p95／p99、庫存與冪等是否正確 |
| 等待與資源 | 應用排隊、借連線、SQL 與鎖、提交、CPU、I/O、日誌與複寫 |
| 長期與恢復 | vacuum／purge、積壓、備份還原的實際 RPO／RTO |

每次只改一個有理由的變因，並保存成功與失敗的結果。硬體、資料或量測缺一項，結論就只能算待驗證的方案。要回答哪些問題，見[容量驗證](/data-access/load-validation/)。
