---
title: "上億筆資料的查詢：索引、投影與游標"
description: "從查詢需要的資料量出發，設計複合索引、穩定排序與 keyset pagination。"
articleId: "data-access-large-table-queries"
topic: "data-access"
category: "database-scale"
order: 16
tags:
  - "MySQL"
  - "PostgreSQL"
  - "上億筆"
  - "複合索引"
  - "Keyset Pagination"
  - "EXPLAIN"
difficulty: "advanced"
prerequisites:
  - "data-access-sql-foundations"
  - "data-access-csharp-connections"
relatedArticles:
  - "data-access-bulk-retention"
  - "data-access-partitioning-sharding"
  - "data-access-load-validation"
applicableVersions: "以 .NET 10、MySQL 8.4（InnoDB）、PostgreSQL 18 說明；driver／EF provider 的主版相容性須各自核對。"
lastReviewed: "2026-10-10"
takeaway: "從查詢需要的資料量出發，設計複合索引、穩定排序與 keyset pagination。"
sources:
  - title: "EF Core：有效率的查詢"
    url: "https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying"
  - title: "PostgreSQL 18：複合索引"
    url: "https://www.postgresql.org/docs/18/indexes-multicolumn.html"
  - title: "MySQL 8.4：複合索引"
    url: "https://dev.mysql.com/doc/refman/8.4/en/multiple-column-indexes.html"
  - title: "PostgreSQL 18：EXPLAIN"
    url: "https://www.postgresql.org/docs/18/using-explain.html"
  - title: "MySQL 8.4：EXPLAIN"
    url: "https://dev.mysql.com/doc/refman/8.4/en/explain.html"
---

## 案發現場

當電商平台的訂單表、物流紀錄或使用者活動日誌累積跨過數千萬列、直奔一億列大關時，過去在小型系統行之有效的分頁與查詢寫法，會瞬間演變成資料庫的毀滅性災難。

最經典的案發現場是**深分頁（Deep Paging）導致的資料庫 I/O 崩潰**：
在後台管理系統或對外 API 中，前端發送了第 1,000 頁的查詢請求：
```sql
SELECT * FROM orders 
WHERE merchant_id = 8888 
ORDER BY created_at DESC 
LIMIT 20 OFFSET 20000;
```
這條看似普通的 SQL，在單表 1 億列時執行了整整 35 秒！
更致命的是連鎖反應：為了取出這 20 筆資料，資料庫引擎必須掃描 20,020 筆索引並**回表讀取 20,020 筆實體資料列**，隨後將前 20,000 筆全部丟棄。這一過程產生了龐大的隨機磁碟 I/O，並將 InnoDB Buffer Pool 或 PostgreSQL Shared Buffers 中的常駐熱點記憶體頁全部擠出淘汰（Buffer Pool Pollution），導致整個資料庫的所有其他正常 API 查詢延遲集體飆高數十倍。

---

## 反模式與正確解法

### 反模式一：在超大資料表使用 OFFSET 進行分頁

`LIMIT M OFFSET N` 的時間複雜度是 $O(N + M)$。當 $N$（位移量）越大，資料庫做白工的成本呈線性暴增。

### 正確解法一：尋標器分頁（Keyset / Cursor-based Pagination）

在海量資料下，分頁必須改用 **Keyset Pagination**（基於上一頁最後一筆記錄的排序錨點）：
$$O(1) \text{ 恆定時間複雜度}$$

利用複合索引 `(merchant_id, created_at, id)`，查詢直接藉由 B+Tree 索引跳轉至定位點，完全無需掃描先前的無用資料：

```csharp
// 正確解法：生產級 Keyset Pagination 查詢實作
public class KeysetQueryService
{
    private readonly AppDbContext _db;

    public KeysetQueryService(AppDbContext db)
    {
        _db = db;
    }

    public async Task<List<OrderDto>> GetOrdersPageAsync(
        long merchantId, 
        DateTimeOffset? cursorCreatedAt, 
        long? cursorId, 
        int pageSize, 
        CancellationToken ct)
    {
        // 建立基礎查詢（使用 AsNoTracking 避免 ChangeTracker 負擔）
        var query = _db.Orders
            .AsNoTracking()
            .Where(o => o.MerchantId == merchantId);

        // 若帶有游標（上一頁最後一筆記錄的時間與 ID），直接透過 Tuple 條件精準尋標
        if (cursorCreatedAt.HasValue && cursorId.HasValue)
        {
            query = query.Where(o => 
                o.CreatedAt < cursorCreatedAt.Value || 
                (o.CreatedAt == cursorCreatedAt.Value && o.Id < cursorId.Value));
        }

        return await query
            .OrderByDescending(o => o.CreatedAt)
            .ThenByDescending(o => o.Id) // 必須加上唯一鍵確保排序絕對穩定
            .Take(pageSize)
            .Select(o => new OrderDto(o.Id, o.CreatedAt, o.TotalAmount, o.Status))
            .ToListAsync(ct);
    }
}
```

---

### 反模式二：`SELECT *` 破壞覆蓋索引，引發巨量回表

若複合索引建在 `(merchant_id, status, created_at)` 上，但查詢撰寫 `SELECT *`，資料庫即使透過索引過濾出 5,000 筆符號記錄，仍必須跳回主鍵叢集索引進行 5,000 次隨機 I/O 抓取剩餘欄位（如備註、收件地址等文字欄位）。

### 正確解法二：覆蓋索引與延遲關聯（Deferred Join）

1. **嚴格投影（Covering Index）**：僅查詢索引覆蓋的欄位，達成 100% Index-Only Scan（零回表）。
2. **延遲關聯（Deferred Join）**：若業務必須回傳完整欄位，先用索引以最快速度分頁出 ID，再與主表進行一次 Primary Key Join：

```sql
-- 正確解法：延遲關聯（Deferred Join）
SELECT o.*
FROM (
    -- 子查詢：100% 命中覆蓋索引，極速過濾並取出目標 ID
    SELECT id 
    FROM orders 
    WHERE merchant_id = 8888 
    ORDER BY created_at DESC 
    LIMIT 20 OFFSET 20000
) AS lim
JOIN orders o ON o.id = lim.id;
```
透過延遲關聯，回表次數從 20,020 次驟降至僅僅 **20 次**，查詢效能通常提升 10 到 50 倍！

---

## 踩坑與避坑指南

### 1. Keyset Pagination 遭遇 NULL 值的排序語意陷阱
- **避坑點**：若排序欄位（如 `shipped_at`）允許為 `NULL`，在 SQL 標準中 `NULL` 與其他數值比大小（`<` 或 `>`）會評估為 `UNKNOWN`，導致游標尋標完全找不到記錄。
- **鐵律**：作為 Keyset 游標錨點的欄位，**必須宣告為 `NOT NULL`**。若是狀態欄位，應以明確的預設時間戳或專用順序流水號代替。

### 2. 複合索引最左前綴（Leftmost Prefix）與等值／範圍順序原則
- **黃金順序規則**：`[等值過濾欄位] ➔ [排序欄位] ➔ [範圍過濾欄位] ➔ [投影欄位（INCLUDE）]`。
- **反例**：索引建為 `(merchant_id, total_amount, created_at)`，若 SQL 為 `WHERE merchant_id = 1 AND total_amount > 100 ORDER BY created_at`，由於 `total_amount` 是範圍比對，後面的 `created_at` **無法利用索引消除排序**，資料庫將被迫在記憶體或磁碟中執行 `Using filesort`。

### 3. 海量歷史查詢的架構分流（冷熱分離）
- 單表達到一億列時，不應無限制讓管理員任意進行「多條件模糊搜尋 + 歷史全量統計」。
- **架構準則**：OLTP 關聯式資料庫只服務近 3~6 個月的熱點交易資料；超過半年的冷歷史資料應透過 CDC（Debezium / Kafka）同步至 **ClickHouse** 或 **Elasticsearch**，徹底釋放主庫的查詢壓力。

---

## 線上排查指令

### 1. 解讀 EXPLAIN ANALYZE 執行計畫核心指標

```sql
-- PostgreSQL 執行計畫分析
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, created_at, total_amount
FROM orders
WHERE merchant_id = 8888
ORDER BY created_at DESC, id DESC
LIMIT 20;
```
**關鍵排查指標：**
- `Index Only Scan`：最高效，完全無需回表。
- `Index Scan`：命中索引但有回表。檢查 `Buffers: shared hit` 與 `read`（read 代表打到實體磁碟）。
- 若出現 `Seq Scan` 或 `Sort Method: external merge Disk`，代表索引失效或記憶體排序不足，必須立刻優化。

```sql
-- MySQL 執行計畫分析
EXPLAIN FORMAT=TREE
SELECT id, created_at, total_amount
FROM orders
WHERE merchant_id = 8888
ORDER BY created_at DESC, id DESC
LIMIT 20;
```
檢查是否出現 `Using filesort` 或 `Using temporary`。

### 2. 查找資料庫目前消耗最高 I/O 的巨型查詢

```sql
-- PostgreSQL 查詢累積讀取磁碟最多的慢查詢
SELECT query, calls, total_exec_time, mean_exec_time, shared_blks_read
FROM pg_stat_statements
ORDER BY shared_blks_read DESC
LIMIT 5;
```

### 3. Prometheus / Grafana 監控指標

```text
# 磁碟讀取 IOPS 飆高告警（表示 Buffer Pool 未命中，正大量穿透至磁碟）
rate(node_disk_reads_completed_total[1m]) > 2000

# 慢查詢次數增加率
rate(mysql_global_status_slow_queries[5m]) > 1
```
