---
title: "資料庫驗證：設定、連線與容量證據"
description: "從可編譯的 C# 設定範例開始，分開連線檢查、CRUD、容量和復原驗證。"
group: "practice"
order: 7
environment: "reading"
verification: "2026-10-09：dotnet run --validate 編譯與離線設定解析通過；未執行 --probe、實際 CRUD、上億列負載或恢復。"
linkedArticles: ["data-access-csharp-connections", "data-access-mysql-dotnet", "data-access-postgresql-dotnet", "data-access-pool-capacity", "data-access-load-validation", "data-access-concurrent-crud"]
prerequisites: ["ecommerce/database-capacity"]
sources: [{"title": "MySqlConnector 安裝", "url": "https://mysqlconnector.net/overview/installing/"}, {"title": "Npgsql 連線設定", "url": "https://www.npgsql.org/doc/connection-string-parameters.html"}]
---

## 本指南會執行什麼

獨立程式位於 Wiki 原始碼的 `examples/database-connections/`，使用 .NET 10、MySqlConnector 2.5.0 與 Npgsql 10.0.3。它不啟動 API、容器或資料庫，也不會建立 schema、種大量資料或下單。

| 模式 | 需要的環境 | 驗證範圍 |
| --- | --- | --- |
| 預設／--validate | .NET SDK 與已還原套件 | 編譯、DI 建構與設定解析；不連線 |
| --probe mysql | 自己的 MySQL 測試端點與安全設定 | TLS、登入與 SELECT 1 |
| --probe postgresql | 自己的 PostgreSQL 測試端點與安全設定 | TLS、登入與 SELECT 1 |
| CRUD／壓測／恢復 | 另有隔離環境、模型和測試方案 | 本指南提供記錄方法，尚無已執行結果 |

## 準備原始碼與工具

使用與本頁相同版本的 Wiki 原始碼，確認其中有 `examples/database-connections/ConnectionPatterns.csproj`。在終端機切到 Wiki 儲存庫根目錄（能看到 README.md、global.json 和 examples 的資料夾），以下指令都在這個目錄執行。

.NET SDK 需求依根目錄 global.json，目前為 10.0.105／同 feature band 更新 patch。第一次執行要能從 NuGet 還原固定的兩個 driver。網站本身仍是靜態網站，不需資料庫才能閱讀。

## 先做不連線的驗證

`dotnet run` 會還原、編譯這個 C# 專案，再把 `--` 後面的 `--validate` 傳給程式；這不是 MySQL 或 PostgreSQL 的管理指令。

~~~sh
dotnet run --project examples/database-connections/ConnectionPatterns.csproj -- --validate
~~~

成功輸出如下，exit code 為 0：

~~~text
MySQL 與 PostgreSQL DataSource 設定解析通過。
此模式未建立資料庫連線，未驗證 CRUD 或效能。
~~~

預設使用 example.invalid 保留網域，只建構 DataSource，沒有發送 SQL。兩種資料庫的價格查詢類別也會被編譯，但未被呼叫。此層不能證明帳密、網路、schema 或效能正確。

## 選用：自己的 TLS 測試資料庫

先準備可達端點、合法帳號和相符的信任鏈／主機名稱。程式會強制 `SslMode=VerifyFull`，依資料庫與 driver 準備 CA 信任；現有 Compose 範例沒有配置這組 TLS，不能直接拿它的 localhost 連線字串執行本模式。

由自己的機密設定提供 `DB_MYSQL` 或 `DB_POSTGRESQL` 環境變數。內容是各 driver 的連線字串，包含 host／port、資料庫、身分與必要的安全設定；密碼不寫在文章、命令範例或 Git。對照[MySQL](/data-access/mysql-dotnet/)或[PostgreSQL](/data-access/postgresql-dotnet/)的設定說明。

只選實際要檢查的一種端點執行：

~~~sh
dotnet run --project examples/database-connections/ConnectionPatterns.csproj -- --probe mysql
~~~

或者：

~~~sh
dotnet run --project examples/database-connections/ConnectionPatterns.csproj -- --probe postgresql
~~~

成功時顯示 `SELECT 1 連線檢查通過。`，exit code 0。缺少相應環境變數會在連線前停止；網路、TLS、登入、取消或 SQL 失敗也不代表通過。離開程式會釋放 DI、DataSource 和連線，不需啟動或關閉任何 Compose 服務。

本次維護未執行 --probe。SELECT 1 成功後仍未驗證 products 查價、高併發 CRUD、交易或大量資料。

## 規劃真正的 CRUD 與負載驗證

另建隔離測試環境，記錄 schema／migration、索引與欄位註解，先驗證正確性；現有實驗沒有買家權限、扣庫存或完整付款，不能據此宣稱已完成這些測試。

| 情境 | 必須核對的結果 |
| --- | --- |
| 同一 request 重送 | 一筆業務結果；不同內容使用同鍵能被辨識 |
| 多人購買同一 SKU | 不超賣；交易內訂單與庫存一致 |
| 兩次並行修改 | 版本衝突或條件更新結果符合契約 |
| COMMIT 附近取消／斷線 | 查詢權威結果後再決定重試 |
| 長 Reader／交易和池耗盡 | 能定位等待，工作量有界，恢復後可再借連線 |
| 副本或 Redis 失效 | 主庫回源／路由量仍符合預算 |
| HPA 與 rollout | 所有 API、Worker、額外 Pod 的池總量可容納 |
| 大量更新、回填與清理 | 可續跑，前台延遲與維護負擔符合目標 |

準備小量、代表性、大表三個階段；只有實際完成目標資料量及 workload 才寫為已驗證。生成一億列是另一次有容量與清理計畫的實驗，這份指南沒有生成指令。

## 每次測試填一張記錄表

| 項目 | 記錄內容 |
| --- | --- |
| 版本與拓撲 | driver、EF、DB、CPU／RAM／I/O、網路、主副本與 Pod |
| 資料 | 列數、資料／索引 bytes、分布、熱點、統計與快取狀態 |
| 到達負載 | 讀寫比例、SQL 次數、到達率或固定併發、測試時長 |
| 容量設定 | 每池上限、池數、入場上限、deadline、重試、伺服器限制 |
| 服務結果 | 完成／拒絕／逾時、p95／p99、庫存／冪等正確性 |
| 等待與資源 | 應用排隊、借池、SQL／鎖、提交、CPU、I/O、日誌與複寫 |
| 長期與恢復 | vacuum／purge、積壓、備份還原實際 RPO／RTO |

從[容量驗證文章](/data-access/load-validation/)選擇要回答的問題，每次只調有理由的變因，保存前後結果與失敗。硬體、資料與測量缺一時，結論維持為待驗證方案。
