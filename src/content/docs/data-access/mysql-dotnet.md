---
title: "C# 與 MySQL：連線池、取消與 InnoDB"
description: "用 MySqlConnector 理解短期連線、TLS、參數化 SQL 與 MySQL 的容量設定。"
articleId: "data-access-mysql-dotnet"
topic: "data-access"
category: "database-connections"
order: 11
tags:
  - "MySQL"
  - "C#"
  - "MySqlConnector"
  - "InnoDB"
  - "TLS"
  - "ConnectionTimeout"
difficulty: "intermediate"
learningDepth: "deep"
prerequisites:
  - "data-access-csharp-connections"
relatedArticles:
  - "data-access-pool-capacity"
  - "data-access-concurrent-crud"
  - "data-access-isolation-locking"
applicableVersions: "以 .NET 10、MySQL 8.4（InnoDB）說明；MySqlConnector 2.x+。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-10"
takeaway: "用 MySqlConnector 理解短期連線、TLS、參數化 SQL 與 MySQL 的容量設定。"
sources:
  - title: "MySqlConnector：套件與目標框架"
    url: "https://mysqlconnector.net/overview/installing/"
  - title: "MySqlConnector：連線設定"
    url: "https://mysqlconnector.net/connection-options/"
  - title: "MySQL 8.4：InnoDB buffer pool"
    url: "https://dev.mysql.com/doc/refman/8.4/en/innodb-buffer-pool.html"
  - title: "MySQL 8.4：InnoDB 隔離層級"
    url: "https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-isolation-levels.html"
---

## 案發現場

在以 C# / .NET 搭配 MySQL（8.0 / 8.4 InnoDB）架構的電商後端系統中，每逢尖峰促銷或夜間批次排程時，常會突然爆發一波連線異常：

```text
MySqlConnector.MySqlException (0x80004005): The connection was closed by the host.
   at MySqlConnector.Core.ServerSession.ReceiveReplyAsync(...)
   at MySqlConnector.Core.ConnectionPool.GetSessionAsync(...)
```

伴隨而來的現象是：應用程式端出現大量逾時報錯，但在 MySQL 資料庫端觀察，CPU 卻持續飆高在 95% 以上，`SHOW PROCESSLIST` 發現大量執行緒處於 `Sending data` 或 `Locked` 狀態。即便用戶端 HTTP 請求早已逾時並中止連線，MySQL 伺服器端依然持續在背景計算這些被廢棄的巨量查詢。

更嚴重的災難發生在雲端網路邊界：當應用程式與受管 MySQL（如 GCP Cloud SQL for MySQL 或 AWS RDS Aurora MySQL）之間經過負載平衡器或雲端 NAT 防火牆時，若連線處於空閒（Idle）狀態超過數分鐘，中間防火牆會默默丟棄 TCP 連線（Silent TCP Drop）。當 .NET 應用程式下一次從連線池拿出這條「半死連線（Half-open connection）」發送查詢時，請求會硬生生卡住直到作業系統 TCP 逾時（通常為數十秒），導致服務連鎖癱瘓。

---

## 反模式與正確解法

### 反模式一：使用舊版 Oracle MySql.Data 驅動與同步阻塞呼叫

在過去的歷史包袱中，部分專案仍引用 Oracle 官方的 `MySql.Data` 套件，該套件早期在非同步 I/O 上存在大量的 `Wait()` 與假非同步包裝，在高併發下極易造成 ThreadPool 飢餓。此外，舊驅動在非同步取消（`CancellationToken`）的支援度上不完整，導致 Client 斷線後 MySQL 無法得知。

### 正確解法一：全面採用 MySqlConnector 並配置抗網路抖動參數

生產環境強烈建議統一採用開源社群維護的 **`MySqlConnector`**（Pomelo.EntityFrameworkCore.MySql 的預設底層依賴）。它具備完整的真正的非同步 I/O，並提供強大的連線池管理與心跳檢查機制：

```csharp
// Program.cs: 生產級 MySQL 連線字串最佳實踐設定
var connStringBuilder = new MySqlConnectionStringBuilder
{
    Server = "mysql-primary.internal",
    Port = 3306,
    Database = "ecommerce_db",
    UserID = "app_user",
    Password = builder.Configuration["DbPassword"],

    // 1. 連線池容量控制（依 Pod 數與 DB 承受力推算）
    Pooling = true,
    MinimumPoolSize = 5,
    MaximumPoolSize = 30,

    // 2. 解決中間防火牆 Silent Drop 與半死連線
    ConnectionIdlePingInterval = 30, // 每 30 秒對空閒連線發送 Ping 心跳
    ConnectionIdleTimeout = 60,      // 空閒超過 60 秒主動回收，低於 MySQL 的 wait_timeout
    Keepalive = 30,                  // TCP Keepalive 保證底層 Socket 活性

    // 3. 連線歸還池中時清理狀態，防止 Session 污染
    ConnectionReset = true,

    // 4. 超時防護
    ConnectionTimeout = 5,           // 5 秒拿不到連線立即拋出例外，保護執行緒
    DefaultCommandTimeout = 15       // 指令預設超時 15 秒
};

var dataSourceBuilder = new MySqlDataSourceBuilder(connStringBuilder.ConnectionString);
var mysqlDataSource = dataSourceBuilder.Build();

builder.Services.AddSingleton(mysqlDataSource);
builder.Services.AddDbContextPool<AppDbContext>((sp, options) =>
{
    var ds = sp.GetRequiredService<MySqlDataSource>();
    options.UseMySql(ds.CreateConnection(), ServerVersion.AutoDetect(connStringBuilder.ConnectionString));
});
```

### 反模式二：用戶端取消（Cancellation）後放任 MySQL 燃燒 CPU

在 .NET 呼叫資料庫時，如果只傳入 `CancellationToken`，但在 MySQL 驅動層未開啟取消協議，當使用者關閉瀏覽器或 Gateway 逾時取消時，.NET Task 雖然拋出 `OperationCanceledException`，但 MySQL 伺服器端該 Session 仍會繼續執行直到查詢結束！

### 正確解法二：利用 MySqlCommand.CancelOnTimeout 或主動註冊取消處理

`MySqlConnector` 支援在觸發 `CancellationToken` 時，於底層另開輕量連線向 MySQL 發送 `KILL QUERY <thread_id>`，立即停止伺服器端運算：

```csharp
// 生產級查詢：確保 Cancellation 觸發時能向 MySQL 伺服器發送 KILL QUERY
public async Task<List<ProductDto>> SearchProductsAsync(
    string keyword, 
    CancellationToken cancellationToken)
{
    const string sql = """
        SELECT id, name, price, stock
        FROM products
        WHERE category_code = @Keyword
        ORDER BY created_at DESC
        LIMIT 50;
        """;

    await using var conn = await _mysqlDataSource.OpenConnectionAsync(cancellationToken);
    await using var cmd = new MySqlCommand(sql, conn);
    cmd.Parameters.AddWithValue("@Keyword", keyword);

    // 註冊 Token 取消回呼：當 HTTP 請求中斷時主動呼叫 cmd.CancelAsync()
    await using var registration = cancellationToken.Register(() =>
    {
        try
        {
            // MySqlConnector 會發起 KILL QUERY，立即釋放 MySQL 端 CPU 與鎖！
            cmd.Cancel();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "向 MySQL 發送取消命令失敗");
        }
    });

    var results = new List<ProductDto>();
    await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
    while (await reader.ReadAsync(cancellationToken))
    {
        results.Add(new ProductDto(
            reader.GetInt64(0),
            reader.GetString(1),
            reader.GetDecimal(2),
            reader.GetInt32(3)));
    }

    return results;
}
```

---

## 踩坑與避坑指南

### 1. MySQL wait_timeout 與連線池 ConnectionIdleTimeout 的時間差
- **現象**：MySQL 伺服器預設的 `wait_timeout` 通常為 28800 秒（8 小時），但在許多生產環境與雲端資料庫（如 Cloud SQL / RDS）常被調整為 300 秒（5 分鐘）或 600 秒。
- **踩坑點**：若應用程式連線池的 `ConnectionIdleTimeout` 設為大於 MySQL 的 `wait_timeout`，當夜間流量低時，MySQL 伺服器端已關閉連線，但 .NET 連線池毫不知情，隔天第一個請求拿取該連線時便會直接噴出 `The connection was closed by the host`。
- **避坑規則**：用戶端 `ConnectionIdleTimeout` 必須**顯著小於**資料庫端的 `wait_timeout`（建議設為 60~120 秒），並啟用 `ConnectionIdlePingInterval=30`。

### 2. TreatTinyAsBoolean 的型別映射陷阱
- MySQL 的 `TINYINT(1)` 在歷史習慣上常被驅動預設映射為 C# `bool`。
- **踩坑點**：若資料表欄位設計 `status TINYINT(1)`，原本預期存入 `0: 待處理, 1: 成功, 2: 失敗`，當 `TreatTinyAsBoolean=true`（預設）時，寫入值 2 會被強轉或在讀取時噴出型別轉換例外。
- **解法**：若表中包含多值的 TINYINT 欄位，應在連線字串明確指定 `TreatTinyAsBoolean=false`，或在 EF Core Model 中明確指定 `.HasColumnType("tinyint")`。

### 3. InnoDB Buffer Pool 命中率不足引起的磁碟 IOPS 瓶頸
- MySQL 查詢效能嚴重依賴 `innodb_buffer_pool_size`。若 Buffer Pool 命中率低於 95%，代表大量查詢正穿透至磁碟讀取。在查詢時應避免 `SELECT *` 讀取無用的大欄位（如 TEXT/BLOB），以防 Buffer Pool 中的熱點頁面（Page）被冷資料污染淘汰。

---

## 線上排查指令

### 1. 查詢 MySQL 連線狀態與中斷客戶端計數

```sql
-- 檢查目前連線數、活躍執行緒與被中斷連線數
SHOW GLOBAL STATUS LIKE 'Threads_connected';
SHOW GLOBAL STATUS LIKE 'Threads_running';
SHOW GLOBAL STATUS LIKE 'Aborted_connects';
SHOW GLOBAL STATUS LIKE 'Aborted_clients';

-- 檢查目前 InnoDB Buffer Pool 命中率
SELECT 
    (1 - (variable_value / (
        SELECT variable_value 
        FROM performance_schema.global_status 
        WHERE variable_name = 'Innodb_buffer_pool_read_requests'
    ))) * 100 AS buffer_pool_hit_rate_pct
FROM performance_schema.global_status
WHERE variable_name = 'Innodb_buffer_pool_reads';
```

### 2. 即時診斷長時間運行的卡頓 Query 與鎖等待

```sql
-- 找出執行超過 10 秒的卡頓查詢並附帶 PROCESS ID
SELECT ID, USER, HOST, DB, TIME, STATE, INFO
FROM information_schema.PROCESSLIST
WHERE COMMAND != 'Sleep' AND TIME > 10
ORDER BY TIME DESC;

-- 必要時手動中斷卡死查詢
-- KILL QUERY <ID>;
```

### 3. Prometheus / Grafana 監控指標

```text
# MySQL 當前活躍連線數佔最大連線數比例告警
(mysql_global_status_threads_connected / mysql_global_variables_max_connections) > 0.8

# MySQL 慢查詢產生速率（每秒大於 5 筆）
rate(mysql_global_status_slow_queries[1m]) > 5
```
