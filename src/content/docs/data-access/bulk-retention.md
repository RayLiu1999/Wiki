---
title: "大量寫入與保留：批次、COPY、清理與 Migration"
description: "讓匯入、回填與歷史清理有界、可續跑，控制日誌、鎖與複寫負擔。"
articleId: "data-access-bulk-retention"
topic: "data-access"
category: "database-scale"
order: 17
tags:
  - "MySQL"
  - "PostgreSQL"
  - "COPY"
  - "Bulk Copy"
  - "Autovacuum"
  - "Backfill"
  - "資料保留"
difficulty: "advanced"
prerequisites:
  - "data-access-batch-updates"
  - "data-access-migrations"
relatedArticles:
  - "data-access-large-table-queries"
  - "data-access-partitioning-sharding"
  - "data-access-load-validation"
applicableVersions: "以 .NET 10、MySQL 8.4（InnoDB）、PostgreSQL 18 說明；driver／EF provider 的主版相容性須各自核對。"
lastReviewed: "2026-10-10"
takeaway: "讓匯入、回填與歷史清理有界、可續跑，控制日誌、鎖與複寫負擔。"
sources:
  - title: "Npgsql：COPY 匯入與取消"
    url: "https://www.npgsql.org/doc/copy.html"
  - title: "MySqlConnector：MySqlBulkCopy"
    url: "https://mysqlconnector.net/api/mysqlconnector/mysqlbulkcopytype/"
  - title: "PostgreSQL 18：例行 VACUUM"
    url: "https://www.postgresql.org/docs/18/routine-vacuuming.html"
  - title: "PostgreSQL 18：線上建立索引與失敗處理"
    url: "https://www.postgresql.org/docs/18/sql-createindex.html"
  - title: "MySQL 8.4：Online DDL 的限制"
    url: "https://dev.mysql.com/doc/refman/8.4/en/innodb-online-ddl-limitations.html"
---

## 案發現場

在電商供應鏈、大數據同步或夜間結算系統中，大量資料的匯入與歷史資料清理是系統穩定性的兩大死穴。

典型案發現場一：**EF Core 批次匯入的記憶體與時間黑洞**。
系統每晚需要匯入供應商提供的 50 萬筆商品目錄更新。新手工程師寫法如下：
```csharp
await dbContext.Products.AddRangeAsync(productsList);
await dbContext.SaveChangesAsync();
```
執行結果：Pod 的記憶體從 300MB 飆升至 3.8GB，引發 Kubernetes 容器 OOMKilled；即便加大 Pod 記憶體，該操作耗時仍超過 1.5 小時，連線頻繁逾時中斷。

典型案發現場二：**線上建立索引直接鎖住全表**。
資料表突破數千萬列後，工程師發現某查詢太慢，於是在生產環境執行：
```sql
CREATE INDEX idx_orders_user_id ON orders (user_id);
```
這條指令在 MySQL 或 PostgreSQL 預設模式下會請求資料表鎖。在索引構建的 15 分鐘內，所有的寫入請求全部排隊等待，連線池在 30 秒內崩潰，全站對外服務全面癱瘓。

---

## 反模式與正確解法

### 反模式一：使用 ORM 實體追蹤執行海量寫入

EF Core 的 `AddRangeAsync` 會為這 50 萬個實體物件在 `ChangeTracker` 內建立追蹤條目。在呼叫 `SaveChangesAsync` 時，引擎必須比對 50 萬個物件的狀態，並將其拆解為數萬個單獨的 `INSERT` 陳述式，透過網路反覆傳輸，效率極其低下。

### 正確解法一：採用底層二進位串流工具（PostgreSQL COPY / MySQL BulkCopy）

PostgreSQL 提供了極致高效的 **`COPY` 二進位協議**。Npgsql 透過 `BeginBinaryImportAsync` 直接向資料庫引擎寫入二進位串流，跳過 SQL 解析與語法樹建構。**50 萬筆資料的匯入時間從 1.5 小時驟降至 2.5 秒**：

```csharp
// 正確解法：利用 Npgsql 原生二進位 COPY 達成每秒數十萬筆的極速匯入
public async Task BulkInsertProductsAsync(
    IAsyncEnumerable<ProductImportDto> products, 
    CancellationToken ct)
{
    await using var conn = await _dataSource.OpenConnectionAsync(ct);

    // 啟動二進位 COPY 匯入協議
    const string copySql = """
        COPY products (id, sku, name, price, stock, created_at) 
        FROM STDIN (FORMAT BINARY);
        """;

    await using var writer = await conn.BeginBinaryImportAsync(copySql, ct);

    await foreach (var p in products.WithCancellation(ct))
    {
        await writer.StartRowAsync(ct);
        await writer.WriteAsync(p.Id, NpgsqlDbType.Bigint, ct);
        await writer.WriteAsync(p.Sku, NpgsqlDbType.Varchar, ct);
        await writer.WriteAsync(p.Name, NpgsqlDbType.Varchar, ct);
        await writer.WriteAsync(p.Price, NpgsqlDbType.Numeric, ct);
        await writer.WriteAsync(p.Stock, NpgsqlDbType.Integer, ct);
        await writer.WriteAsync(DateTimeOffset.UtcNow, NpgsqlDbType.TimestampTz, ct);
    }

    // 完成串流寫入並在資料庫端批量提交
    await writer.CompleteAsync(ct);
}
```
*(在 MySQL 環境下，改用 `MySqlConnector.MySqlBulkCopy` 亦可達到相似的極致吞吐效能)*。

---

### 反模式二：無鎖機制線上變更結構（DDL）

直接在包含數千萬列的生產資料表執行 `CREATE INDEX` 或 `ALTER TABLE`，會持有表級排他鎖，阻擋一切正常的讀寫流量。

### 正確解法二：無鎖並行建立索引與可續跑分塊清理

1. **並行無鎖建立索引**：
   - **PostgreSQL**：必須使用 `CREATE INDEX CONCURRENTLY`。PostgreSQL 會分兩個階段掃描資料表，構建過程中完全不阻擋任何 SELECT、INSERT、UPDATE 或 DELETE！
   - **MySQL (InnoDB)**：明確指定 Online DDL 參數 `ALGORITHM=INPLACE, LOCK=NONE`。

2. **有界分塊清理（Chunked Delete with Sleep）**：
   針對歷史資料清理，絕不要單次 DELETE 數萬筆。應將刪除拆分成固定大小（如 1,000 筆）的有界分塊，並在每個分塊之間加入毫秒級微小暫停，讓資料庫有喘息機會回放複製日誌與回收記憶體：

```csharp
// 正確解法：安全、可續跑、不卡鎖的有界分塊歷史清理
public async Task CleanExpiredLogsSafelyAsync(
    DateTimeOffset cutoffDate, 
    CancellationToken ct)
{
    const int batchSize = 1000;
    int deletedCount;

    do
    {
        // 每次只鎖定並刪除固定批次，且以主鍵排序縮小鎖定範圍
        deletedCount = await _db.AuditLogs
            .Where(x => x.CreatedAt < cutoffDate)
            .OrderBy(x => x.Id)
            .Take(batchSize)
            .ExecuteDeleteAsync(ct);

        _logger.LogInformation("安全分塊清理已刪除 {Count} 筆過期日誌", deletedCount);

        // 關鍵：暫停 50 毫秒，釋放 CPU，讓 Replication Worker 與 Autovacuum 順暢運作
        if (deletedCount > 0)
        {
            await Task.Delay(50, ct);
        }
    } 
    while (deletedCount == batchSize && !ct.IsCancellationRequested);
}
```

---

## 踩坑與避坑指南

### 1. PostgreSQL COPY 的唯一鍵衝突處理
- **踩坑點**：PostgreSQL 的 `COPY` 命令追求極致速度，因此**不支援 `ON CONFLICT DO UPDATE / NOTHING`**。如果在 COPY 串流中有任何一筆資料違反唯一索引或外鍵約束，整批匯入將立即中斷並全部回滾。
- **最佳解法（Staging Table 模式）**：
  1. 先用 `COPY` 極速寫入無約束的暫存表（`UNLOGGED TABLE temp_products`）。
  2. 接著在資料庫內部發送一條原子 SQL：`INSERT INTO products SELECT * FROM temp_products ON CONFLICT (sku) DO UPDATE ...;`。
  3. 清空或刪除暫存表。

### 2. CONCURRENTLY 建立索引失敗後的「無效索引（Invalid Index）」殘留
- 在 PostgreSQL 中，若 `CREATE INDEX CONCURRENTLY` 在執行期間因為唯一鍵衝突或逾時失敗，PostgreSQL **不會自動刪除該索引**，而是將其標記為 `INVALID`。
- **踩坑點**：無效索引無法被查詢使用，但後續的每一次 INSERT/UPDATE 卻仍必須維護它，白白浪費 I/O 與磁碟！
- **避坑規則**：線上 Migration 失敗後，必須手動檢查並執行 `DROP INDEX CONCURRENTLY idx_name;` 清理無效索引。

### 3. Autovacuum 調優配合海量寫入
- 在執行完數百萬筆的大量寫入或批次刪除後，資料表中會殘留大量 Dead Tuples。若預設的 Autovacuum 參數過於保守，表會嚴重膨脹。
- 在批次作業完成後，可在離峰期手動觸發 `VACUUM ANALYZE table_name;`，讓查詢最佳化器立即更新統計資訊。

---

## 線上排查指令

### 1. 檢查 PostgreSQL 中是否存在無效索引（Invalid Indexes）

```sql
-- 找出所有建立失敗殘留的 INVALID 索引
SELECT 
    schemaname, 
    relname AS table_name, 
    indexrelname AS index_name,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
JOIN pg_index USING (indexrelid)
WHERE indisvalid = false;

-- 清理方式：
-- DROP INDEX CONCURRENTLY <index_name>;
```

### 2. 即時監控正在執行的索引建立或資料庫維護進度

```sql
-- PostgreSQL 檢視 CREATE INDEX CONCURRENTLY 執行進度
SELECT 
    pid, 
    phase, 
    lockers_total, 
    lockers_done, 
    blocks_total, 
    blocks_done, 
    tuples_total, 
    tuples_done
FROM pg_stat_progress_create_index;
```

### 3. Prometheus / Grafana 監控指標

```text
# 資料庫 WAL 產生速率（位元組/秒，匯入期間激增為正常，若長時間居高不下需警惕）
rate(pg_stat_wal_bytes[1m])

# Dead Tuples 累積數量監控
pg_stat_user_tables_n_dead_tup > 1000000
```
