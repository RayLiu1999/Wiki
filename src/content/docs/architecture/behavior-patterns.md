---
title: "Strategy、Decorator 與行為組合"
description: "分清替換一個規則和包住既有服務，用運費及商品快取說明組合。"
articleId: "architecture-behavior-patterns"
topic: "architecture"
category: "object-patterns"
order: 6
tags:
  - "Strategy、Decorator 與行為組合"
  - "architecture"
difficulty: "advanced"
prerequisites:
  - "csharp-syntax-traps"
  - "aspnet-core-dependency-injection"
relatedArticles:
  - "redis-cache-aside"
  - "architecture-cross-cutting"
applicableVersions: "以 C# 14／.NET 10 說明；框架與供應商差異見內文。"
lastReviewed: "2026-10-10"
takeaway: "分清替換一個規則和包住既有服務，用運費及商品快取說明組合。"
sources:
  - title: "DI 指南"
    url: "https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection-guidelines"
  - title: "Cache-Aside"
    url: "https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside"
  - title: "設計相依方向"
    url: "https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures"
---

## 案發現場

在電商平台的演化過程中，「條件分支膨脹」是系統腐化的最快途徑。

最常見的案發現場是**失控的運費計算邏輯**：
在購物車結帳類別中，充斥著高達 300 行的 `switch-case` 巢狀判斷：
```csharp
// 典型反模式：巨大且脆弱的分支判斷
switch (shippingType)
{
    case ShippingType.HomeDelivery:
        // 常規宅配計算...
        break;
    case ShippingType.ConvenienceStore:
        // 超商取貨計算...
        break;
    case ShippingType.ColdChain:
        // 冷凍冷鏈溫控加價...
        break;
    case ShippingType.OffshoreIslands:
        // 外島加成...
        break;
}
```
每當營運團隊新增一種「跨境直郵」或調整特定促銷運費時，工程師就必須直接修改這段核心結帳代碼。某次一位資淺工程師修改了外島計算邏輯，卻因不小心漏了 `break` 或共享了區域變數，導致全台超商取貨的運費全部被歸零，造成數百萬元的運費補貼災難。

另一個經典現場是**快取邏輯對資料存取層的暴力侵入**：
工程師為了加速商品詳情查詢，直接在 `ProductRepository` 內部注入了 `IDistributedCache`。每一條資料庫查詢周圍，都夾雜著手動序列化 JSON、設定快取過期時間的代碼。這導致 `ProductRepository` 既要管 SQL，又要管 Redis 連線，單元測試極難撰寫，甚至在 Redis 當機時整個資料庫存取跟著崩潰。

---

## 反模式與正確解法

### 1. 行為模式責任對照

- **策略模式（Strategy Pattern）**：用來**替換演算法核心（Interchangeable Algorithm）**。定義同一族行為的共通合約，讓演算法能獨立於使用它的客戶端進行切換。
- **裝飾者模式（Decorator Pattern）**：用來**透明包裝既有服務（Wrapper / Extensible Behavior）**。在不改變既有介面合約的前提下，為被裝飾者疊加新行為（如快取、日誌、計時或重試）。

---

### 反模式一：修改既有代碼以支援新業務分支（違反開閉原則）

每新增一種運費規則，就得重新修改並測試整個核心結帳類別，且各分支邏輯共享變數，極易產生意外副效應。

### 正確解法一：策略模式結合 .NET 10 Keyed Services 動態分派

定義乾淨的 `IShippingFeeStrategy` 介面，每種運費規則封裝在獨立類別中，並利用 .NET 原生的鍵值依賴注入（Keyed Services）動態解析：

```csharp
// 1. 定義策略共通介面
public interface IShippingFeeStrategy
{
    ValueTask<Money> CalculateFeeAsync(Order order, CancellationToken ct);
}

// 2. 獨立封裝各策略（遵守單一職責與開閉原則）
public class HomeDeliveryStrategy : IShippingFeeStrategy
{
    public ValueTask<Money> CalculateFeeAsync(Order order, CancellationToken ct)
    {
        var fee = order.TotalAmount.Amount >= 1000 ? 0 : 100;
        return ValueTask.FromResult(new Money(fee));
    }
}

public class ColdChainDeliveryStrategy : IShippingFeeStrategy
{
    public ValueTask<Money> CalculateFeeAsync(Order order, CancellationToken ct)
    {
        // 冷鏈固定加收溫控處理費 200 元
        return ValueTask.FromResult(new Money(200));
    }
}

// 3. Program.cs 註冊 Keyed 服務
builder.Services.AddKeyedScoped<IShippingFeeStrategy, HomeDeliveryStrategy>("Home");
builder.Services.AddKeyedScoped<IShippingFeeStrategy, ColdChainDeliveryStrategy>("ColdChain");

// 4. 結帳服務透過 Keyed 策略動態取得對應計算器
public class CheckoutService
{
    private readonly IServiceProvider _serviceProvider;

    public CheckoutService(IServiceProvider serviceProvider) => _serviceProvider = serviceProvider;

    public async Task<Money> CalculateShippingAsync(string shippingMethod, Order order, CancellationToken ct)
    {
        var strategy = _serviceProvider.GetKeyedService<IShippingFeeStrategy>(shippingMethod)
            ?? throw new NotSupportedException($"不支援的物流方式: {shippingMethod}");

        return await strategy.CalculateFeeAsync(order, ct);
    }
}
```

---

### 反模式二：將非功能性快取混入持久化倉儲

讓 `ProductRepository` 同時負責資料庫操作與 Redis 快取，破壞關注點分離。

### 正確解法二：裝飾者模式透明疊加快取層

讓 `ProductRepository` 專注於純資料庫查詢，另建 `CachedProductRepository` 實作相同介面，並將底層倉儲作為依賴包裹在內：

```csharp
// 1. 共通業務介面
public interface IProductRepository
{
    Task<ProductDto?> GetByIdAsync(long id, CancellationToken ct);
}

// 2. 純資料庫實作（零快取雜訊）
public class SqlProductRepository : IProductRepository
{
    private readonly AppDbContext _db;
    public SqlProductRepository(AppDbContext db) => _db = db;

    public async Task<ProductDto?> GetByIdAsync(long id, CancellationToken ct) =>
        await _db.Products
            .AsNoTracking()
            .Where(p => p.Id == id)
            .Select(p => new ProductDto(p.Id, p.Name, p.Price))
            .FirstOrDefaultAsync(ct);
}

// 3. 裝飾者實作：透明疊加 Redis 快取與 Fallback 機制
public class CachedProductRepository : IProductRepository
{
    private readonly IProductRepository _inner;
    private readonly IHybridCache _cache; // 或 IDistributedCache

    public CachedProductRepository(IProductRepository inner, IHybridCache cache)
    {
        _inner = inner;
        _cache = cache;
    }

    public async Task<ProductDto?> GetByIdAsync(long id, CancellationToken ct)
    {
        var cacheKey = $"product:{id}";

        // 先查快取；若 Miss 則透明呼叫底層 SqlProductRepository 並回填
        return await _cache.GetOrCreateAsync(
            cacheKey,
            async token => await _inner.GetByIdAsync(id, token),
            cancellationToken: ct);
    }
}
```

在 DI 容器中註冊裝飾關係：
```csharp
// Program.cs: 原生工廠方式註冊裝飾者模式
builder.Services.AddScoped<SqlProductRepository>();
builder.Services.AddScoped<IProductRepository>(sp =>
{
    var sqlRepo = sp.GetRequiredService<SqlProductRepository>();
    var cache = sp.GetRequiredService<IHybridCache>();
    return new CachedProductRepository(sqlRepo, cache);
});
```

---

## 踩坑與避坑指南

### 1. 避免過度抽象（何時不該用 Strategy？）
- **原則**：如果分支只有 2~3 個，且在可預見的未來幾年內完全不會增加（例如：性別、是否啟用），**優先使用 C# 的 Pattern Matching（`switch expression`）**！
- 只有當分支規則會頻繁新增、或是不同分支需要注入截然不同的外部服務時，引入 Strategy 模式才有實質效益。

### 2. 裝飾者鏈（Decorator Chaining）的包裹順序
- 當系統同時需要 `Logging`、`Caching` 與 `SqlPersistence` 時，包裹順序至關重要：
  - **外層**：`LoggingProductRepository`（記錄端到端總耗時，包含快取命中與未命中的所有請求）。
  - **中層**：`CachedProductRepository`（攔截快取）。
  - **內層**：`SqlProductRepository`（真正打到資料庫）。

---

## 線上排查指令

### 1. 觀測策略分派命中日誌

```bash
# 觀察運費計算策略調度日誌
kubectl logs -l app=ecommerce-api --tail=500 | grep "IShippingFeeStrategy"
```

### 2. 檢測裝飾者快取穿透率與命中率

透過 Prometheus 監控 `CachedProductRepository` 的快取命中比例：
```text
# 計算快取命中率（目標 > 90%）
sum(rate(cache_hits_total{service="Product"}[5m])) 
/ 
(sum(rate(cache_hits_total{service="Product"}[5m])) + sum(rate(cache_misses_total{service="Product"}[5m])))
```

### 3. Prometheus / Grafana 監控指標

```text
# 各物流策略被呼叫頻率
sum(rate(shipping_strategy_invocations_total[5m])) by (method)

# 底層資料庫實際查詢頻率（若裝飾快取生效，此數值應遠低於 API 請求數）
rate(db_product_queries_total[1m])
```
