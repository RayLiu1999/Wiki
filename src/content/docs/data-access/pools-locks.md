---
title: "連線池、交易、鎖與 Cloud SQL Proxy"
description: "分清應用程式連線資源與資料庫一致性，估算多 Process / Pod 的連線總量。"
articleId: "data-access-pools-locks"
topic: "data-access"
category: "database-runtime"
order: 5
tags:
  - "連線池"
  - "Process"
  - "Pod"
  - "Cloud SQL Auth Proxy"
  - "transaction"
  - "資料庫鎖"
  - "pooling"
  - "DbContext pooling"
difficulty: "intermediate"
learningDepth: "deep"
prerequisites:
  - "data-access-transactions"
  - "aspnet-core-dependency-injection"
relatedArticles:
  - "data-access-batch-updates"
  - "engineering-metrics-tracing"
  - "aspnet-core-dapr"
  - "data-access-csharp-connections"
  - "data-access-pool-capacity"
  - "data-access-isolation-locking"
applicableVersions: "以 .NET 10 生態系與本文列出的官方文件核對；套件及資料庫供應商的差異見內文。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-10"
takeaway: "池解決連線重用，交易定義提交邊界，鎖協調資料存取；增加池大小不會解除鎖競爭。"
sources:
  - title: "Microsoft Learn：SQL Server 連線池"
    url: "https://learn.microsoft.com/en-us/dotnet/framework/data/adonet/sql-server-connection-pooling"
  - title: "Google Cloud：Cloud SQL Auth Proxy"
    url: "https://docs.cloud.google.com/sql/docs/mysql/sql-proxy?hl=en"
  - title: "Microsoft Learn：EF Core pooling"
    url: "https://learn.microsoft.com/en-us/ef/core/performance/advanced-performance-topics"
---

## 案發現場

在高併發促銷活動或流量突增期間，應用程式層最常爆發的錯誤之一是連線逾時：

```text
System.InvalidOperationException: Timeout expired. The timeout elapsed prior to obtaining a connection from the pool.
This may have occurred because all pooled connections were in use and max pool size was reached.
   at System.Data.ProviderBase.DbConnectionFactory.TryGetConnection(...)
   at Microsoft.EntityFrameworkCore.Storage.RelationalConnection.OpenInternalAsync(...)
```

初階工程師看到這個錯誤，第一反應通常是「連線池不夠大」，於是直覺地在連線字串中將 `Max Pool Size` 從預設的 100 調高到 500 甚至 1000。然而，當部署上線後，資料庫卻在幾分鐘內 CPU 飆上 100%、記憶體耗盡，甚至 Cloud SQL Auth Proxy 或資料庫執行個體直接 Crash 重啟，災情反而急劇擴大。

問題的核心在於：**混淆了「用戶端連線池（Connection Pool）」、「資料庫交易（Transaction）」與「資料庫鎖（Database Lock）」的邊界與層次**。

連線池是應用程式 process 內部的連線快取機制；交易是跨操作的一致性邊界；而鎖是資料庫引擎內部協調多個交易並行修改同一筆資料的機制。當資料庫內部因為鎖競爭（Lock Contention）導致查詢變慢時，交易持有連線的時間會被無限拉長，使得用戶端連線池中的可用連線迅速耗盡。此時調大連線池，只會讓更多請求湧入資料庫爭搶資源，引發雪崩效應。

---

## 反模式與正確解法

### 反模式一：長耗時業務中持有資料庫連線與交易

最致命的反模式是在交易或連線開啟的生命週期中，夾雜耗時的外部 I/O 呼叫（例如呼叫第三方金流 API、寄送簡訊或複雜的非同步處理）：

```csharp
// 致命反模式：在資料庫交易中執行耗時的外部網路請求
public async Task<OrderResult> CheckoutAsync(OrderRequest request, CancellationToken ct)
{
    await using var connection = new NpgsqlConnection(_connectionString);
    await connection.OpenAsync(ct);
    await using var transaction = await connection.BeginTransactionAsync(ct);

    // 1. 扣減庫存（此時已鎖定 Inventory 列）
    await DeductStockAsync(connection, transaction, request.ItemId, request.Quantity, ct);

    // 2. 呼叫第三方金流 API（外部 I/O 可能耗時 2~5 秒甚至發生逾時）
    // 嚴重後果：在此期間連線無法歸還池中，且資料庫列鎖持續被持有，後續同商品結帳全部被卡住！
    var paymentResult = await _paymentGateway.ChargeAsync(request.PaymentInfo, ct);

    if (!paymentResult.IsSuccess)
    {
        await transaction.RollbackAsync(ct);
        return OrderResult.Failed("付款失敗");
    }

    // 3. 建立訂單
    await InsertOrderAsync(connection, transaction, request, ct);
    await transaction.CommitAsync(ct);

    return OrderResult.Success();
}
```

### 正確解法一：短交易原則與二階段解耦

**連線與交易的生命週期必須壓縮到極致**。任何不依賴資料庫 ACID 保證的計算或外部網路呼叫，必須移至交易之外：

```csharp
// 正確解法：將外部金流與資料庫交易完全隔離，落實短交易與狀態機設計
public async Task<OrderResult> CheckoutAsync(OrderRequest request, CancellationToken ct)
{
    // 步驟一：短交易 - 預建立待付款訂單與扣減預留庫存
    var orderId = Guid.NewGuid();
    await using (var scope = _serviceProvider.CreateAsyncScope())
    {
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await using var tx = await db.Database.BeginTransactionAsync(ct);

        var inventory = await db.Inventories
            .Where(x => x.ItemId == request.ItemId && x.AvailableStock >= request.Quantity)
            .ExecuteUpdateAsync(s => s
                .SetProperty(b => b.AvailableStock, b => b.AvailableStock - request.Quantity)
                .SetProperty(b => b.LockedStock, b => b.LockedStock + request.Quantity), ct);

        if (inventory == 0)
        {
            return OrderResult.Failed("庫存不足");
        }

        db.Orders.Add(new Order(orderId, request.UserId, OrderStatus.PendingPayment));
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
    } // 連線立即歸還連線池，列鎖立即釋放！

    // 步驟二：執行外部金流請求（完全不佔用任何資料庫連線）
    var paymentResult = await _paymentGateway.ChargeAsync(orderId, request.PaymentInfo, ct);

    // 步驟三：短交易 - 依金流結果更新訂單狀態
    await using (var scope = _serviceProvider.CreateAsyncScope())
    {
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        if (paymentResult.IsSuccess)
        {
            await db.Orders
                .Where(x => x.Id == orderId)
                .ExecuteUpdateAsync(s => s.SetProperty(o => o.Status, OrderStatus.Paid), ct);
        }
        else
        {
            await db.Orders
                .Where(x => x.Id == orderId)
                .ExecuteUpdateAsync(s => s.SetProperty(o => o.Status, OrderStatus.PaymentFailed), ct);
            // 釋放鎖定庫存
            await db.Inventories
                .Where(x => x.ItemId == request.ItemId)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(b => b.AvailableStock, b => b.AvailableStock + request.Quantity)
                    .SetProperty(b => b.LockedStock, b => b.LockedStock - request.Quantity), ct);
        }
    }

    return paymentResult.IsSuccess ? OrderResult.Success() : OrderResult.Failed("付款失敗");
}
```

### 反模式二：忽略多 Pod / 多 Process 累加的總連線數

在 Kubernetes 或 GKE 環境中，單一 Pod 的連線池設定為 `Max Pool Size=100` 看似合理，但當 HPA（水平自動擴展）觸發並擴展至 20 個 Pod 時，系統對資料庫發起的潛在最大連線數為：

$$\text{Total Connections} = 20 \times 100 = 2000$$

若後端使用的是 GCP Cloud SQL（例如 `db-custom-4-16`，預設 `max_connections` 通常約 200~500），且 Pod 是透過 Cloud SQL Auth Proxy Sidecar 連線，不僅資料庫端會因連線耗盡直接拒絕新連線，Proxy Sidecar 也會因連線數過多耗盡 Socket 與記憶體。

### 正確解法二：連線預算分配與集中式連線代理

1. **嚴格連線預算分配**：計算單 Pod 池大小時，採用公式：
   $$Pool_{max} \le \frac{DB_{max\_connections} \times 0.7}{Pod_{max\_replicas}}$$
2. **引入集中式連線池代理**：對於 PostgreSQL，在高 Pod 數環境下強烈建議引入 PgBouncer（Transaction Pooling 模式）；對於 Cloud SQL，確保 Cloud SQL Auth Proxy 設定適當的連線上限，並限制 Pod 的最大副本數與連線池尺寸。

```csharp
// Program.cs: 在 .NET 10 中配置精確的連線池上限與連線逾時
builder.Services.AddNpgsqlDataSource(connectionString, builder =>
{
    builder.ConnectionStringBuilder.Pooling = true;
    builder.ConnectionStringBuilder.MinPoolSize = 5;
    builder.ConnectionStringBuilder.MaxPoolSize = 25; // 嚴格受控的單 Pod 連線池
    builder.ConnectionStringBuilder.ConnectionIdleLifetime = 15; // 秒：空閒連線儘速回收
    builder.ConnectionStringBuilder.Timeout = 5; // 5 秒取不到連線立即拋出背壓，避免請求無止盡堆積
});
```

---

## 踩坑與避坑指南

### 1. DbContextPool 與 ADO.NET Connection Pool 的本質差異
- **ADO.NET Connection Pool**：快取實體 TCP Socket 連線，重用昂貴的網路握手與身份驗證開銷。
- **EF Core DbContextPool**（`AddDbContextPool<T>`）：快取的是 C# 的 `DbContext` 物件執行個體，避免高頻配置物件造成的 GC 壓力。
- **避坑點**：`AddDbContextPool` 並不會增加或減少實體資料庫連線數！兩者是在不同層次運作。啟用 `AddDbContextPool` 時，DbContext 不能持有自訂狀態或在內部解析 Scoped 依賴，否則會發生狀態污染。

### 2. 連線未正確 Dispose 導致的連線洩漏（Connection Leak）
- **現象**：系統在低流量下運行數小時後，突然開始報錯連線池耗盡。
- **根本原因**：使用了自建的 `IDbConnection` 但在某些分支拋出例外時未正確執行 `DisposeAsync()`，或混用同步 `Dispose()` 導致執行緒被阻塞。
- **規則**：永遠使用 `await using` 宣告連線與交易：
  ```csharp
  await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
  await using var tx = await conn.BeginTransactionAsync(cancellationToken);
  ```

### 3. Cloud SQL Auth Proxy 連線限制與資源限制
- Cloud SQL Auth Proxy 以 Sidecar 容器運行在 Pod 內時，若未設定合理的 Kubernetes `resources.limits`（尤其是 CPU 與 Memory），大量短期連線建立時的 TLS 握手會使 Proxy 的 CPU 飽和，進而引起整個 Pod 的資料庫呼叫逾時。

---

## 線上排查指令

### 1. 檢查資料庫端目前活躍連線與等待狀態

**PostgreSQL 檢查活躍連線與等待事件：**
```sql
-- 查看各狀態連線數與等待事件
SELECT state, wait_event_type, wait_event, count(*)
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state, wait_event_type, wait_event
ORDER BY count(*) DESC;

-- 查看執行超過 5 秒的長交易
SELECT pid, now() - xact_start AS duration, query, state
FROM pg_stat_activity
WHERE state IN ('active', 'idle in transaction')
  AND now() - xact_start > interval '5 seconds'
ORDER BY duration DESC;
```

**MySQL 檢查當前連線與鎖等待：**
```sql
-- 查看當前連線數與狀態
SHOW GLOBAL STATUS LIKE 'Threads_connected';
SHOW GLOBAL STATUS LIKE 'Threads_running';

-- 查詢當前阻擋中的交易與鎖等待
SELECT 
    r.trx_id waiting_trx_id,
    r.trx_mysql_thread_id waiting_thread,
    r.trx_query waiting_query,
    b.trx_id blocking_trx_id,
    b.trx_mysql_thread_id blocking_thread,
    b.trx_query blocking_query
FROM performance_schema.data_lock_waits w
JOIN information_schema.innodb_trx b ON b.trx_id = w.blocking_engine_transaction_id
JOIN information_schema.innodb_trx r ON r.trx_id = w.requesting_engine_transaction_id;
```

### 2. .NET 應用端即時觀測連線池指標

在 Pod 內部或透過 dotnet-counters 診斷連線池狀態：
```bash
# 監控 .NET 應用的連線池計數器
dotnet-counters monitor -p $(pgrep -f "dotnet MyApp.dll") \
  --counters Microsoft.Data.SqlClient,Npgsql,System.Data
```

### 3. Prometheus / Grafana 告警指標

```text
# 連線池使用率超過 80% 告警
(npgsql_connections_in_use / npgsql_max_pool_size) > 0.8

# 資料庫連線數逼近 max_connections 上限告警
(pg_stat_database_numbackends / pg_settings_max_connections) > 0.75
```
