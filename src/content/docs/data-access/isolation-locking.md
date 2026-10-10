---
title: "MySQL／PostgreSQL 隔離、鎖與重試差異"
description: "分清快照、鎖定讀、競爭更新與重試單位，避免跨資料庫照搬一致性假設。"
articleId: "data-access-isolation-locking"
topic: "data-access"
category: "database-concurrency"
order: 15
tags:
  - "MySQL"
  - "PostgreSQL"
  - "MVCC"
  - "Repeatable Read"
  - "Read Committed"
  - "SKIP LOCKED"
difficulty: "intermediate"
learningDepth: "deep"
prerequisites:
  - "data-access-transactions"
relatedArticles:
  - "data-access-concurrent-crud"
  - "architecture-outbox-inbox"
applicableVersions: "以 .NET 10、MySQL 8.4（InnoDB）、PostgreSQL 18 說明；driver／EF provider 的主版相容性須各自核對。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-10"
takeaway: "分清快照、鎖定讀、競爭更新與重試單位，避免跨資料庫照搬一致性假設。"
sources:
  - title: "MySQL 8.4：InnoDB 隔離層級"
    url: "https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-isolation-levels.html"
  - title: "PostgreSQL 18：交易隔離"
    url: "https://www.postgresql.org/docs/18/transaction-iso.html"
  - title: "PostgreSQL 18：鎖定"
    url: "https://www.postgresql.org/docs/18/explicit-locking.html"
  - title: "MySQL 8.4：減少與處理死鎖"
    url: "https://dev.mysql.com/doc/refman/8.4/en/innodb-deadlocks-handling.html"
---

## 案發現場

在多資料庫架構演進或從 MySQL 遷移至 PostgreSQL 的專案中，開發團隊常遭遇令人困惑的行為差異與併發例外。

最經典的現場之一是**序列化失敗（Serialization Failure）**：
在 PostgreSQL 中開啟 `Repeatable Read` 隔離層級處理併發訂單扣減，原本在 MySQL 能順利排隊等待的交易，在 PostgreSQL 下卻直接噴出：
```text
Npgsql.PostgresException (0x80004005): 40001: could not serialize access due to concurrent update
   at Npgsql.Internal.NpgsqlConnector.ReadExpecting[T](...)
```

另一個經典現場是 **MySQL 中的間隙鎖（Gap Lock）死鎖**：
兩個併發執行的使用者在 MySQL 中嘗試插入新訂單：
- 交易 A 執行 `SELECT * FROM orders WHERE user_id = 101 FOR UPDATE;`（假設目前該用戶無任何訂單）。
- 交易 B 也執行同語句。
- 接著雙方同時執行 `INSERT INTO orders (user_id, ...) VALUES (101, ...);`。
此時 MySQL 立即判定死鎖並回滾其中一方：
```text
MySqlConnector.MySqlException: Deadlock found when trying to get lock; try restarting transaction (Error 1213)
```

問題的根源在於：**MySQL（InnoDB）與 PostgreSQL 在實現 MVCC（多版本併發控制）與隔離層級（Repeatable Read / Read Committed）時，底層哲學與鎖定機制存在根本性的差異！**

---

## 反模式與正確解法

### 1. 隔離機制根本差異對照

| 隔離層級與行為 | MySQL (InnoDB) | PostgreSQL |
| :--- | :--- | :--- |
| **預設隔離層級** | **Repeatable Read** | **Read Committed** |
| **Repeatable Read 實作機制** | **悲觀行鎖 + 間隙鎖（Next-Key Lock）**：鎖定讀會阻擋其他交易的寫入與間隙插入。 | **樂觀快照（Snapshot Isolation）**：不加間隙鎖。若偵測到欲更新的資料列已被其他交易提交，**直接拋出 40001 錯誤！** |
| **競爭同一列更新時** | 後到的交易進入等待鎖釋放（直到 lock wait timeout）。 | `Read Committed` 下會重新評估（EPQ 機制）；`Repeatable Read` 下直接失敗中斷。 |
| **解決幻讀（Phantom Read）** | 使用 **Gap Locks** 鎖定不存在的區間，防止插入。 | 仰賴交易開始時的快照（Snapshot），看不到新插入列；若要完全序列化則使用 SSI（Serializable）。 |

### 反模式一：跨資料庫套用相同假設且未實作交易重試

在 PostgreSQL 的 `Repeatable Read` 或 `Serializable` 層級下，或者在 MySQL 高併發鎖競爭下，**死鎖（Deadlock）與序列化失敗（Serialization Failure 40001）不是軟體 Bug，而是引擎維持 ACID 特性的正常表現！**
若將這些錯誤當作系統致命例外直接拋出給使用者，是非常嚴重的反模式。

### 正確解法一：實作具備退避（Backoff）與抖動（Jitter）的交易重試器

針對資料庫可重試的瞬態錯誤（Transient Faults）：
- MySQL：Error 1213 (`ER_LOCK_DEADLOCK`)
- PostgreSQL：Error 40001 (`serialization_failure`)、40P01 (`deadlock_detected`)
應用層必須將整筆交易作為一個不可分割的單位進行冪等重試：

```csharp
// 生產級交易重試器：處理 MySQL 死鎖與 PostgreSQL 40001 序列化衝突
public static class TransactionRetryPolicy
{
    private static readonly HashSet<string> RetriableSqlStates = new()
    {
        "40001", // PostgreSQL: serialization_failure
        "40P01", // PostgreSQL: deadlock_detected
    };

    private const int MySqlDeadlockErrorCode = 1213;

    public static async Task<T> ExecuteWithRetryAsync<T>(
        Func<CancellationToken, Task<T>> unitOfWork,
        int maxRetries = 3,
        CancellationToken ct = default)
    {
        for (int attempt = 1; attempt <= maxRetries; attempt++)
        {
            try
            {
                return await unitOfWork(ct);
            }
            catch (Exception ex) when (IsRetriableException(ex) && attempt < maxRetries)
            {
                // 指數退避加上隨機抖動（Full Jitter），避免所有競爭執行緒在同時間重試引發二次衝突
                var delayMs = Random.Shared.Next(10, (int)Math.Pow(2, attempt) * 50);
                await Task.Delay(delayMs, ct);
            }
        }

        // 超過最大重試次數後依舊失敗，執行最後一次拋出
        return await unitOfWork(ct);
    }

    private static bool IsRetriableException(Exception ex)
    {
        if (ex is Npgsql.PostgresException pgEx && RetriableSqlStates.Contains(pgEx.SqlState))
            return true;

        if (ex is MySqlConnector.MySqlException myEx && myEx.Number == MySqlDeadlockErrorCode)
            return true;

        if (ex is Microsoft.EntityFrameworkCore.DbUpdateException dbEx && dbEx.InnerException is not null)
            return IsRetriableException(dbEx.InnerException);

        return false;
    }
}
```

### 反模式二：在未建索引的欄位上執行 `SELECT ... FOR UPDATE`

在 MySQL InnoDB 中，若對沒有索引的欄位執行鎖定讀：
```sql
SELECT * FROM orders WHERE remark = 'VIP' FOR UPDATE;
```
InnoDB 無法透過 B+Tree 索引鎖定特定列，鎖會直接退化為**鎖定主鍵叢集索引上的所有記錄與所有間隙（相當於全表鎖）**！這會讓全系統所有寫入請求徹底停擺。

### 正確解法二：精確主鍵/唯一鍵鎖定與利用 `SKIP LOCKED` 實作工作佇列

1. `SELECT ... FOR UPDATE` 必須確保 `WHERE` 條件完全命中唯一索引或主鍵。
2. 在處理搶單、消費任務或佇列情境時，善用現代 SQL 的 **`FOR UPDATE SKIP LOCKED`**（MySQL 8.0+ 與 PostgreSQL 均原生支援），讓不同 Worker 自動跳過已被鎖定的列，達成零鎖等待的極致吞吐：

```csharp
// 正確解法：利用 FOR UPDATE SKIP LOCKED 實作無鎖等待的任務領取
public async Task<TaskEntity?> ClaimNextPendingTaskAsync(CancellationToken ct)
{
    const string sql = """
        SELECT id, payload, status
        FROM background_tasks
        WHERE status = 'Pending'
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED;
        """;

    await using var conn = await _dataSource.OpenConnectionAsync(ct);
    await using var tx = await conn.BeginTransactionAsync(ct);

    var task = await conn.QuerySingleOrDefaultAsync<TaskEntity>(
        new CommandDefinition(sql, transaction: tx, cancellationToken: ct));

    if (task is not null)
    {
        await conn.ExecuteAsync(
            "UPDATE background_tasks SET status = 'Processing' WHERE id = @Id",
            new { task.Id },
            transaction: tx);
        await tx.CommitAsync(ct);
    }

    return task;
}
```

---

## 踩坑與避坑指南

### 1. PostgreSQL Read Committed 下的 EvalPlanQual (EPQ) 機制
- 在 PostgreSQL 的預設 `Read Committed` 隔離層級下，若交易 A 正在更新列 1，交易 B 也嘗試更新列 1，交易 B 會等待交易 A 提交。當交易 A 提交後，PostgreSQL 會對列 1 **重新評估 WHERE 條件**（EPQ 機制）。若條件仍成立則執行更新，若條件不再成立（例如 A 把庫存扣成 0），B 的更新會自動影響 0 列而不是出錯。理解這點能大幅簡化高併發業務邏輯。

### 2. 交易重試的邊界安全原則
- **避坑點**：傳入重試器的 `unitOfWork` 委派**必須具備冪等性**。
- 若委派內部在呼叫資料庫前發送了外部信用卡扣款 HTTP 請求，當資料庫交易提交死鎖時，重試器再次執行將導致「扣款兩次」的嚴重災難！
- **規則**：重試單元必須僅包含純資料庫操作，外部通訊必須移至交易外部並使用 Outbox 模式。

### 3. MySQL 唯一鍵衝突時的隱式 S 鎖
- 當兩個交易併發執行 `INSERT INTO table (unique_col) VALUES (1)` 時，若發生衝突，後執行的交易會對該列加上共享讀鎖（Shared Lock）。若有三個以上交易同時發生此情況，極易形成循環依賴直接觸發死鎖。

---

## 線上排查指令

### 1. MySQL 即時排查最近一次死鎖日誌

```sql
-- 查看 InnoDB 引擎狀態，輸出中包含 LATEST DETECTED DEADLOCK 的詳細交易與鎖資訊
SHOW ENGINE INNODB STATUS\G
```
重點檢查日誌中的：
- `(1) WAITING FOR THIS LOCK TO BE GRANTED`：交易 1 等待的鎖。
- `(2) HOLDS THE LOCK(S)`：交易 2 持有的鎖。
- `WE ROLL BACK TRANSACTION (1)`：被 MySQL 犧牲回滾的交易。

### 2. PostgreSQL 即時排查鎖阻擋（Blocking & Blocked）

```sql
-- 找出誰阻擋了誰（Blocking PID vs Blocked PID）
SELECT 
    blocked_locks.pid     AS blocked_pid,
    blocked_activity.usename  AS blocked_user,
    blocking_locks.pid    AS blocking_pid,
    blocking_activity.usename AS blocking_user,
    blocked_activity.query    AS blocked_statement,
    blocking_activity.query   AS current_statement_in_blocking_process
FROM  pg_catalog.pg_locks         blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks         blocking_locks 
    ON blocking_locks.locktype = blocked_locks.locktype
    AND blocking_locks.DATABASE IS NOT DISTINCT FROM blocked_locks.DATABASE
    AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
    AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
    AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
    AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
    AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
    AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
    AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
    AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
    AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.GRANTED;
```

### 3. Prometheus / Grafana 死鎖告警指標

```text
# MySQL 死鎖發生率（大於 0 即需注意）
rate(mysql_global_status_innodb_deadlocks[1m]) > 0.1

# PostgreSQL 死鎖發生率
rate(pg_stat_database_deadlocks[1m]) > 0.1
```
