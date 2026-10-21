---
title: "DDD 模型與分層責任"
description: "用 Entity、Value Object 與 Aggregate 保護商業規則，分清 Domain、Application、Infrastructure 與 API。"
articleId: "architecture-domain-modeling"
topic: "architecture"
category: "domain-design"
order: 1
tags:
  - "DDD"
  - "Entity"
  - "Value Object"
  - "Aggregate Root"
  - "Domain"
  - "Application"
  - "Infrastructure"
  - "Web API"
  - "不變量"
difficulty: "advanced"
prerequisites:
  - "csharp-syntax-traps"
relatedArticles:
  - "architecture-application-patterns"
  - "engineering-business-tests"
  - "data-access-ef-core"
applicableVersions: "以 .NET 10 生態系與本文列出的官方文件核對；套件及資料庫供應商的差異見內文。"
lastReviewed: "2026-10-10"
takeaway: "先找需要保持一致的商業規則，再決定模型與邊界；資料表不會自動等於 Aggregate。"
sources:
  - title: "Microsoft Learn：DDD 導向服務"
    url: "https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/ddd-oriented-microservice"
  - title: "Microsoft Learn：領域模型驗證"
    url: "https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/domain-model-layer-validations"
---

## 案發現場

在維護一個運行兩年的電商系統時，團隊經常遇到以下詭異的業務 Bug：
- 客服發現某筆訂單的 `TotalAmount` 是 500 元，但明細中的商品加總卻是 800 元。
- 物流系統收到了「已出貨」通知，但財務系統卻顯示該訂單「尚未付款」。
- 開發者在 Controller 中隨意寫下：
  ```csharp
  order.Status = "Shipped"; // 繞過了所有業務校驗！
  ```

查看代碼時，發現領域模型完全是由純資料屬性構成的**貧血模型（Anemic Domain Model）**：
所有的屬性都是 `public { get; set; }`，所有集合都是 `List<T>`。所有的商業邏輯與校驗規則，散落在 Controller、十幾個不同的 Service 類別、甚至是前端 JavaScript 中。

任何工程師只要拿到這個 `Order` 實體，都能在任何地方任意竄改其內部狀態，而沒有任何地方保證**業務不變量（Business Invariants）**的完整性。

更嚴重的另一種極端是**超大聚合（God Aggregate）**：
工程師把 `Customer` 設計成聚合根，底下掛了該客戶的所有歷史訂單、所有購物車商品、所有收件地址。當使用者只是想更新手機號碼時，EF Core 將幾千筆歷史訂單全部載入記憶體，引發嚴重的記憶體暴增與樂觀鎖衝突。

---

## 反模式與正確解法

### 1. DDD 核心概念對照

| 概念 | 核心定義 | 特性與規範 |
| :--- | :--- | :--- |
| **Entity（實體）** | 擁有唯一識別碼（Identity），貫穿其生命週期。 | 狀態會隨時間改變，但身分唯一（例如：`Order`, `User`）。 |
| **Value Object（值物件）** | 沒有唯一識別碼，依據屬性值決定相等性。 | **完全不可變（Immutable）**，可自由替換（例如：`Money`, `Address`）。 |
| **Aggregate Root（聚合根）** | 一組高度相關實體的唯一外部訪問入口。 | **守護不變量的邊界**，外部物件只能引用聚合根的 ID，不可直接修改聚合內部實體。 |

---

### 反模式一：貧血模型與公有 Setter

```csharp
// 致命反模式：貧血模型，允許任何外部代碼任意竄改狀態與集合
public class Order
{
    public Guid Id { get; set; }
    public decimal TotalAmount { get; set; } // 可以被直接設成負數！
    public string Status { get; set; } // 可以被任意設為未知狀態
    public List<OrderItem> Items { get; set; } // 外部可隨意 Add，繞過總額計算！
}
```

### 正確解法一：富領域模型與業務不變量守護

將屬性設為私有變更（`private set`），只暴露表達業務意圖的方法（如 `Cancel()`、`AddItem()`），並透過 Value Object 封裝複合規則：

```csharp
// 正確解法：使用 C# 14 record 宣告不可變值物件（Value Object）
public readonly record struct Money
{
    public decimal Amount { get; }
    public string Currency { get; }

    public Money(decimal amount, string currency = "TWD")
    {
        if (amount < 0)
            throw new ArgumentException("金額不可為負數", nameof(amount));

        Amount = amount;
        Currency = string.IsNullOrWhiteSpace(currency) ? "TWD" : currency;
    }

    public static Money Zero => new(0);

    public static Money operator +(Money a, Money b)
    {
        if (a.Currency != b.Currency)
            throw new InvalidOperationException($"無法跨幣別相加: {a.Currency} vs {b.Currency}");
        return new Money(a.Amount + b.Amount, a.Currency);
    }
}

// 富領域聚合根（Aggregate Root）：統一守護業務不變量
public class Order
{
    public Guid Id { get; private set; }
    public OrderStatus Status { get; private set; }
    private readonly List<OrderItem> _items = new();
    public IReadOnlyCollection<OrderItem> Items => _items.AsReadOnly();

    public Money TotalAmount => _items.Aggregate(Money.Zero, (acc, item) => acc + item.Subtotal);

    private Order() { } // EF Core 反射建構子

    public Order(Guid id)
    {
        Id = id;
        Status = OrderStatus.PendingPayment;
    }

    public void AddItem(Guid productId, Money unitPrice, int quantity)
    {
        if (Status != OrderStatus.PendingPayment)
            throw new InvalidOperationException("僅待付款訂單允許修改明細");

        var existing = _items.FirstOrDefault(x => x.ProductId == productId);
        if (existing is not null)
        {
            existing.AddQuantity(quantity);
        }
        else
        {
            _items.Add(new OrderItem(productId, unitPrice, quantity));
        }
    }

    public void MarkAsPaid()
    {
        if (Status != OrderStatus.PendingPayment)
            throw new InvalidOperationException($"處於 {Status} 狀態的訂單無法執行付款");

        if (!_items.Any())
            throw new InvalidOperationException("無明細的空訂單無法付款");

        Status = OrderStatus.Paid;
    }
}
```

---

### 反模式二：超大聚合與跨聚合直接物件引用

將整個電商資料庫串成一棵巨大物件樹：`Customer` 直接包含 `Orders`，`Order` 直接包含 `Product` 物件。這會導致每次儲存訂單時，EF Core 不小心觸發了對商品表或顧客表的額外查詢與鎖定。

### 正確解法二：依賴 ID 關聯跨聚合邊界

**不同 Aggregate Root 之間，只允許保存對方的 ID（識別碼），絕不能直接持有物件引用實體！**
- `Order` 只持有 `CustomerId: Guid` 與 `ProductId: Guid`。
- 一致性邊界：單一交易內只允許修改一個聚合根；跨聚合的狀態變更透過**領域事件（Domain Events）**達成最終一致性。

---

## 踩坑與避坑指南

### 1. EF Core 映射私有集合（Backing Fields）
- **避坑點**：當實體中的 `Items` 暴露為 `IReadOnlyCollection<OrderItem>` 且底層私有欄位為 `_items` 時，若未正確配置，EF Core 可能無法在查詢時填入子明細。
- **配置技巧**：
  ```csharp
  builder.HasMany(o => o.Items)
      .WithOne()
      .HasForeignKey("OrderId");

  // 明確指定 backing field
  builder.Navigation(o => o.Items)
      .UsePropertyAccessMode(PropertyAccessMode.Field);
  ```

### 2. 領域邏輯中嚴禁注入 IRepository 或外部 I/O 服務
- 實體類別（Entity）不應注入任何依賴（如 `Order.Cancel(IEmailSender sender)`）。
- **原則**：實體應該只專注於純記憶體運算與業務狀態校驗；外部相依服務必須由 Application 層的 Use Case 協調傳入。

### 3. Aggregate 邊界劃分法則
- 如果兩個業務概念不需要在**同一個微秒的資料庫硬性交易（ACID）**內保持絕對一致，它們就**不屬於同一個 Aggregate**！分拆成兩個小聚合，能大幅降低並行鎖競爭。

---

## 線上排查指令

### 1. 檢測資料庫中的不變量違規資料（資料修復 SQL）

```sql
-- 稽核是否存在總額與明細加總不一致的髒資料
SELECT o.id, o.total_amount, COALESCE(SUM(oi.price * oi.quantity), 0) AS calculated_total
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.id, o.total_amount
HAVING o.total_amount != COALESCE(SUM(oi.price * oi.quantity), 0);

-- 稽核未付款卻直接出貨的狀態異常
SELECT id, status, payment_id
FROM orders
WHERE status = 'Shipped' AND payment_id IS NULL;
```

### 2. 即時觀測單一請求載入實體的數量

使用 EF Core 記錄器檢測是否有聚合過大導致載入過多實體：
```bash
# 觀察 EF Core ChangeTracker 內部追蹤的實體數量
dotnet-dump analyze dump.bin
> dumpheap -type Ecommerce.Domain.Orders.OrderItem
```

### 3. Prometheus / Grafana 業務健康度指標

```text
# 領域不變量校驗失敗率（若激增代表前端與後端合約不一致或惡意注入）
rate(domain_invariant_violations_total[1m]) > 1

# 聚合根操作平均延遲
histogram_quantile(0.99, rate(aggregate_execution_seconds_bucket[5m]))
```
