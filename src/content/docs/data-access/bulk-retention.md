---
title: "大量寫入與保留：批次、COPY、清理與 Migration"
description: "讓匯入、回填與歷史清理有界、可續跑，控制日誌、鎖與複寫負擔。"
articleId: "data-access-bulk-retention"
topic: "data-access"
category: "database-scale"
order: 17
tags: ["MySQL", "PostgreSQL", "COPY", "Bulk Copy", "Autovacuum", "Backfill", "資料保留"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["data-access-batch-updates", "data-access-migrations"]
relatedArticles: ["data-access-large-table-queries", "data-access-partitioning-sharding", "data-access-load-validation"]
applicableVersions: "以 .NET 10、MySQL 8.4（InnoDB）、PostgreSQL 18 說明；driver／EF provider 的主版相容性須各自核對。"
verifiedWith: "2026-10-09 核對官方文件；SQL 為有前提的設計示意，未執行實際 CRUD、故障切換或上億筆壓測。"
lastReviewed: "2026-10-09"
takeaway: "讓匯入、回填與歷史清理有界、可續跑，控制日誌、鎖與複寫負擔。"
noteDates: []
sources: [{"title": "Npgsql：COPY 匯入與取消", "url": "https://www.npgsql.org/doc/copy.html"}, {"title": "MySqlConnector：MySqlBulkCopy", "url": "https://mysqlconnector.net/api/mysqlconnector/mysqlbulkcopytype/"}, {"title": "PostgreSQL 18：例行 VACUUM", "url": "https://www.postgresql.org/docs/18/routine-vacuuming.html"}, {"title": "PostgreSQL 18：線上建立索引與失敗處理", "url": "https://www.postgresql.org/docs/18/sql-createindex.html"}, {"title": "MySQL 8.4：Online DDL 的限制", "url": "https://dev.mysql.com/doc/refman/8.4/en/innodb-online-ddl-limitations.html"}]
---

## 訂單歷史如何長期累積

大量資料不是只有「如何插得快」。每日新增、價格回填、取消訂單、歷史封存與模型變更，會同時影響交易延遲、日誌、備份和讀副本。先列出資料保留規則、查詢期限及允許維護的資源預算。

匯入檔案和事件也要驗證型別、精度、重複識別與業務約束。批次工具不會替應用決定哪一筆是重送或哪個價格有效。

## 分批提交，提交後才保存進度

以穩定排序鍵分段讀取／寫入，限制每批的列數、bytes 和最長持有時間。checkpoint 應對應已提交的結果，續跑時仍以唯一識別或版本條件保持冪等。失敗時重跑一批，不要跳過尚未提交的區段。

批次大小是量測結果：小批有更多 round trip，大批有較長鎖、更多記憶體與日誌。不能把整份上億列資料放進 DataTable／ToList，也不能假設一次巨大交易最有效率。進度與完成時間之外，量測前台延遲、複寫落後與清理是否追得上。

## 各種寫入方式有不同邊界

| 方法 | 適用方式與限制 |
| --- | --- |
| EF Core 的批次命令／ExecuteUpdate | 核對生成 SQL、追蹤狀態與交易；集合更新不能取代業務規則 |
| Npgsql binary COPY | 逐列、按明確型別寫入；呼叫 Complete／CompleteAsync 才完成，未完成就釋放會取消該次匯入 |
| MySqlConnector MySqlBulkCopy | 官方標示 experimental，固定版本；需明確評估 AllowLoadLocalInfile 與可信輸入，不對所有應用連線全面開啟 |
| staging 後驗證再合併 | 將格式／重複檢查和正式資料切換分開；額外表、索引、權限與清理也有成本 |

本篇沒有執行 COPY、LOAD DATA、建立 staging 或提供可直接上線的匯入腳本。實作 schema 時需在同一 migration 保存表與欄位註解，並確認 metadata、約束和回復流程。

## 更新與刪除後還需要維護

PostgreSQL 的 MVCC 會留下需要清理的舊版本。監測 autovacuum、長交易、dead tuple、統計更新與 transaction ID 的維護；例行 VACUUM 的可重用空間不等於立刻把檔案縮小交還作業系統。不能為了速度關掉 autovacuum。

MySQL InnoDB 要觀察 undo／purge、長交易、redo／binlog、磁碟與複寫。兩套資料庫都不適合在尖峰用一個無界 DELETE 清理全部歷史；採有界區段，保留重試與完成核對。刪除、重建或回收磁碟是不同操作。

資料保留要包含訂單法律／營運需求、個資、封存與查詢權限。封存完成不能只看搬出的列數，也要驗證時間範圍、識別、內容完整性及可還原性，再安排來源清理。

## 大表變更分階段進行

先擴充相容結構，再有限回填並驗證，切換讀寫後才移除舊結構。限制回填工作量並記錄 checkpoint，避免部署等待一次巨量回填。

PostgreSQL CREATE INDEX CONCURRENTLY 有執行與失敗限制，不能放進一般 transaction block；中斷可能留下需要處理的無效索引。MySQL 的 online DDL 仍可能等待或取得 metadata lock，具體 ALGORITHM／LOCK 支援取決於操作與版本。上線前核對磁碟暫存、等待、複寫與失敗處理，不能以「online」宣稱零影響。

若主要痛點是按時間維護大量歷史，再評估[分割與封存](/data-access/partitioning-sharding/)，並確認唯一性和外鍵是否仍成立。
