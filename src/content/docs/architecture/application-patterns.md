---
title: "Repository、Unit of Work 與 CQRS"
description: "將 Command、Query、Handler、DTO 與 Validator 放在適當位置，避免模式堆疊。"
articleId: "architecture-application-patterns"
topic: "architecture"
category: "application-patterns"
order: 2
tags:
  - "Repository"
  - "Unit of Work"
  - "Mediator"
  - "CQRS"
  - "Command"
  - "Query"
  - "Handler"
  - "DTO"
  - "Validator"
difficulty: "intermediate"
learningDepth: "deep"
prerequisites:
  - "architecture-domain-modeling"
relatedArticles:
  - "data-access-transactions"
  - "data-access-ef-core"
  - "engineering-business-tests"
  - "aspnet-core-model-binding"
  - "architecture-outbox-inbox"
  - "architecture-communication-boundaries"
applicableVersions: "以 .NET 10 生態系與本文列出的官方文件核對；套件及資料庫供應商的差異見內文。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-10"
takeaway: "模式用來釐清責任；CQRS 不要求分開資料庫，Mediator 也不會自動提供交易。"
sources:
  - title: "Microsoft Learn：CQRS"
    url: "https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs"
  - title: "Microsoft Learn：實作 Repository 與 Unit of Work"
    url: "https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-implementation"
---

## 案發現場

在 .NET 專案中，幾乎所有工程師都曾見過以下這種「經典的過度封裝反模式」：

開發者定義了泛型倉儲介面：
```csharp
public interface IGenericRepository<T> where T : class
{
    IQueryable<T> GetAll();
    Task<T?> GetByIdAsync(object id);
    Task AddAsync(T entity);
    Task UpdateAsync(T entity);
    Task DeleteAsync(object id);
}
```
宣稱的理由通常是：「為了將業務邏輯與 EF Core 解耦，方便未來把資料庫從 SQL Server 換成 MongoDB 或 PostgreSQL，並且方便寫 Mock 單元測試」。

然而在真實維護中，慘況迅速顯現：
1. **抽象洩漏**：`GetAll()` 回傳了 `IQueryable<T>`。所有複雜的 `Where`、`Include`、`OrderBy` 依然由 Service 層拼湊。這意味著 Service 層依然深深依賴 LINQ-to-Entities 的 SQL 轉譯行為，換資料庫的承諾從第一天起就是謊言。
2. **效能災難**：因為包了一層 `IGenericRepository`，開發者無法在倉儲層精確控制 `AsSplitQuery`、`AsNoTracking` 或自訂 SQL 批次。
3. **偽 CQRS 泥淖**：團隊決定引入 CQRS（命令查詢職責分離），卻誤信網路教學，立刻搞出兩個實體資料庫（一個寫庫，一個讀庫），結果為了解決兩庫之間的非同步同步延遲，整整耗費三個月排查「剛下單卻查不到」的幽靈 Bug。

---

## 反模式與正確解法

### 1. EF Core 本身就是 Repository 與 Unit of Work

必須正視一個技術事實：
- **`DbSet<T>` 本身就是 Repository**：它提供對特定實體集合的查詢與變更追蹤。
- **`DbContext` 本身就是 Unit of Work**：它維護記憶體中的異動清單，並在呼叫 `SaveChangesAsync()` 時以單一資料庫交易原子提交。

在 `DbContext` 外面再機械性地包一層 1:1 的 `GenericRepository<T>` 與 `IUnitOfWork`，大多只是無謂的重複轉發。

---

### 反模式一：Generic Repository 暴露 IQueryable

若倉儲介面暴露 `IQueryable<T>`，資料庫查詢邏輯將無節制地滲透並散落至全系統任何角落，無法在單一地方進行索引審查或查詢優化。

### 正確解法一：以 Aggregate Root 為邊界的語意化倉儲（Semantic Repository）

倉儲介面應**完全依附於 Aggregate Root**，方法名稱應直接體現業務語意，且永遠只回傳已完成評估的領域實體或唯讀資料（Task<T>，絕不回傳 IQueryable）：

```csharp
// 正確解法：語意化倉儲介面（純領域語意，零抽象洩漏）
public interface IOrderRepository
{
    Task<Order?> GetByIdForUpdateAsync(Guid id, CancellationToken ct);
    Task<IReadOnlyList<Order>> GetPendingPaymentOrdersOlderThanAsync(DateTimeOffset thresholdUtc, CancellationToken ct);
    Task AddAsync(Order order, CancellationToken ct);
}

// 實作層：在內部精準封裝 EF Core 的查詢優化與追蹤行為
public class OrderRepository : IOrderRepository
{
    private readonly AppDbContext _db;

    public OrderRepository(AppDbContext db) => _db = db;

    public async Task<Order?> GetByIdForUpdateAsync(Guid id, CancellationToken ct)
    {
        // 內部決定載入策略：包含明細並保持追蹤
        return await _db.Orders
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.Id == id, ct);
    }

    public async Task<IReadOnlyList<Order>> GetPendingPaymentOrdersOlderThanAsync(
        DateTimeOffset thresholdUtc, 
        CancellationToken ct)
    {
        return await _db.Orders
            .AsNoTracking()
            .Where(o => o.Status == OrderStatus.PendingPayment && o.CreatedAt < thresholdUtc)
            .ToListAsync(ct);
    }

    public async Task AddAsync(Order order, CancellationToken ct) =>
        await _db.Orders.AddAsync(order, ct);
}
```

---

### 反模式二：無痛點地盲目引入跨庫 CQRS

為了 CQRS，將讀取端搬到 Elasticsearch 或另一個 Redis 庫，卻為了維持資料一致性搞出複雜的補償邏輯。

### 正確解法二：同庫輕量級 CQRS（Command / Query 路徑分離）

CQRS 的核心精髓是**職責分離（Separation of Concerns）**，**不需要拆分實體資料庫！**
- **Command（寫入路徑）**：注重商業不變量與狀態一致性，透過 Aggregate 載入、執行領域方法、由 EF Core 交易提交。
- **Query（讀取路徑）**：注重吞吐量與低延遲，直接繞過 Domain Model 與 ChangeTracker，利用 Dapper 或 EF Core `AsNoTracking()` 扁平投影至 DTO：

```csharp
// CQRS 讀取路徑：直接利用 Dapper 扁平投影，極致速度且零追蹤開銷
public class GetOrderSummaryQueryHandler : IRequestHandler<GetOrderSummaryQuery, OrderSummaryDto?>
{
    private readonly DbDataSource _dataSource;

    public GetOrderSummaryQueryHandler(DbDataSource dataSource)
    {
        _dataSource = dataSource;
    }

    public async Task<OrderSummaryDto?> Handle(GetOrderSummaryQuery request, CancellationToken ct)
    {
        const string sql = """
            SELECT id, customer_id, total_amount, status, created_at
            FROM orders
            WHERE id = @OrderId;
            """;

        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        return await conn.QuerySingleOrDefaultAsync<OrderSummaryDto>(
            new CommandDefinition(sql, new { request.OrderId }, cancellationToken: ct));
    }
}
```

---

## 踩坑與避坑指南

### 1. MediatR Pipeline Behavior 中「無腦包裹交易」的陷阱
- **現象**：很多架構範例中寫了一個 `TransactionBehavior<TRequest, TResponse>`，對所有經過 MediatR 的請求自動開啟 `BeginTransactionAsync()`。
- **踩坑點**：所有的 `Query`（讀取操作）也會被無辜地包裹進資料庫交易中，白白佔用連線池與鎖資源！
- **規則**：交易行為管線必須只針對實作了標記介面（如 `ITransactionalCommand`）的請求生效，Query 請求必須完全跳過。

### 2. 查詢端過度載入 Aggregate 實體樹
- 只要是為了在網頁或 App 列表顯示資訊，**絕不要**載入完整的領域聚合根！
- 載入整顆包含明細、日誌的 Aggregate，再手動轉為 DTO，不僅浪費記憶體，還會產生昂貴的資料庫 JOIN 與多餘的實體追蹤。

---

## 線上排查指令

### 1. 檢驗讀寫查詢的路徑延遲與資料庫耗時

```sql
-- PostgreSQL 查詢 Command（寫入）與 Query（讀取）的前 5 名耗時陳述式
SELECT 
    substring(query, 1, 50) AS short_query,
    calls, 
    round(total_exec_time::numeric, 2) AS total_time_ms,
    round(mean_exec_time::numeric, 2) AS avg_time_ms
FROM pg_stat_statements
WHERE query ILIKE '%orders%'
ORDER BY total_exec_time DESC
LIMIT 5;
```

### 2. .NET 診斷觀測 ChangeTracker 實體追蹤負擔

在開發與效能檢測環境，監控讀取請求是否誤開啟了追蹤：
```bash
# 監控 EF Core 實體追蹤計數器
dotnet-counters monitor -p $(pgrep -f "Ecommerce.Api.dll") \
  --counters Microsoft.EntityFrameworkCore
```
重點關注 `active-contexts` 與 `execution-strategy-operation-failures`。

### 3. Prometheus / Grafana 監控指標

```text
# 寫入 Command 執行耗時 p95 分位數
histogram_quantile(0.95, sum(rate(application_command_duration_seconds_bucket[1m])) by (le, command))

# 讀取 Query 執行耗時 p95 分位數（通常應低於 10ms）
histogram_quantile(0.95, sum(rate(application_query_duration_seconds_bucket[1m])) by (le, query))
```
