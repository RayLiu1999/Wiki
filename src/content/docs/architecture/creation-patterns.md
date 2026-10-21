---
title: "Factory、Builder 與物件建立邊界"
description: "從合法訂單與結帳草稿分清建立入口、組裝步驟與額外抽象的成本。"
articleId: "architecture-creation-patterns"
topic: "architecture"
category: "object-patterns"
order: 5
tags:
  - "Factory、Builder 與物件建立邊界"
  - "architecture"
difficulty: "advanced"
prerequisites:
  - "csharp-syntax-traps"
  - "architecture-domain-modeling"
relatedArticles:
  - "architecture-behavior-patterns"
  - "aspnet-core-dependency-injection"
applicableVersions: "以 C# 14／.NET 10 說明；框架與供應商差異見內文。"
lastReviewed: "2026-10-10"
takeaway: "從合法訂單與結帳草稿分清建立入口、組裝步驟與額外抽象的成本。"
sources:
  - title: "Domain Model"
    url: "https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/net-core-microservice-domain-model"
  - title: "DI"
    url: "https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection"
---

## 案發現場

在複雜的業務領域（如電商結帳、保險核保或金融清算）中，物件的「誕生過程」往往是系統穩定性的第一道防線。

典型災難現場一：**「半成品物件（Half-baked Objects）」的狀態逸出**。
開發者在建立訂單時，依賴傳統的公有無參建構子與屬性賦值：
```csharp
var order = new Order();
order.CustomerId = req.CustomerId;
// 開發者在此處發生中斷或順序顛倒：
// 先計算了折扣，但此時 Items 尚未加入，導致折抵總額永遠為 0！
order.ApplyDiscount(discount);
order.Items = req.Items;
```
這種物件在建立的過程中處於**暫態不合法狀態**。一旦拋出未捕捉例外或被其他並行執行緒讀取，系統就會拿著這半生不熟的物件去執行後續流程，引發嚴重的計算錯誤。

典型災難現場二：**模式濫用與過度抽象（Factory Explosion）**。
另一批工程師走到相反的極端：為了一個僅有 3 個欄位的唯讀 DTO（如 `UserAddressDto`），硬套了包含 4 個介面、3 個抽象工廠與 1 個 Fluent Builder 的架構：
```text
IAddressBuilder ➔ AddressBuilder ➔ IAddressFactory ➔ ConcreteAddressFactory
```
為了閱讀一行物件建立代碼，新進工程師要在 6 個檔案之間反覆跳轉，代碼膨脹數倍，卻毫無實質商業價值。

---

## 反模式與正確解法

### 1. 建立模式選型決策

| 模式 | 適用情境 | 核心價值 | 避免濫用 |
| :--- | :--- | :--- | :--- |
| **建構子（Constructor）** | 屬性少（$\le 4$ 個）、參數不可缺少、無複雜分支。 | 最直接、編譯期型別安全。 | 參數過長（超過 6 個參數時極易傳錯順序）。 |
| **靜態工廠方法（Static Factory Method）** | 語意化建立入口、同型別多種建立語意。 | 具備業務意圖名稱（如 `FromUtc`、`Empty`）。 | 避免在工廠方法中執行隱式 I/O 或資料庫呼叫。 |
| **領域工廠（Domain Factory）** | 聚合根建立牽涉複雜不變量、序號生成或依賴外部規則。 | 保證「物件一旦產出，即為絕對合法狀態」。 | 不要將簡單物件無端工廠化。 |
| **Fluent Builder** | 包含大量選填設定（如複雜查詢規格）、或測試資料組裝。 | 語意流暢、按步驟裝配。 | 避免在生產運行時代碼中無節制配置過度鏈式呼叫。 |

---

### 反模式一：公有建構子暴露內部結構

物件宣告大量公有 Setter，外部呼叫者必須記住複雜的欄位賦值順序才能拼裝出合法物件。

### 正確解法一：靜態工廠方法封裝業務意圖

將建構子設為 `private`，透過具備業務含義的靜態方法作為唯一入口：

```csharp
// 正確解法：靜態工廠方法明確表達建立意圖
public class Order
{
    public Guid Id { get; private set; }
    public OrderStatus Status { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }

    private Order(Guid id, OrderStatus status, DateTimeOffset createdAt)
    {
        Id = id;
        Status = status;
        CreatedAt = createdAt;
    }

    // 業務入口一：建立常規結帳訂單
    public static Order CreateNew(Guid customerId)
    {
        return new Order(Guid.NewGuid(), OrderStatus.PendingPayment, DateTimeOffset.UtcNow);
    }

    // 業務入口二：建立快速草稿（例如購物車暫存）
    public static Order CreateDraft()
    {
        return new Order(Guid.NewGuid(), OrderStatus.Draft, DateTimeOffset.UtcNow);
    }
}
```

---

### 反模式二：工廠內部注入資料庫連線並執行持久化

工程師將 `IOrderRepository` 甚至 `AppDbContext` 注入到 `OrderFactory` 內部，讓工廠在建立物件的同時呼叫 `SaveChangesAsync()`。這混淆了**「物件實例化（Creation）」**與**「資料持久化（Persistence）」**的邊界。

### 正確解法二：純記憶體領域工廠（Domain Factory）

領域工廠只專注於**純記憶體的聚合組裝與不變量校驗**，絕對不執行資料庫 I/O：

```csharp
// 正確解法：複雜聚合的專屬領域工廠
public class OrderFactory
{
    private readonly IDiscountPolicy _discountPolicy;

    public OrderFactory(IDiscountPolicy discountPolicy)
    {
        _discountPolicy = discountPolicy;
    }

    public Order CreateOrder(
        Customer customer, 
        IReadOnlyList<CartItem> cartItems, 
        string? couponCode)
    {
        if (cartItems == null || !cartItems.Any())
            throw new DomainValidationException("無法使用空購物車建立訂單");

        var order = Order.CreateNew(customer.Id);

        foreach (var item in cartItems)
        {
            order.AddItem(item.ProductId, item.UnitPrice, item.Quantity);
        }

        // 依據促銷策略計算合法折抵（純領域邏輯）
        var discount = _discountPolicy.CalculateDiscount(customer, order, couponCode);
        order.ApplyDiscount(discount);

        return order; // 產出之物件保證完整合法！
    }
}
```

---

### 正確解法三：在測試中利用 Test Data Builder 保持測試代碼精煉

在單元測試中，若每個測試都手寫 20 行組裝 `Order`，測試代碼將難以閱讀。使用 Builder 模式提供預設值，僅在測試需要時覆蓋特定屬性：

```csharp
// 測試專用 Builder：極致提升測試可讀性
public class OrderBuilder
{
    private Guid _customerId = Guid.NewGuid();
    private readonly List<OrderItem> _items = new();

    public OrderBuilder WithCustomer(Guid customerId)
    {
        _customerId = customerId;
        return this;
    }

    public OrderBuilder WithItem(Guid productId, decimal price, int qty = 1)
    {
        _items.Add(new OrderItem(productId, new Money(price), qty));
        return this;
    }

    public Order Build()
    {
        var order = Order.CreateNew(_customerId);
        foreach (var item in _items)
        {
            order.AddItem(item.ProductId, item.UnitPrice, item.Quantity);
        }
        return order;
    }
}
```

---

## 踩坑與避坑指南

### 1. 區分 DI 容器工廠與業務 Domain Factory
- **DI 容器工廠（如 `Func<TService>`、`IServiceScopeFactory`）**：責任在於管理**服務的依賴注入與生命週期（Singleton / Scoped）**。
- **Domain Factory**：責任在於管理**實體資料（Data & Business State）的合法性組裝**，完全不屬於 DI 容器範疇。

### 2. Builder 模式中必須在 Build() 進行終端驗證
- 若使用 Builder 模式，切勿在每個 `With*` 方法中單獨執行完整校驗（因為中間步驟本來就是不完整的）。
- **鐵律**：所有複合約束驗證（如「有折扣碼時必須存在會員等級」）必須且只能在 **`Build()` 的最後一刻**統一執行。

---

## 線上排查指令

### 1. 檢測領域工廠校驗失敗異常頻率

```bash
# 即時過濾日誌中領域建立驗證失敗事件
kubectl logs -l app=ecommerce-api --tail=1000 | grep "DomainValidationException"
```

### 2. 檢測短命物件記憶體分配速率

使用 `dotnet-counters` 觀察物件頻繁建立造成的 GC 分配壓力：
```bash
dotnet-counters monitor -p $(pgrep -f "Ecommerce.Api.dll") \
  --counters System.Runtime
```
重點關注 `alloc-rate`（每秒分配記憶體量）與 `gen-0-gc-count`。

### 3. Prometheus / Grafana 監控指標

```text
# 訂單建立失敗（業務校驗被阻擋）計數器
rate(order_creation_validation_failures_total[1m])

# 訂單成功建立速率（QPS）
rate(orders_created_total[1m])
```
