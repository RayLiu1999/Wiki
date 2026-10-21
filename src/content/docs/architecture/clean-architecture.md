---
title: "Clean Architecture、模組與相依方向"
description: "從建立訂單說明領域、用例、基礎設施與入口的責任，以及分層的成本。"
articleId: "architecture-clean-architecture"
topic: "architecture"
category: "domain-design"
order: 7
tags:
  - "Clean Architecture、模組與相依方向"
  - "architecture"
difficulty: "advanced"
prerequisites:
  - "architecture-domain-modeling"
  - "architecture-application-patterns"
relatedArticles:
  - "architecture-outbox-inbox"
  - "engineering-business-tests"
applicableVersions: "以 C# 14／.NET 10 說明；框架與供應商差異見內文。"
lastReviewed: "2026-10-10"
takeaway: "從建立訂單說明領域、用例、基礎設施與入口的責任，以及分層的成本。"
sources:
  - title: "常見 Web 架構"
    url: "https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures"
  - title: "Domain Model"
    url: "https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/net-core-microservice-domain-model"
---

## 案發現場

在許多採用「整潔架構（Clean Architecture）」或「洋蔥架構（Onion Architecture）」的 .NET 專案中，開發團隊常陷入一種沉重的**過度分層架構泥淖**：

為了一個簡單的「查詢商品詳情」功能，專案劃分了 6 個獨立的 `.csproj`（`Domain`, `Application`, `Infrastructure`, `Persistence`, `Contracts`, `WebAPI`）。工程師必須新增或修改 8 個檔案：
1. `ProductEntity`
2. `IProductRepository`
3. `ProductRepository`
4. `GetProductQuery`
5. `GetProductQueryHandler`
6. `ProductDto`
7. `ProductResponse`
8. `ProductController`

每次資料庫要增加一個欄位，開發者必須在 Entity ➔ Persistence Model ➔ Application DTO ➔ API Response 間反覆對照 4 次。整個系統 90% 的代碼是沒有實質邏輯的透傳（Pass-through）。

更諷刺的是，雖然建立了這麼多層，檢查專案引用卻發現：
- `Domain` 專案不小心引用了 `Microsoft.EntityFrameworkCore` 來加標籤屬性；
- `Application` 直接引用了 AWS 或 Google Cloud SDK；
- `Infrastructure` 拋出的資料庫 SQL 例外一路穿透到 API 層，使用者直接看到連線字串逾時。

**分層增加了 5 倍的開發成本，卻絲毫沒有帶來真正的解耦與可測試性！**

---

## 反模式與正確解法

### 1. 核心依賴反轉原則（Dependency Rule）

Clean Architecture 的唯一靈魂是**依賴方向（Dependency Direction）**：
**所有原始碼相依性必須永遠向內指向高層政策（Domain），外層可以依賴內層，但內層絕不能依賴外層！**

```text
[ Presentation (Web API / UI) ] ──┐
                                   ▼
[ Infrastructure (EF Core / MQ) ] ──> [ Application (Use Cases) ] ──> [ Domain (純商業核心) ]
```

### 反模式一：Domain 與 Application 引用外部技術框架

當你在 `Domain` 或 `Application` 專案的 `.csproj` 中引入 `Microsoft.EntityFrameworkCore.SqlServer` 或 `StackExchange.Redis` 時，領域模型就被特定的技術實作給綁架了。一旦資料庫升級或需要切換，核心商業邏輯將被迫跟著改動。

### 正確解法一：純 C# 領域核心與依賴反轉（DIP）

`Domain` 專案必須是**純粹的 C# 類別庫（Plain Old C# Objects, POCO）**，不引用任何外部 ORM、Web 框架或第三方 SDK：

```csharp
// Domain 層：純粹商業邏輯，零外部套件相依
namespace Ecommerce.Domain.Orders;

public class Order
{
    public Guid Id { get; private set; }
    public Guid CustomerId { get; private set; }
    public OrderStatus Status { get; private set; }
    private readonly List<OrderItem> _items = new();
    public IReadOnlyCollection<OrderItem> Items => _items.AsReadOnly();

    private Order() { } // 給 EF Core 映射用

    public Order(Guid customerId)
    {
        Id = Guid.NewGuid();
        CustomerId = customerId;
        Status = OrderStatus.Created;
    }

    public void AddItem(Guid productId, decimal unitPrice, int quantity)
    {
        if (Status != OrderStatus.Created)
            throw new InvalidOperationException("已提交之訂單不可修改明細");

        if (quantity <= 0)
            throw new ArgumentException("購買數量必須大於零", nameof(quantity));

        _items.Add(new OrderItem(productId, unitPrice, quantity));
    }
}
```

在 `Application` 層定義抽象介面（Ports）：
```csharp
// Application 層：定義業務意圖與邊界介面
namespace Ecommerce.Application.Orders;

public interface IOrderRepository
{
    Task<Order?> GetByIdAsync(Guid id, CancellationToken ct);
    Task AddAsync(Order order, CancellationToken ct);
}

public interface IPaymentService
{
    Task<bool> ProcessPaymentAsync(Guid orderId, decimal amount, CancellationToken ct);
}
```

在 `Infrastructure` 層實作介面（Adapters）：
```csharp
// Infrastructure 層：實作具體技術細節（依賴 EF Core）
namespace Ecommerce.Infrastructure.Persistence;

public class OrderRepository : IOrderRepository
{
    private readonly AppDbContext _db;

    public OrderRepository(AppDbContext db) => _db = db;

    public async Task<Order?> GetByIdAsync(Guid id, CancellationToken ct) =>
        await _db.Orders.Include(o => o.Items).FirstOrDefaultAsync(o => o.Id == id, ct);

    public async Task AddAsync(Order order, CancellationToken ct) =>
        await _db.Orders.AddAsync(order, ct);
}
```

---

### 反模式二：水平大一統分層導致的架構僵化

所有業務（訂單、商品、會員、促銷）混在同一個巨大的 `Application` 和 `Domain` 專案中，導致檔案數量高達數百個，改動任何一個類別都會觸發全專案編譯。

### 正確解法二：垂直切片（Vertical Slice Architecture）與限界上下文（Bounded Context）

以**業務功能（Feature）**為縱向切割單位，而非以技術層次為橫向切割。對於單純的 CRUD 查詢，允許直接從 Controller 透過 Dapper / EF Core 讀取資料庫，省略無謂的 Repository 與 Domain 映射：

```csharp
// 垂直切片查詢範例：直接投影，零中間層負擔
public static class GetProductDetailsEndpoint
{
    public record Response(Guid Id, string Name, decimal Price);

    public static void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/products/{id:guid}", async (
            Guid id, 
            AppDbContext db, 
            CancellationToken ct) =>
        {
            var product = await db.Products
                .AsNoTracking()
                .Where(p => p.Id == id)
                .Select(p => new Response(p.Id, p.Name, p.Price))
                .FirstOrDefaultAsync(ct);

            return product is not null ? Results.Ok(product) : Results.NotFound();
        });
    }
}
```

---

## 踩坑與避坑指南

### 1. 分層成本評估矩陣
| 架構風格 | 適用情境 | 優點 | 缺點 / 成本 |
| :--- | :--- | :--- | :--- |
| **經典 Clean Architecture** | 核心交易、高複雜度業務規則（如計費引擎、清算、下單） | 商業規則高度保護、易於單元測試、可抽換外部驅動 | 檔案繁多、小功能樣板代碼重 |
| **Vertical Slice Architecture** | 快速迭代、以報表/CRUD 為主的微服務 | 每個功能高度獨立、修改範圍極窄、無穿透樣板 | 缺乏全域約束時容易代碼重複 |

### 2. AutoMapper 的效能與維護陷阱
- 在多層架構中，開發者常大量使用 `AutoMapper` 進行各層物件轉換。
- **避坑點**：AutoMapper 在深層巢狀映射時會產生大量反射開銷，且欄位重新命名時在編譯期**無法報錯**，極易在執行期引發 NullReferenceException。
- **現代最佳實踐**：使用編譯期代碼生成工具（如 **Mapperly**）或手寫明確的 Extension Method，兼顧編譯期型別安全與零開銷效能。

### 3. 例外（Exception）在層級間的洩漏與轉換
- Infrastructure 層發生的資料庫專屬例外（如 `NpgsqlException` / `MySqlException`）絕不能直接向上拋給前端。
- 應由 Application 層或全域例外中介軟體捕獲，並轉換為語意清晰的業務結果或 RFC 7807 `ProblemDetails`。

---

## 線上排查指令

### 1. 利用 .NET CLI 檢驗專案依賴方向

在方案目錄執行，確保底層專案沒有逆向引用上層專案：
```bash
# 檢查 Domain 專案的實際套件依賴（應完全無 EF Core 或第三方 Web 套件）
dotnet list src/Ecommerce.Domain package

# 檢驗專案引用依賴圖
dotnet list src/Ecommerce.Domain reference
```

### 2. 即時觀測分層管線耗時分佈

使用 OpenTelemetry Distributed Tracing 觀察一個請求在 Controller ➔ Handler ➔ Repository 各階段的耗時：
```bash
# 檢視 ASP.NET Core 活動追蹤與診斷記錄
dotnet-trace collect --name Ecommerce.Api --providers Microsoft-Diagnostics-DiagnosticSource
```

### 3. Prometheus / Grafana 監控指標

```text
# 監控各業務 Use Case 的執行延遲分位數
histogram_quantile(0.99, sum(rate(application_usecase_duration_seconds_bucket[5m])) by (le, usecase))

# 業務領域規則違規計數（例如拋出 DomainException 的頻率）
rate(domain_exceptions_total[1m])
```
