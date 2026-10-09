# C#、MySQL／PostgreSQL 與資料庫容量架構

更新日期：2026-10-09（Asia/Taipei）。

本次將資料庫能力加入既有 Wiki。MySQL 與 PostgreSQL 是兩種交易資料庫方案，現有實驗仍使用 PostgreSQL；不要求同一筆訂單同時寫入兩套資料庫。

## 與既有架構的關係

- .NET 十個領域與原定六個 P0、四個 P1 保留。D07 加入兩套 driver、CRUD、隔離與大量查詢；D08 引用池、複寫與故障；D09 引用容量量測。
- 雲端九個領域保留。C07 接回 Cloud SQL MySQL／PostgreSQL 與連線預算，C09 量測 HPA／rollout 的總工作量及復原。
- 新增第三份地圖 `/knowledge-maps/database-scale/`，深入八個資料庫領域，引用同一批技術文章。
- 新增五階段路徑 `/learning-paths/dotnet-database-scale/`。原有六條路徑與所有已發布的 articleId／網址保留。
- 電商保留十七個主線章節，另加 `/projects/ecommerce/database-capacity/` 延伸專題；操作集中於 `/practice/ecommerce/database-validation/`。

## 八個領域與新增文章

| 領域 | 必學內容 | 新增主要文章（data-access 下） |
| --- | --- | --- |
| DB01 C# 連線 | provider 相容、DataSource、DbContext、借還與取消 | csharp-connections、mysql-dotnet、postgresql-dotnet |
| DB02 池與工作量 | 所有程序／池預算、入場限制、有界等待、deadline | pool-capacity |
| DB03 併發 CRUD | 冪等、條件更新、交易、隔離、鎖與完整重試 | concurrent-crud、isolation-locking |
| DB04 大表查詢 | 查詢形狀、索引、投影、keyset pagination、執行計畫 | large-table-queries |
| DB05 寫入與維護 | COPY／Bulk Copy、checkpoint、vacuum／purge、回填 | bulk-retention |
| DB06 分割與分片 | 裁剪、唯一性／外鍵、封存、shard key 與跨片責任 | partitioning-sharding |
| DB07 複寫與復原 | 副本延遲、權威讀取、failover、Cloud SQL、PITR | replication-recovery |
| DB08 容量與變更 | 到達率、p95／p99、正確性、長時間負載與相容變更 | load-validation |

這 11 篇文章加入資料存取主題的三個新分類。技術文章說明原理、前提與取捨；電商章節以需求引用；指南交代操作與驗證層次。

網站現在提供 112 篇技術文章、29 篇導讀／章節／指南、3 份地圖與 7 條路徑。三段新增 C# 文章程式與編譯來源一致。

## 核心設計原則

HTTP 併發、開啟的 session、正在執行的 SQL 和持有鎖的交易分開量測。async 不增加資料庫資源；池上限與 max_connections 不是吞吐量承諾。

全系統池預算包括 API、Worker、所有 DataSource、不同身分、更新及終止中程序、migration、工具與恢復。另設 active 工作量和有界等待；PgBouncer 後端 session 與應用 client 池分層計算。

高併發 CRUD 用業務識別、資料庫約束、條件更新及適當交易保持正確。提交附近斷線可能結果未知，不能無條件重送寫入。隔離、鎖與可重試錯誤按 provider 分別核對。

一億列先拆成資料寬度、分布、活躍工作集、查詢範圍和維護成本。從查詢／索引、批次與保留開始，再依證據選讀副本、分割或分片；分割不自動增加主庫算力。

## 已提供的程式與驗證邊界

`examples/database-connections/` 是獨立 .NET 10 Console 範例，固定 MySqlConnector 2.5.0 與 Npgsql 10.0.3。兩種 DataSource 的 DI 與短期、參數化價格查詢可編譯；池 20、開啟 5 秒、命令 3 秒為教學候選值，不代表正式容量設定。

`--validate` 不開連線，僅建構與解析設定。選用的 `--probe mysql|postgresql` 需使用者自己的 TLS 端點與環境機密，只執行 SELECT 1；本次未執行 probe。價格方法需要已存在的相容 products 表，沒有新增 schema 或 migration。

本次沒有實際高併發 CRUD、COPY、分割、分片、一億列壓測、Cloud SQL failover 或備份還原結果。後續實驗需另有隔離環境、容量及清理計畫，完成後依實際工具與數據更新文章。

## 本次驗收

| 檢查 | 結果 |
| --- | --- |
| C# 設定範例 | .NET SDK 10.0.105 編譯及 --validate 成功；沒有資料庫連線 |
| 網站靜態與建置 | pnpm check 通過：型別零診斷、lint、6 段既有片段、4 個收藏測試與正式建置；171 個頁面和內部錨點、141 篇搜尋內容及 PWA 一致 |
| 瀏覽器閱讀 | 三份地圖入口、資料庫地圖→C# 文章→指南、MySQL／PostgreSQL 全文搜尋與 PWA 更新已核對；手機視窗下地圖與指南沒有頁面水平溢出 |

先前電商全面改寫的歷史結果仍記錄於 [CONTENT_REWRITE.md](CONTENT_REWRITE.md)。新加入內容不把文件核對或離線解析寫成實際資料庫吞吐驗證。
