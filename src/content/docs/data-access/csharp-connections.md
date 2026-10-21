---
title: "C# 連線設計：DataSource、DbContext 與生命週期"
description: "分清 driver、ORM、連線池與交易，建立可控制、可診斷的資料存取邊界。"
articleId: "data-access-csharp-connections"
topic: "data-access"
category: "database-connections"
order: 10
tags:
  - "C#"
  - "MySQL"
  - "PostgreSQL"
  - "DataSource"
  - "DbContext"
  - "Dapper"
  - "ADO.NET"
difficulty: "advanced"
prerequisites:
  - "csharp-cancellation-disposable"
  - "aspnet-core-dependency-injection"
relatedArticles:
  - "data-access-mysql-dotnet"
  - "data-access-postgresql-dotnet"
  - "data-access-pool-capacity"
applicableVersions: "以 .NET 10、MySQL 8.4（InnoDB）、PostgreSQL 18 說明；driver／EF provider 的主版相容性須各自核對。"
lastReviewed: "2026-10-10"
takeaway: "分清 driver、ORM、連線池與交易，建立可控制、可診斷的資料存取邊界。"
sources:
  - title: "Npgsql：DataSource 與借還連線"
    url: "https://www.npgsql.org/doc/basic-usage.html"
  - title: "MySqlConnector：DataSourceBuilder"
    url: "https://mysqlconnector.net/api/mysqlconnector/mysqldatasourcebuildertype/"
  - title: "EF Core：Context 與連線池"
    url: "https://learn.microsoft.com/en-us/ef/core/performance/advanced-performance-topics"
  - title: "EF Core：provider 相容性"
    url: "https://learn.microsoft.com/en-us/ef/core/providers/"
---

## 案發現場

在現代 .NET 微服務與高併發架構中，資料存取往往同時使用多種工具：用 EF Core 處理領域實體與複雜關聯，用 Dapper 執行高吞吐報表查詢，甚至用原生 ADO.NET 執行批次操作。

然而，當系統承載每秒數千次請求時，常會遭遇以下兩類災難性錯誤：

第一類是並行衝突例外：
```text
System.InvalidOperationException: A second operation was started on this context instance before a previous operation completed.
This is usually caused by different threads concurrently using the same instance of DbContext.
   at Microsoft.EntityFrameworkCore.Internal.ConcurrencyDetector.EnterCriticalSection()
```

第二類是連線延遲暴增與 TLS 握手風暴：
工程師在每次需要查詢時手動 `new MySqlConnection(connStr)` 或 `new NpgsqlConnection(connStr)`，在高流量下發現資料庫 CPU 居高不下，且應用程式 p99 延遲從 5ms 飆升至 200ms 以上，網路監控顯示每秒有上千次重複的 SSL/TLS 握手與憑證驗證。

這些問題的根源在於：**未釐清 Driver（連線工廠/資料來源）、ORM 實體追蹤器（DbContext）與單一資料庫連線（DbConnection）在依賴注入（DI）容器中的生命週期邊界**。

---

## 反模式與正確解法

### 反模式一：在 Singleton 服務中直接注入 Scoped DbContext

`DbContext` 在設計上是**非執行緒安全（Non-thread-safe）**的輕量級工作單元（Unit of Work）。若將其注入到 Singleton 服務（如背景定時排程器 `BackgroundService` 或 Singleton 快取管理器），多個執行緒會同時呼叫同一個 `DbContext` 執行個體，引發狀態損壞與崩潰：

```csharp
// 致命反模式：在 Singleton 中注入 Scoped DbContext
public class StockSyncWorker : BackgroundService
{
    private readonly AppDbContext _db; // 致命錯誤：跨執行緒共用同一個 DbContext

    public StockSyncWorker(AppDbContext db)
    {
        _db = db;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            // 多個並行 Task 同時呼叫 _db，必定引發 ConcurrencyDetector 例外
            var tasks = Enumerable.Range(1, 10).Select(async id =>
            {
                var item = await _db.Items.FindAsync(id);
                // 處理邏輯...
            });
            await Task.WhenAll(tasks);
            await Task.Delay(5000, stoppingToken);
        }
    }
}
```

### 正確解法一：使用 IDbContextFactory 或自建非同步 Scope

針對背景排程、平行任務或需要獨立隔離的短作業，應使用 `IDbContextFactory<T>` 或 `IServiceScopeFactory` 為每個並行流程建立獨立的 `DbContext`：

```csharp
// 正確解法：使用 IDbContextFactory 在並行或背景作業中建立獨立 DbContext
public class StockSyncWorker : BackgroundService
{
    private readonly IDbContextFactory<AppDbContext> _contextFactory;
    private readonly ILogger<StockSyncWorker> _logger;

    public StockSyncWorker(
        IDbContextFactory<AppDbContext> contextFactory,
        ILogger<StockSyncWorker> logger)
    {
        _contextFactory = contextFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            // 每個平行工作擁有專屬的 DbContext 執行個體與獨立生命週期
            var tasks = Enumerable.Range(1, 10).Select(async id =>
            {
                await using var db = await _contextFactory.CreateDbContextAsync(stoppingToken);
                var item = await db.Items.FindAsync(new object[] { id }, stoppingToken);
                // 處理業務更新...
                await db.SaveChangesAsync(stoppingToken);
            });

            await Task.WhenAll(tasks);
            await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
        }
    }
}
```

### 反模式二：無管理散落的 new DbConnection 與重複握手

直接散落在各業務邏輯中 `new NpgsqlConnection(connStr)` 或 `new MySqlConnection(connStr)`，每次呼叫都重新解析連線字串，且在某些雲端驅動中無法共用 TLS Session 快取與預編譯陳述式快取（Prepared Statement Cache）。

### 正確解法二：利用 DbDataSource 作為 Singleton 資料來源

在 .NET 8 與 .NET 10 中，官方推薦將 `DbDataSource`（如 `NpgsqlDataSource` 或 `MySqlDataSource`）註冊為 **Singleton**。它是整個應用的連線工廠，集中管理實體連線池、TLS 憑證快取與類型映射器；而 EF Core 與 Dapper 則統一向此 DataSource 借還連線：

```csharp
// Program.cs: 現代 .NET 生產級資料存取架構配置
var builder = WebApplication.CreateBuilder(args);
var connectionString = builder.Configuration.GetConnectionString("DefaultDatabase")!;

// 1. 將 NpgsqlDataSource 註冊為 Singleton（掌管連線池、TLS 快取、類型解析）
var dataSourceBuilder = new NpgsqlDataSourceBuilder(connectionString);
dataSourceBuilder.EnableDynamicJson(); // 註冊高效能 JSON 映射
var npgsqlDataSource = dataSourceBuilder.Build();

builder.Services.AddSingleton<NpgsqlDataSource>(npgsqlDataSource);
builder.Services.AddSingleton<DbDataSource>(npgsqlDataSource);

// 2. 讓 EF Core 綁定此 Singleton DataSource，避免內部重複建立連線池
builder.Services.AddDbContextPool<AppDbContext>((serviceProvider, options) =>
{
    var ds = serviceProvider.GetRequiredService<NpgsqlDataSource>();
    options.UseNpgsql(ds);
});

// 3. 註冊 DbContext 工廠供背景 Worker 與並行處理使用
builder.Services.AddPooledDbContextFactory<AppDbContext>((serviceProvider, options) =>
{
    var ds = serviceProvider.GetRequiredService<NpgsqlDataSource>();
    options.UseNpgsql(ds);
});

// 4. Dapper 查詢專用 Repository：直接從 Singleton DbDataSource 借連線
builder.Services.AddScoped<IOrderQueryRepository, OrderQueryRepository>();

var app = builder.Build();
```

搭配 Dapper 時的正確實作模式：
```csharp
public class OrderQueryRepository : IOrderQueryRepository
{
    private readonly DbDataSource _dataSource;

    public OrderQueryRepository(DbDataSource dataSource)
    {
        _dataSource = dataSource;
    }

    public async Task<OrderSummary?> GetOrderSummaryAsync(Guid orderId, CancellationToken ct)
    {
        const string sql = """
            SELECT id, user_id, total_amount, created_at
            FROM orders
            WHERE id = @OrderId;
            """;

        // 從 Singleton DbDataSource 借出連線，查詢完畢自動歸還池中
        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        var command = new CommandDefinition(sql, new { OrderId = orderId }, cancellationToken: ct);
        return await conn.QuerySingleOrDefaultAsync<OrderSummary>(command);
    }
}
```

---

## 踩坑與避坑指南

### 1. 生命週期邊界原則表
| 物件類型 | 建議 DI 生命週期 | 核心責任 | 執行緒安全 |
| :--- | :--- | :--- | :--- |
| **`DbDataSource`** | **Singleton** | 集中掌管實體連線池、TLS 快取、全域型別映射 | 是（Thread-safe） |
| **`DbContext`** | **Scoped** | 單一 HTTP Request 內的工作單元、實體狀態追蹤 | **否（非執行緒安全）** |
| **`IDbContextFactory<T>`**| **Singleton** | 在非 Request 流程（如 Worker）中安全產出短命 DbContext | 是（Thread-safe） |
| **`DbConnection`** | **Transient / 區域變數** | 代表單次操作的實體連線借用，必須搭配 `await using` | **否（非執行緒安全）** |

### 2. CancellationToken 傳遞與阻斷邊界
- **避坑點**：在非同步資料庫操作中，若未傳遞 `CancellationToken`，當 Client 端因為逾時主動中斷 HTTP 請求時，K8s 雖然取消了請求管線，但資料庫端仍會傻傻地繼續執行該龐大查詢，白白佔用連線與 CPU。
- **規則**：Controller 或 Endpoint 的 `CancellationToken` 必須一路傳遞至所有 EF Core 方法（如 `ToListAsync(ct)`）與 Dapper 的 `CommandDefinition(..., cancellationToken: ct)`。

### 3. DbContextPool 中的狀態殘留陷阱
- 若啟用了 `AddDbContextPool<T>`，EF Core 在歸還 Context 到池中時會重設 ChangeTracker，但**不會**重設你在 DbContext 內部自訂的欄位變數。
- **避坑點**：絕不要在 DbContext 類別內宣告儲存自訂狀態（如目前使用者 ID 或暫存清單）的實體成員，否則下一個借用該 Context 的請求將讀取到前一個請求的髒資料。

---

## 線上排查指令

### 1. 即時觀測資料庫連線開啟與關閉日誌

在 `appsettings.Development.json` 或線上診斷環境調整記錄等級，觀察連線開啟與釋放是否成對：
```json
{
  "Logging": {
    "LogLevel": {
      "Microsoft.EntityFrameworkCore.Database.Connection": "Debug",
      "Npgsql": "Information"
    }
  }
}
```
正常情境下，日誌應呈現 `Opening connection to database` 緊接著執行 SQL，並在最快時間內出現 `Closing connection to database`。若發現只開不關，即存在連線洩漏。

### 2. 資料庫端查詢當前活動客戶端與來源 Process

**PostgreSQL：**
```sql
-- 查看所有目前建立的連線來源 IP、應用程式名稱與狀態
SELECT pid, client_addr, application_name, state, query
FROM pg_stat_activity
WHERE datname = current_database()
ORDER BY state_change DESC;
```

**MySQL：**
```sql
-- 查看目前所有連線線程與執行狀態
SELECT ID, USER, HOST, DB, COMMAND, TIME, STATE, INFO
FROM information_schema.PROCESSLIST
ORDER BY TIME DESC;
```

### 3. .NET 診斷計數器觀察連線池借用

使用 `dotnet-counters` 即時觀察 .NET 10 中的資料連線指標：
```bash
dotnet-counters monitor -p $(pgrep -f "MyApp.dll") \
  --counters Microsoft.Data.SqlClient,Npgsql,System.Data
```
重點關注 `ActiveConnections`（當前借出數）與 `QueuedRequests`（正在排隊等連線的請求數）。若 `QueuedRequests` 大於 0 且持續攀升，代表系統已出現連線池瓶頸。
