---
title: "EF Core 樂觀並行與庫存競爭"
description: "從兩人修改商品理解版本比對、衝突結果，以及交易和並行控制的分工。"
articleId: "data-access-concurrency"
topic: "data-access"
category: "transactions"
order: 9
tags:
  - "EF Core 樂觀並行與庫存競爭"
  - "data-access"
difficulty: "intermediate"
learningDepth: "deep"
prerequisites:
  - "data-access-tracking"
  - "data-access-transactions"
relatedArticles:
  - "csharp-thread-safety"
  - "kubernetes-autoscaling"
applicableVersions: "以 C# 14／.NET 10 說明；框架與供應商差異見內文。"
verifiedWith: "已依官方文件核對概念；文中示意片段未宣稱完成外部服務整合或效能量測。"
lastReviewed: "2026-10-10"
takeaway: "從兩人修改商品理解版本比對、衝突結果，以及交易和並行控制的分工。"
sources:
  - title: "EF Core 並行控制"
    url: "https://learn.microsoft.com/en-us/ef/core/saving/concurrency"
  - title: "EF Core 交易"
    url: "https://learn.microsoft.com/en-us/ef/core/saving/transactions"
---

## 案發現場

在電商活動中，商品庫存扣減是併發衝突最激烈的業務場景。假設某限量商品庫存僅剩 1 件，買家 A 與買家 B 在同一毫秒內點擊結帳：

如果系統沒有並行防護，會發生經典的**丟失更新（Lost Update）**：
1. 買家 A 讀取商品，庫存為 1。
2. 買家 B 讀取商品，庫存也為 1。
3. 買家 A 扣減 1 件，將庫存 0 寫回資料庫。
4. 買家 B 扣減 1 件，將庫存 0 寫回資料庫。
結果：兩筆訂單同時成交，庫存卻只扣了 1，造成嚴重的**商品超賣**。

為了防止超賣，工程師在 EF Core 實體上加上了樂觀並行標記（`[Timestamp]` 或 `[ConcurrencyCheck]`）。然而在秒殺活動中，雖然超賣被擋下了，新的災難卻隨之爆發：
```text
Microsoft.EntityFrameworkCore.DbUpdateConcurrencyException: The database operation was expected to affect 1 row(s), but actually affected 0 row(s); 
data may have been modified or deleted since entities were loaded.
   at Microsoft.EntityFrameworkCore.Update.AffectedDataModificationCommandBatch.Consume(...)
```
在高達數百 QPS 的搶購下，95% 的請求同時噴出 `DbUpdateConcurrencyException`。若後端代碼無腦加入「捕捉例外並重新讀取庫存再重試」的迴圈，所有請求將不斷刷新並撞擊資料庫，形成嚴重的**活鎖（Livelock）**，最終導致資料庫 CPU 100%、全站癱瘓。

---

## 反模式與正確解法

### 反模式一：在高衝突熱點上盲目採用樂觀鎖無限重試

樂觀鎖（Optimistic Concurrency Control, OCC）的核心假設是：**衝突很少發生（Optimistic）**。當衝突罕見時，樂觀鎖無需任何資料庫鎖定，效能極高。
但在限量秒殺、熱門票券等**衝突極度頻繁（Pessimistic）**的場景下，若仍採用樂觀鎖 + 自動重試，每 100 個併發請求只有 1 個能成功，其餘 99 個請求會進入重試，重新查詢 DB、重新比對版本，使資料庫運算量呈幾何級數暴增。

### 正確解法一：原子條件扣減（Atomic Conditional Update）

對於庫存扣減等單純的數量競爭，**不需要載入實體至 ChangeTracker，也不需要依賴版本號比對**，直接利用資料庫行級鎖與原子條件更新：

```csharp
// 正確解法：利用原子條件更新，單一 SQL 搞定庫存扣減防超賣
public async Task<bool> DeductStockDirectlyAsync(
    long productId, 
    int quantity, 
    CancellationToken ct)
{
    // 利用 ExecuteUpdateAsync 直接發送原子 SQL：
    // UPDATE products 
    // SET stock = stock - @quantity 
    // WHERE id = @productId AND stock >= @quantity;
    var affectedRows = await _dbContext.Products
        .Where(p => p.Id == productId && p.Stock >= quantity)
        .ExecuteUpdateAsync(s => s.SetProperty(p => p.Stock, p => p.Stock - quantity), ct);

    // affectedRows == 1 代表扣減成功；affectedRows == 0 代表庫存不足或商品不存在
    return affectedRows == 1;
}
```
**優勢：**
1. 無需版本號比對，零 `DbUpdateConcurrencyException` 例外開銷。
2. 資料庫行級排隊：即使 1,000 個請求同時到達，InnoDB / Postgres 會對該列排隊執行，扣完為止，後續請求條件不符自動影響 0 列返回，絕不超賣。

---

### 反模式二：樂觀鎖衝突後直接拋錯，未提供業務處理解析

在後台管理系統（如商品編輯、價格修改）中，衝突罕見，適合使用 EF Core 樂觀鎖。但如果捕捉到衝突例外後只是單純拋錯，管理員輸入了半小時的商品文案就會直接丟失。

### 正確解法二：EF Core 樂觀並行與衝突解決策略（Store Wins vs Client Wins）

在 EF Core 中透過 Shadow Property 或實體屬性配置並行權杖（Concurrency Token），並在捕獲例外後取得資料庫現值（Database Values）進行智慧合併：

```csharp
// Entity 定義：使用 Version 作為樂觀鎖並行權杖
public class Product
{
    public long Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public decimal Price { get; set; }
    
    [ConcurrencyCheck]
    public int Version { get; set; }
}

// 業務處理：實作 Store Wins 或欄位級合併
public async Task<UpdateResult> UpdateProductWithConcurrencyAsync(
    Product modifiedProduct, 
    CancellationToken ct)
{
    _dbContext.Products.Update(modifiedProduct);
    modifiedProduct.Version++; // 版本號遞增

    try
    {
        await _dbContext.SaveChangesAsync(ct);
        return UpdateResult.Success();
    }
    catch (DbUpdateConcurrencyException ex)
    {
        var entry = ex.Entries.Single();
        var databaseValues = await entry.GetDatabaseValuesAsync(ct);

        if (databaseValues is null)
        {
            return UpdateResult.Failed("商品已被其他管理者刪除");
        }

        var dbProduct = (Product)databaseValues.ToObject();

        // 策略一：回報衝突並提供資料庫現值給前端對比（最推薦的人工作法）
        return UpdateResult.Conflict(
            currentDbValues: dbProduct, 
            message: $"商品已被其他使用者更新為版本 {dbProduct.Version}，請核對後重新提交。");
    }
}
```

---

## 踩坑與避坑指南

### 1. 各資料庫並行權杖（RowVersion）的底層實作差異
- **SQL Server**：原生支援 `rowversion` / `byte[]`，資料庫在每次更新時自動遞增 8-byte 二進位值。
- **PostgreSQL**：原生內建系統隱藏欄位 `xmin`（記錄修改該列的最後交易 ID）。在 EF Core 中可直接宣告：
  ```csharp
  modelBuilder.Entity<Product>().UseXminAsConcurrencyToken();
  ```
- **MySQL**：InnoDB 沒有隱藏的 rowversion。標準做法是在 Model 宣告 `int Version` 並在應用程式每次更新時主動遞增，或使用 `timestamp(6) on update current_timestamp(6)`。

### 2. EF Core 樂觀鎖檢測的底層 SQL 機制
- 當配置了並行權杖後，EF Core 在執行 `SaveChangesAsync()` 時產生的 SQL 會將原版本號加入 `WHERE` 條件：
  ```sql
  UPDATE Products SET Price = @p0, Version = @p1 
  WHERE Id = @p2 AND Version = @originalVersion;
  ```
- EF Core 會檢查 ADO.NET 回傳的**受影響列數（Rows Affected）**。若為 0，即判定發生衝突，立即丟出 `DbUpdateConcurrencyException`。

### 3. 熱點庫存的分桶（Stock Sharding）進階技術
- 若單一商品的搶購 QPS 達到 10,000+，即便使用原子條件更新，單一列的資料庫行鎖也會達到硬體極限。
- **進階解法**：將 100 件庫存分散在 10 個庫存桶（Bucket 0 ~ 9，每桶 10 件）。請求依據 `UserId % 10` 路由至特定桶位扣減，將行鎖競爭降低至原本的十分之一。

---

## 線上排查指令

### 1. 即時監控資料庫受影響列數為 0 的異常更新

```sql
-- PostgreSQL: 檢視近期的更新衝突與回滾
SELECT datname, xact_commit, xact_rollback
FROM pg_stat_database
WHERE datname = current_database();
```

### 2. 檢測商品庫存負數（超賣稽核 SQL）

在任何高併發促銷結束後，第一時間執行超賣對帳腳本：
```sql
-- 稽核是否存在庫存小於 0 的嚴重災難
SELECT id, name, stock
FROM products
WHERE stock < 0;

-- 稽核實際訂單銷售總數與商品庫存變更是否一致
SELECT 
    p.id, 
    p.name, 
    p.initial_stock, 
    p.stock AS current_stock,
    COALESCE(SUM(oi.quantity), 0) AS total_sold
FROM products p
LEFT JOIN order_items oi ON oi.product_id = p.id
GROUP BY p.id, p.name, p.initial_stock, p.stock
HAVING (p.initial_stock - p.stock) != COALESCE(SUM(oi.quantity), 0);
```

### 3. Prometheus / Grafana 監控指標

```text
# 應用端樂觀鎖衝突率（每秒衝突大於 5 次發出警告）
rate(efcore_concurrency_exceptions_total[1m]) > 5

# 資料庫交易回滾比率告警
(rate(pg_stat_database_xact_rollback[1m]) / 
 (rate(pg_stat_database_xact_commit[1m]) + rate(pg_stat_database_xact_rollback[1m]))) > 0.05
```
