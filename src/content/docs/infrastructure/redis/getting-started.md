---
title: "Redis 與分散式快取入門"
description: "從重複讀取的成本理解 Redis，分清本機快取、共享快取與權威資料。"
articleId: "redis-getting-started"
topic: "redis"
category: "redis-basics"
order: 1
tags:
  - "Redis"
  - "分散式快取"
  - "IMemoryCache"
  - "cache hit"
  - "cache miss"
  - "延遲"
difficulty: "beginner"
prerequisites:
  - "csharp-collections-linq"
relatedArticles:
  - "redis-data-types-ttl"
  - "redis-cache-aside"
  - "architecture-communication-boundaries"
applicableVersions: "Redis 8.x／StackExchange.Redis 3.x／.NET 10。"
lastReviewed: "2026-10-10"
takeaway: "快取是可重建的資料副本；導入 Redis 前，先決定哪些舊值可以接受，以及故障時如何讀取。"
sources:
  - title: "Redis：資料型別"
    url: "https://redis.io/docs/latest/develop/data-types/"
  - title: "Microsoft Learn：分散式快取"
    url: "https://learn.microsoft.com/en-us/aspnet/core/performance/caching/distributed?view=aspnetcore-10.0"
  - title: "Microsoft Learn：Cache-Aside"
    url: "https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside"
---

## 案發現場

在電商平台的日常維運中，資料庫永遠是最昂貴且最難以水平擴展的硬體資源。

最典型的效能災難發生在「首頁熱門商品」與「分類清單」等高頻讀取介面：
在未導入快取前，每次使用者開啟 App，後端都必須執行一次複雜的關聯查詢（JOIN 商品表、分類表、圖片表、促銷價格表），平均查詢耗時 25ms。當促銷活動湧入 3,000 QPS 時，資料庫每秒必須重複計算這 3,000 次完全一模一樣的 SQL，CPU 瞬間飆滿至 100%，所有正常的寫入與結帳請求被無差別拖垮。

為了解決這個問題，工程師在 ASP.NET Core 中注入了 `IMemoryCache`：
```csharp
// 致命反模式：在多 Pod 環境下單純依賴本機記憶體快取
public async Task<ProductDto?> GetProductAsync(long id)
{
    return await _memoryCache.GetOrCreateAsync($"product:{id}", async entry =>
    {
        entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(10);
        return await _db.Products.FindAsync(id);
    });
}
```
上線後，資料庫 CPU 確實下降了，但全新的客訴與資料不一致問題隨之爆發：
在 Kubernetes 叢集中，應用程式水平擴展了 20 個 Pod。每個 Pod 的記憶體各自獨立，導致：
1. **多副本資料狀態衝突**：當後台管理員將商品價格從 100 元改成 120 元時，管理員只更新了資料庫。使用者刷新頁面時，若請求打到 Pod A 看到 100 元，打到 Pod B 看到 120 元，下單時又跳回 100 元，引發嚴重的價格糾紛！
2. **冷啟動穿透（Cold Start）**：每次發布新版本或 HPA 擴容出新 Pod 時，新 Pod 的本機記憶體完全為空，瞬間大量請求直接穿透至資料庫，引發二次崩潰。

---

## 反模式與正確解法

### 1. 本機快取 vs 分散式快取 vs 權威資料

| 維度 | 本機記憶體快取 (IMemoryCache) | 分散式快取 (Redis) | 權威資料庫 (PostgreSQL / MySQL) |
| :--- | :--- | :--- | :--- |
| **存放位置** | 單一 Pod 行程記憶體內 | 獨立網路節點（In-Memory） | 實體伺服器 / 磁碟持久化 |
| **讀取延遲** | 極致微秒級（$< 1\mu\text{s}$） | 極速毫秒級（$0.5 \sim 2\text{ms}$） | 磁碟與計算（$5 \sim 50\text{ms}$） |
| **多 Pod 一致性** | **無（各 Pod 彼此隔離孤立）** | **高（全叢集共享單一狀態）** | **最高（ACID 保證）** |
| **資料角色** | 極短命防抖動 | 可隨時重建的加速副本 | **不可遺失的唯一事實來源** |

---

### 反模式一：把 Redis 當作唯一的權威儲存（當作資料庫用）

將使用者購物車或待結帳訂單**只寫入 Redis**，未同步持久化至資料庫。
一旦 Redis 伺服器遭遇斷電、記憶體滿載淘汰（Eviction）或容錯切換（Failover），使用者購物車資料永久蒸發，造成無法挽回的商業損失。

### 正確解法一：快取身分定位與 Cache-Aside（旁路快取）架構

**快取永遠是「可以被隨時清空、且能隨時從權威資料庫重新計算產生」的臨時副本！**
標準的 Cache-Aside 流程：
1. **讀取**：先查 Redis。命中（Hit）立即返回；未命中（Miss）從資料庫讀取，並異步寫回 Redis 後返回。
2. **寫入**：先更新資料庫（權威寫入），成功後**主動刪除（Evict/Invalidate）** Redis 快取，強制下一次讀取回源：

```csharp
// 正確解法：標準 Cache-Aside 旁路讀取實作
public class ProductService
{
    private readonly IDatabase _redis;
    private readonly AppDbContext _db;
    private readonly ILogger<ProductService> _logger;

    public ProductService(IConnectionMultiplexer multiplexer, AppDbContext db, ILogger<ProductService> logger)
    {
        _redis = multiplexer.GetDatabase();
        _db = db;
        _logger = logger;
    }

    public async Task<ProductDto?> GetProductAsync(long id, CancellationToken ct)
    {
        var cacheKey = $"ecommerce:product:{id}";

        // 1. 嘗試從 Redis 讀取
        var cachedJson = await _redis.StringGetAsync(cacheKey);
        if (cachedJson.HasValue)
        {
            return JsonSerializer.Deserialize<ProductDto>(cachedJson.ToString());
        }

        // 2. Cache Miss：從權威資料庫讀取
        var product = await _db.Products
            .AsNoTracking()
            .Where(p => p.Id == id)
            .Select(p => new ProductDto(p.Id, p.Name, p.Price))
            .FirstOrDefaultAsync(ct);

        if (product is not null)
        {
            // 3. 回填 Redis 並設定有限 TTL（例如 10 分鐘）
            var serialized = JsonSerializer.Serialize(product);
            await _redis.StringSetAsync(cacheKey, serialized, TimeSpan.FromMinutes(10));
        }

        return product;
    }

    public async Task UpdatePriceAsync(long id, decimal newPrice, CancellationToken ct)
    {
        // 1. 先更新權威資料庫
        await _db.Products
            .Where(p => p.Id == id)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.Price, newPrice), ct);

        // 2. 主動刪除快取（淘汰舊值）
        var cacheKey = $"ecommerce:product:{id}";
        await _redis.KeyDeleteAsync(cacheKey);
    }
}
```

---

### 反模式二：無差別快取所有資料

將即時庫存剩餘數量（例如庫存只剩 1 件）、帳戶餘額等對一致性要求為 100% 硬實時的欄位快取進 Redis。一旦快取失效時間存在秒級延遲，就會引發商品超賣或超額提款。

### 正確解法二：依一致性敏感度分流快取策略

- **強烈推薦快取**：靜態商品文案、商品類別樹、品牌清單、使用者公開個人檔案、促銷規則（讀多寫少，可接受數秒的弱一致性）。
- **嚴格禁止純快取讀取**：扣款前的即時餘額檢驗、秒殺扣庫存的防超賣驗證（必須走資料庫行鎖或 Redis 原子 Lua 扣減）。

---

## 踩坑與避坑指南

### 1. 序列化（Serialization）格式與 CPU / 網路頻寬權衡
- **System.Text.Json**：通用性最好，但大物件產生的 JSON 字串體積較大，頻繁讀寫會佔用 Redis 頻寬。
- **MessagePack / Protobuf**：二進位壓縮格式，體積通常僅為 JSON 的 30%~50%，反序列化速度提升 2~3 倍，在高 QPS 核心場景優先推薦。

### 2. 快取的冷熱資料污染（Cache Pollution）
- 若將長尾商品（數年才有人看一次的冷門冷資料）以長時間 TTL 快取，會佔用大量 Redis 記憶體，進而將真正的秒殺熱點商品擠出（Eviction）。
- **規則**：為冷門資料配置短 TTL（如 1~3 分鐘），或依據存取熱度分級快取。

---

## 線上排查指令

### 1. 查詢 Redis 伺服器狀態與當前命中率

使用 `redis-cli` 即時檢驗核心狀態：
```bash
redis-cli INFO stats
```
重點關注：
- `keyspace_hits`：快取命中總次數。
- `keyspace_misses`：快取未命中總次數。
- **即時命中率計算公式**：
  $$\text{Hit Rate} = \frac{\text{keyspace\_hits}}{\text{keyspace\_hits} + \text{keyspace\_misses}} \times 100\%$$
若命中率低於 85%，代表快取鍵設計不良或 TTL 設定過短。

### 2. 檢測目前資料庫內儲存的 Key 總數與記憶體佔用

```bash
redis-cli DBSIZE
redis-cli INFO memory
```
檢查 `used_memory_human` 是否逼近 `maxmemory` 警戒線。

### 3. Prometheus / Grafana 監控指標

```text
# Redis 快取命中率（每分鐘即時監控，低於 0.85 觸發告警）
sum(rate(redis_keyspace_hits_total[1m])) 
/ 
(sum(rate(redis_keyspace_hits_total[1m])) + sum(rate(redis_keyspace_misses_total[1m]))) < 0.85

# Redis 每秒執行指令數（Ops/sec）
rate(redis_commands_processed_total[1m])
```
