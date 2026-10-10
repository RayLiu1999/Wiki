---
title: "高併發 CRUD：正確結果、冪等與短交易"
description: "把新增、查詢、更新與刪除拆成可驗證的業務契約，處理競爭、重送與未知提交。"
articleId: "data-access-concurrent-crud"
topic: "data-access"
category: "database-concurrency"
order: 14
tags:
  - "CRUD"
  - "高併發"
  - "冪等"
  - "庫存"
  - "交易"
  - "死鎖"
difficulty: "intermediate"
learningDepth: "deep"
prerequisites:
  - "data-access-concurrency"
  - "architecture-outbox-inbox"
relatedArticles:
  - "data-access-isolation-locking"
  - "data-access-pool-capacity"
  - "data-access-bulk-retention"
applicableVersions: "以 .NET 10、MySQL 8.4（InnoDB）、PostgreSQL 18 說明；driver／EF provider 的主版相容性須各自核對。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-10"
takeaway: "把新增、查詢、更新與刪除拆成可驗證的業務契約，處理競爭、重送與未知提交。"
sources:
  - title: "PostgreSQL 18：交易隔離"
    url: "https://www.postgresql.org/docs/18/transaction-iso.html"
  - title: "PostgreSQL 18：鎖定"
    url: "https://www.postgresql.org/docs/18/explicit-locking.html"
  - title: "MySQL 8.4：減少與處理死鎖"
    url: "https://dev.mysql.com/doc/refman/8.4/en/innodb-deadlocks-handling.html"
---

## 案發現場

在高併發微服務或雲端架構中，看似基礎的 CRUD（增查改刪）操作往往是資安災難與資料損壞的溫床。

最常見的慘痛案例是**重複扣款與重複建立訂單**：
使用者在手機 App 點擊「立即付款」，恰逢 4G/5G 網路瞬間切換抖動，前端發送了請求後未收到即時回傳，觸發了 SDK 的自動重試；與此同時，使用者焦慮地連點了兩次按鈕。後端 API 接收到了兩個幾乎完全相同的請求。

程式碼寫法如下：
```csharp
// 致命的 Check-then-Act 競態條件
var existingOrder = await db.Orders.FirstOrDefaultAsync(o => o.PaymentId == req.PaymentId);
if (existingOrder == null)
{
    db.Orders.Add(new Order { ... });
    await db.SaveChangesAsync();
}
```
在併發請求下，請求 A 與請求 B 同時執行了 `FirstOrDefaultAsync`，雙方都得到 `null`；隨後雙方都執行了 `Add` 並寫入成功。結果：**資料庫出現了兩筆扣款紀錄與兩張一模一樣的訂單**。

另一種常見災難是**未知提交（Unknown Commit / In-doubt Transaction）**：
應用程式向資料庫發送 `COMMIT`，但就在網路封包傳回的前一刻，雲端連線抖動中斷。.NET 拋出 `NpgsqlException: Connection reset by peer`。此時應用程式根本不知道該交易到底是在資料庫成功提交了、還是回滾了？若貿然重試，會造成二次執行；若直接報錯，使用者帳戶已被扣款卻顯示失敗。

---

## 反模式與正確解法

### 反模式一：將商業資料唯一性寄託於應用層查詢判斷

在多行程、多 Pod 部署的架構中，「先查再插（Check-then-Insert）」**完全不具備執行緒安全性與原子性**。只要兩個請求跨過了查詢時間窗口，任何軟體層判斷都會失效。

### 正確解法一：資料庫唯一鍵約束與原子 Upsert（ON CONFLICT / DUPLICATE KEY）

真正的第一道防線必須是**資料庫層級的唯一索引（Unique Constraint）**，搭配原子 Upsert 語法：

```csharp
// 正確解法：利用 PostgreSQL 的 ON CONFLICT 或 MySQL 的 ON DUPLICATE KEY 達成原子性
public async Task<UpsertResult> CreateOrGetOrderAsync(CreateOrderCommand cmd, CancellationToken ct)
{
    // 利用 PostgreSQL 原生語法：若存在相同的 idempotency_key，則不做任何事或更新時間
    const string sql = """
        INSERT INTO orders (id, user_id, idempotency_key, amount, status, created_at)
        VALUES (@Id, @UserId, @IdempotencyKey, @Amount, 'Created', NOW())
        ON CONFLICT (idempotency_key) 
        DO NOTHING
        RETURNING id, status;
        """;

    await using var conn = await _dataSource.OpenConnectionAsync(ct);
    var order = await conn.QuerySingleOrDefaultAsync<OrderSummary>(
        new CommandDefinition(sql, new 
        { 
            Id = Guid.NewGuid(),
            cmd.UserId, 
            cmd.IdempotencyKey, 
            cmd.Amount 
        }, cancellationToken: ct));

    if (order is null)
    {
        // 代表發生衝突且被忽略，重新讀取既有訂單回傳（達成嚴格冪等性）
        order = await conn.QuerySingleAsync<OrderSummary>(
            new CommandDefinition(
                "SELECT id, status FROM orders WHERE idempotency_key = @IdempotencyKey", 
                new { cmd.IdempotencyKey }, 
                cancellationToken: ct));

        return UpsertResult.Existing(order);
    }

    return UpsertResult.Created(order);
}
```

---

### 反模式二：無流水號的相對數值更新（缺乏防重標記）

當更新帳戶餘額或點數時，若直接執行：
```sql
UPDATE accounts SET balance = balance + 100 WHERE user_id = 1;
```
如果網路逾時觸發重試，該語句每執行一次餘額就增加 100，完全破壞了冪等性。

### 正確解法二：流水帳模型（Ledger Model）與冪等表防護

金融與電商的核心原則是：**餘額是計算出來的，所有異動必須以不可竄改的流水記錄（Ledger Entry）呈現**。

```csharp
// 正確解法：透過唯一 TransactionId 流水記錄驅動帳戶餘額異動
public async Task DepositAsync(DepositRequest req, CancellationToken ct)
{
    await using var conn = await _dataSource.OpenConnectionAsync(ct);
    await using var tx = await conn.BeginTransactionAsync(ct);

    // 1. 寫入帳務交易流水（transaction_id 為唯一索引）
    const string insertLedgerSql = """
        INSERT INTO account_transactions (id, account_id, amount, source_ref, created_at)
        VALUES (@TransactionId, @AccountId, @Amount, @SourceRef, NOW());
        """;

    try
    {
        await conn.ExecuteAsync(new CommandDefinition(
            insertLedgerSql, 
            req, 
            transaction: tx, 
            cancellationToken: ct));
    }
    catch (Npgsql.PostgresException ex) when (ex.SqlState == "23505") // 唯一鍵衝突
    {
        // 該筆加值已經成功處理過，安全直接返回（冪等保護）
        await tx.RollbackAsync(ct);
        return;
    }

    // 2. 更新當前餘額快取
    const string updateBalanceSql = """
        UPDATE accounts 
        SET balance = balance + @Amount 
        WHERE id = @AccountId;
        """;

    await conn.ExecuteAsync(new CommandDefinition(
        updateBalanceSql, 
        req, 
        transaction: tx, 
        cancellationToken: ct));

    await tx.CommitAsync(ct);
}
```

---

## 踩坑與避坑指南

### 1. MySQL ON DUPLICATE KEY UPDATE 的自增主鍵跳號
- **踩坑點**：在 MySQL InnoDB 中，執行 `INSERT ... ON DUPLICATE KEY UPDATE` 時，無論最終是執行 INSERT 還是 UPDATE，InnoDB 都會預先向 `AUTO_INCREMENT` 計數器申請一個新的主鍵 ID。頻繁發生衝突時，自增 ID 會急劇跳號（Gap in auto-increment），若使用 32 位元 INT 主鍵可能迅速耗盡！
- **解法**：高頻 Upsert 的資料表，主鍵務必使用 `BIGINT` 或業務唯一識別碼（UUIDv7）。

### 2. 未知提交（Unknown Commit）的客戶端應對準則
- 當 `CommitAsync()` 拋出通訊中斷例外時：
  1. **切勿直接重試寫入**。
  2. 應用層應將此任務標記為 `Unknown / InDoubt`，或使用先前生成的唯一業務識別碼（如 `OrderId` / `IdempotencyKey`）反查資料庫確認狀態。
  3. 若訂單已存在，視為成功；若不存在，再進行受控補發。

### 3. 多列更新時的死鎖順序陷阱
- 若交易 A 同時更新訂單項目 1 與項目 2（順序：1 ➔ 2）；而交易 B 同時更新項目 2 與項目 1（順序：2 ➔ 1）。在高併發下兩者必定觸發死鎖。
- **鐵律**：在批次更新或多列鎖定時，**所有交易必須對操作的主鍵進行全域一致排序**（例如 `orderItems.OrderBy(x => x.Id)`），從根源消除交叉死鎖。

---

## 線上排查指令

### 1. 查找資料庫中重複建立的異常記錄

```sql
-- 稽核是否存在違反業務唯一原則的重複訂單
SELECT idempotency_key, COUNT(*)
FROM orders
GROUP BY idempotency_key
HAVING COUNT(*) > 1;

-- 稽核帳務流水是否有重複的 source_ref
SELECT source_ref, COUNT(*)
FROM account_transactions
GROUP BY source_ref
HAVING COUNT(*) > 1;
```

### 2. 即時觀測資料庫交易持續時間（識別未關閉的長交易）

```sql
-- PostgreSQL: 檢視目前執行中且超過 2 秒的交易
SELECT pid, now() - xact_start AS tx_age, query, state
FROM pg_stat_activity
WHERE state IN ('active', 'idle in transaction')
  AND now() - xact_start > interval '2 seconds'
ORDER BY tx_age DESC;
```

### 3. Prometheus / Grafana 監控指標

```text
# 唯一鍵衝突發生頻率（異常攀升代表前端防連點失效或惡意撞擊）
rate(pg_stat_database_tuples_returned[1m]) 

# 交易執行超過 1 秒的比例
sum(rate(npgsql_transaction_duration_seconds_bucket{le="1.0"}[1m])) 
/ 
sum(rate(npgsql_transaction_duration_seconds_count[1m]))
```
