---
title: "C# 與 PostgreSQL：Npgsql、池與工作量"
description: "用 NpgsqlDataSource 理解可共用設定、獨立連線及 PostgreSQL 的記憶體與維護。"
articleId: "data-access-postgresql-dotnet"
topic: "data-access"
category: "database-connections"
order: 12
tags:
  - "PostgreSQL"
  - "Npgsql"
  - "C#"
  - "PgBouncer"
  - "work_mem"
  - "autovacuum"
difficulty: "intermediate"
learningDepth: "deep"
prerequisites:
  - "data-access-csharp-connections"
relatedArticles:
  - "data-access-pool-capacity"
  - "data-access-isolation-locking"
  - "data-access-replication-recovery"
applicableVersions: "以 .NET 10、PostgreSQL 18 說明；Npgsql 8.x+。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-10"
takeaway: "用 NpgsqlDataSource 理解可共用設定、獨立連線及 PostgreSQL 的記憶體與維護。"
sources:
  - title: "Npgsql：DataSource 與借還連線"
    url: "https://www.npgsql.org/doc/basic-usage.html"
  - title: "Npgsql：連線設定"
    url: "https://www.npgsql.org/doc/connection-string-parameters.html"
  - title: "PostgreSQL 18：記憶體與資源"
    url: "https://www.postgresql.org/docs/18/runtime-config-resource.html"
  - title: "PostgreSQL 18：例行 VACUUM"
    url: "https://www.postgresql.org/docs/18/routine-vacuuming.html"
  - title: "PgBouncer：池模式與相容性"
    url: "https://www.pgbouncer.org/features.html"
---

## 案發現場

PostgreSQL 憑藉優異的 JSONB 支援、豐富的型別系統與極致的併發能力，成為現代後端系統的核心首選。然而，從 MySQL 或 SQL Server 轉向 PostgreSQL 的 .NET 工程師，在生產環境常常遭遇意想不到的崩潰。

典型災難情境一：**記憶體耗盡引發 OOM Killer**。
在 Kubernetes 叢集中，應用程式部署了 30 個 Pod，每個 Pod 的連線池設為 50。當流量湧入時，PostgreSQL 瞬間迎來 1500 個連線。不同於 MySQL 採用單一行程多執行緒模型，**PostgreSQL 的架構是多行程模型（Multi-process Architecture）**——每一個客戶端連線，伺服器端都會 Fork 一個獨立的作業系統行程（Postgres Backend Process）。每個行程基本消耗 5~10MB 記憶體，且當查詢涉及複雜排序或雜湊聚合時，還會動態分配多個 `work_mem`。伺服器記憶體瞬間被榨乾，Linux OOM Killer 直接出手砍死 PostgreSQL 主行程，導致資料庫崩潰重啟。

典型災難情境二：**`idle in transaction` 拖垮 Autovacuum 導致磁碟爆炸**。
開發者在 C# 代碼中開啟了交易，但在交易中呼叫了某個偶發卡頓的外部服務，或者漏掉了例外分支的 rollback，導致該連線在資料庫中長期處於 `idle in transaction` 狀態。這個卡住的交易阻礙了 PostgreSQL 的 **Autovacuum** 清理死元組（Dead Tuples），造成全庫資料表與索引急劇膨脹（Table Bloat），磁碟在數日內被撐滿。

---

## 反模式與正確解法

### 反模式一：直連 PostgreSQL 且未設交易超時

直連 PostgreSQL 且任由 .NET 應用程式連線維持在 `idle in transaction` 狀態，是對 PostgreSQL 穩定性最具破壞力的行為：

```csharp
// 致命反模式：未配置逾時，交易卡死導致 Autovacuum 癱瘓
public async Task ProcessOrderBatchAsync(List<OrderDto> items)
{
    await using var conn = new NpgsqlConnection(_connStr);
    await conn.OpenAsync();
    await using var tx = await conn.BeginTransactionAsync();

    foreach (var item in items)
    {
        await InsertItemAsync(conn, tx, item);
        // 若此處因網路逾時或例外卡死，該連線將永遠停留在 idle in transaction！
    }

    await tx.CommitAsync();
}
```

### 正確解法一：配置 Idle 交易逾時與採用 NpgsqlDataSource 治理

1. 在資料庫層或連線字串中強制指定 `idle_in_transaction_session_timeout`，伺服器端一旦發現連線在交易中卡死超過閾值，自動強制中斷連線並回滾交易。
2. 在 .NET 10 中利用 `NpgsqlDataSourceBuilder` 統一設定連線池邊界與自動預編譯參數：

```csharp
// Program.cs: 生產級 PostgreSQL 資料來源配置
var connectionString = builder.Configuration.GetConnectionString("PostgresDatabase")!;

var dataSourceBuilder = new NpgsqlDataSourceBuilder(connectionString);

// 1. 強制於連線建立時注入安全參數
dataSourceBuilder.ConnectionStringBuilder.Pooling = true;
dataSourceBuilder.ConnectionStringBuilder.MinPoolSize = 5;
dataSourceBuilder.ConnectionStringBuilder.MaxPoolSize = 25; // 嚴格受控的單 Pod 連線池
dataSourceBuilder.ConnectionStringBuilder.ConnectionIdleLifetime = 15; // 儘速釋放空閒連線
dataSourceBuilder.ConnectionStringBuilder.Timeout = 5; // 取連線超時 5 秒

// 2. 注入連線初使化參數：5 秒在交易中閒置即由 DB 主動斷開！
dataSourceBuilder.ConnectionStringBuilder.Options = "-c idle_in_transaction_session_timeout=5000";

// 3. 啟用高效能原生 JSON 與動態對照
dataSourceBuilder.EnableDynamicJson();

var npgsqlDataSource = dataSourceBuilder.Build();
builder.Services.AddSingleton(npgsqlDataSource);
```

### 反模式二：在 PgBouncer Transaction Pooling 模式下濫用 Session 狀態

當 Pod 數量龐大（例如數百個 Pod）時，直連 PostgreSQL 無法承受，團隊通常會在中介層部署 **PgBouncer**。
然而，PgBouncer 最具伸縮性的模式是 **Transaction Pooling**（交易一結束連線就歸還給其他 Pod）。此時若 .NET 開發者在連線中執行了 Session 級操作（如 `SET TIMEZONE`、`LISTEN/NOTIFY`、`DISCARD ALL` 或依賴 Session 級 Advisory Lock），會造成嚴重狀態混淆，甚至噴出 `prepared statement already exists` 衝突。

### 正確解法二：PgBouncer 模式適配與 Npgsql 自動預編譯調控

若架構引入 PgBouncer 進行 Transaction Pooling，必須在 Npgsql 中正確調整預編譯陳述式（Auto Prepared Statements）策略：

```csharp
// 連接 PgBouncer (Transaction Pooling) 時的連線字串適配
var pgbouncerConnStr = new NpgsqlConnectionStringBuilder
{
    Server = "pgbouncer-pooler.internal",
    Port = 6432,
    Database = "ecommerce_db",
    UserID = "app_user",
    Password = builder.Configuration["DbPassword"],

    // PgBouncer Transaction 模式下，關閉或適當調配 prepared statements
    // Npgsql 支援相容於 PgBouncer 的無名稱預編譯，或可設定 MaxAutoPrepare=0
    MaxAutoPrepare = 0, // 避免跨交易找不到或名稱衝突
    NoResetOnClose = true // PgBouncer 已掌管重設，避免冗餘 DISCARD
}.ConnectionString;
```

---

## 踩坑與避坑指南

### 1. PostgreSQL 多行程 vs MySQL 多執行緒的記憶體開銷
- **架構本質**：MySQL 的每個連線是同行程內的 Thread，共用全域記憶體；PostgreSQL 每個連線是單獨的作業系統 Process。
- **踩坑點**：PostgreSQL 伺服器端若配置 `work_mem = 64MB`，注意該設定**不是每個連線的上限，而是單一查詢中每個排序/雜湊操作的上限**！一條包含 3 個 ORDER BY 與 Hash Join 的複雜查詢，單一連線可能瞬間分配 $3 \times 64\text{MB} = 192\text{MB}$。當數十個連線同時執行時，實體記憶體會瞬間崩潰。
- **規則**：生產環境 `work_mem` 應維持在保守值（如 4MB~16MB），僅在特定夜間報表批次中透過 `SET LOCAL work_mem = '128MB'` 局部覆蓋。

### 2. Autovacuum 與 Transaction ID (XID) 耗盡風險
- PostgreSQL 使用 32 位元整數記錄 Transaction ID。若有未提交的長交易（或孤兒交易）長達數天卡住，Autovacuum 無法推進老舊元組的凍結（Freezing）。當 XID 距離 Wraparound 剩餘少於 1000 萬時，PostgreSQL 會強制進入唯讀保護模式拒絕一切寫入！
- **避坑規則**：線上環境必須架設 Prometheus 監控 `pg_stat_activity_max_tx_duration` 與 `datfrozenxid`。

### 3. Npgsql 二進位匯入（COPY）的高效能邊界
- 對於百萬筆等級的大量寫入，千萬不要用 `InsertInto` 迴圈或 EF Core `AddRange`。Npgsql 提供了原生 `BeginBinaryExportAsync` 與 `BeginBinaryImportAsync`（對應 PostgreSQL 的 `COPY` 命令），吞吐量是常規 INSERT 的 20 倍以上。

---

## 線上排查指令

### 1. 查找並終止長交易與 `idle in transaction`

```sql
-- 查詢所有處於 idle in transaction 超過 3 秒的連線
SELECT 
    pid, 
    usename, 
    client_addr, 
    now() - xact_start AS xact_duration, 
    state, 
    query
FROM pg_stat_activity
WHERE state = 'idle in transaction'
  AND now() - xact_start > interval '3 seconds'
ORDER BY xact_duration DESC;

-- 安全手動終止特定卡死行程
SELECT pg_cancel_backend(12345); -- 嘗試優雅取消查詢
SELECT pg_terminate_backend(12345); -- 強制斷開連線
```

### 2. 檢查資料表死元組（Dead Tuples）與 Autovacuum 狀態

```sql
-- 查看各表 Dead Tuples 比例，識別 Table Bloat
SELECT 
    schemaname, 
    relname, 
    n_live_tup, 
    n_dead_tup, 
    round(n_dead_tup * 100.0 / nullif(n_live_tup + n_dead_tup, 0), 2) AS dead_ratio_pct,
    last_vacuum, 
    last_autovacuum
FROM pg_stat_user_tables
WHERE (n_live_tup + n_dead_tup) > 1000
ORDER BY dead_ratio_pct DESC
LIMIT 10;
```

### 3. Prometheus / Grafana 核心監控指標

```text
# 連線數佔比超過 80% 告警
(pg_stat_database_numbackends / pg_settings_max_connections) > 0.8

# 最長活動交易持續時間超過 60 秒告警
pg_stat_activity_max_tx_duration{state="active"} > 60

# 存在 idle in transaction 超過 10 秒告警
count(pg_stat_activity_duration{state="idle in transaction"} > 10) > 0
```
