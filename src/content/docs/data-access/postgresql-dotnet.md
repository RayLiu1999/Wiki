---
title: "C# 與 PostgreSQL：Npgsql、池與工作量"
description: "用 NpgsqlDataSource 理解可共用設定、獨立連線及 PostgreSQL 的記憶體與維護。"
articleId: "data-access-postgresql-dotnet"
topic: "data-access"
category: "database-connections"
order: 12
tags: ["PostgreSQL", "Npgsql", "C#", "PgBouncer", "work_mem", "autovacuum"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["data-access-csharp-connections"]
relatedArticles: ["data-access-pool-capacity", "data-access-isolation-locking", "data-access-replication-recovery"]
applicableVersions: "以 .NET 10、MySQL 8.4（InnoDB）、PostgreSQL 18 說明；driver／EF provider 的主版相容性須各自核對。"
verifiedWith: "2026-10-09：.NET SDK 10.0.105 編譯與 --validate 離線設定解析通過；價格 SQL 方法未被呼叫，未驗證資料庫連線、CRUD 或效能。"
lastReviewed: "2026-10-09"
takeaway: "用 NpgsqlDataSource 理解可共用設定、獨立連線及 PostgreSQL 的記憶體與維護。"
noteDates: []
sources: [{"title": "Npgsql：DataSource 與借還連線", "url": "https://www.npgsql.org/doc/basic-usage.html"}, {"title": "Npgsql：連線設定", "url": "https://www.npgsql.org/doc/connection-string-parameters.html"}, {"title": "PostgreSQL 18：記憶體與資源", "url": "https://www.postgresql.org/docs/18/runtime-config-resource.html"}, {"title": "PostgreSQL 18：例行 VACUUM", "url": "https://www.postgresql.org/docs/18/routine-vacuuming.html"}, {"title": "PgBouncer：池模式與相容性", "url": "https://www.pgbouncer.org/features.html"}]
---

## 重用 DataSource，短期借出 Connection

NpgsqlDataSource 封裝 Npgsql 的設定與池，通常在同一程序、同一連線目的重用一個實例。每個 API Pod、Worker 與不同 DataSource 仍要分別計算；程序內 Singleton 不是全系統唯一的池。

以下使用 Npgsql 10.0.3。`source` 由呼叫端提供；`products(id, price)` 必須已存在且型別相容。完整方法只示範單筆價格讀取，未驗證大量資料效能。

~~~csharp
using Npgsql;
using NpgsqlTypes;

public static class PostgreSqlProductQueries
{
    // 呼叫端提供已存在的 products(id, price)；本範例不建立資料表。
    public static async Task<decimal?> ReadPriceAsync(
        NpgsqlDataSource source, long productId, CancellationToken token)
    {
        await using var connection = await source.OpenConnectionAsync(token);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT price FROM products WHERE id = $1";
        command.Parameters.Add(new NpgsqlParameter { NpgsqlDbType = NpgsqlDbType.Bigint, Value = productId });
        object? value = await command.ExecuteScalarAsync(token);
        return value is null or DBNull ? null : Convert.ToDecimal(value);
    }
}
~~~

`$1` 是 Npgsql 的位置參數，與 PostgreSQL 欄位型別分開核對。若一次操作需要多個 Command，讓同一個交易擁有連線；若要並行，另借各自連線／context，且受總工作量限制。

## PostgreSQL 設定的層級

| 層級 | 設定或指標 | 要理解的成本 |
| --- | --- | --- |
| Npgsql 池 | Maximum Pool Size、Minimum Pool Size、idle／lifetime | 借出／歸還與重建頻率；同一 endpoint 的各池仍可能累加 |
| Npgsql 命令 | Timeout、Command Timeout、Cancellation Timeout | 範例取消等待為 2000 毫秒；不要與 MySqlConnector 的秒混用 |
| 伺服器連線 | max_connections、保留管理連線 | session 上限與後端程序等資源；不代表安全 active query 數 |
| 查詢記憶體 | work_mem、hash_mem_multiplier、平行查詢 | 多個排序／hash 節點、session 與 worker 可同時配置 |
| 快取與維護 | shared_buffers、作業系統快取、autovacuum、WAL | 工作集、更新清理、磁碟及還原需求一起估算 |

`work_mem` 不是整個伺服器的單一總額。每個工作計畫中可能有多個需要記憶體的操作；提高數值而同時大量並行，反而可能出現記憶體壓力。應用端少傳資料、先改善 SQL，再依代表性計畫量測。

## 外部 pooler 的邊界

PgBouncer 可在許多 client 連線與較少 PostgreSQL server session 間進行池化。Transaction pooling 會在交易結束歸還 server session，因此 session-level SET、LISTEN、advisory lock 等使用方式需要核對。

協定層 prepared statements 的支援與 PgBouncer 版本／`max_prepared_statements` 配置有關，不能一律說「不支援」，也不能假設現有使用方法都相容。導入時驗證 ORM、交易、暫存表和每次借用的 session 狀態。

Pooler 管理連線數，不會縮短一段慢 SQL 或讓同一庫存列可無限並行更新。Cloud SQL Auth Proxy 提供安全連接途徑，也不等同 PgBouncer。

## 寫入之後的長期成本

PostgreSQL 更新／刪除會留下需要 VACUUM 清理的版本；長交易、慢 Reader 或維護不足會影響清理。大量匯入、清理與報表還需安排 WAL、複寫和統計更新。預設 Read Committed 的一般查詢以各 statement 的快照為基準，並非整筆交易不變快照。

從[容量地圖](/knowledge-maps/database-scale/)先建立預算，再用[驗證指南](/practice/ecommerce/database-validation/)檢查真實環境。
