---
title: "Redis 快取一致性與擊穿防禦"
description: "精煉解析電商高流量下的 Cache-Aside 模式、併發競態、防擊穿（SingleFlight）與生產排查重點。"
articleId: "redis-cache-aside"
topic: "redis"
category: "redis-caching"
order: 4
tags: ["Redis", "快取", "Cache-Aside", "快取擊穿", "一致性", "SingleFlight", "電商後端"]
articleType: "deep-dive"
prerequisites: ["redis-dotnet-integration", "data-access-transactions"]
relatedArticles: ["redis-concurrency", "architecture-outbox-inbox", "engineering-cache-messaging-tests"]
applicableVersions: "Redis 7.2+ / 8.0+、StackExchange.Redis 2.8+ / 3.x、.NET 8+ / .NET 10"
verifiedWith: "Linux 環境 Redis 8.2 / PostgreSQL 18.6 實測"
lastReviewed: "2026-10-09"
takeaway: "先更新資料庫再刪除快取是基本原則；防範擊穿必須仰賴進程內互斥鎖（SingleFlight）收斂回源，搭配 TTL 隨機抖動預防雪崩。"
sources:
  - title: "Microsoft Learn：Cache-Aside Pattern"
    url: "https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside"
  - title: "Redis Documentation：Key Eviction and Memory Optimization"
    url: "https://redis.io/docs/latest/develop/reference/eviction/"
---

## 問題情境

在大促秒殺等高讀寫比場景中，熱門商品查詢 QPS 可達數萬。一旦快取過期，大量請求同時未命中並湧入資料庫，會瞬間耗盡連線池造成服務雪崩（快取擊穿）。此外，若變更價格時操作順序不當，並行讀寫交錯會使舊值覆蓋新值，導致快取永久不一致。

## 運作機制

Cache-Aside（旁路快取）由應用端協調讀寫：**讀取按需回填，更新時先改 DB 再刪 Cache**。

讀取先查 Redis，未命中才查詢資料庫並以 TTL 寫回 Redis。若 Redis 逾時則降級讀取資料庫，確保業務不中斷：

~~~csharp title="CachedProducts.cs"
Interlocked.Increment(ref databaseReads);
Product? current = await store.GetProductAsync(id, token);
if (current is null) return null;
if (!unavailable)
{
    try
    {
        await cache.StringSetAsync(Key(id), JsonSerializer.Serialize(current, JsonDefaults.Options), lifetime).WaitAsync(token);
    }
    catch (RedisException)
    {
        unavailable = true;
        Diagnostics.CacheErrors.Add(1);
    }
}
return new ProductRead(current, unavailable ? "database-fallback" : "database");
~~~

**為何先改 DB 再刪 Cache？**  
若先刪 Cache，在 DB 尚未提交前，並行讀取會將舊資料回填 Redis 造成永久髒讀。因此必須**先確保 DB 交易提交，再刪除快取 Key**。

## 反模式

### 1. 先刪快取再改 DB（永久髒讀）
```csharp
// 正確：DB 提交成功後才刪除快取
bool updated = await store.UpdatePriceAsync(id, newPrice, ct);
if (updated)
{
    try { await cache.KeyDeleteAsync($"product:{id}").WaitAsync(ct); }
    catch (RedisException ex) { logger.LogWarning(ex, "快取清除失敗，依賴 TTL 失效"); }
}
```

### 2. 無防護回源（快取擊穿）
未命中時所有請求直衝 DB。應使用本機非同步鎖（`SemaphoreSlim`）實作 SingleFlight 並進行雙重檢查：
```csharp
// 正確：單實例內同 Key 僅單一請求回源
var semaphore = locks.GetOrAdd(id, _ => new SemaphoreSlim(1, 1));
await semaphore.WaitAsync(ct);
try
{
    var cached = await cache.StringGetAsync(key).WaitAsync(ct);
    if (cached.HasValue) return Deserialize(cached!);

    var data = await store.GetProductAsync(id, ct);
    if (data != null)
    {
        await cache.StringSetAsync(key, Serialize(data), GetJitteredTtl(TimeSpan.FromMinutes(10))).WaitAsync(ct);
    }
    return data;
}
finally { semaphore.Release(); }
```

### 3. 固定 TTL（快取雪崩）
批次預熱若設相同 TTL 會同時過期。應加入 ±10% 隨機擾動（Jitter）：
```csharp
public static TimeSpan GetJitteredTtl(TimeSpan baseTtl) =>
    TimeSpan.FromSeconds(baseTtl.TotalSeconds * (0.9 + Random.Shared.NextDouble() * 0.2));
```

## 邊界與故障情境

* **快取穿透（無效 ID 惡意刷量）**：DB 查無資料時寫入空值標記（短 TTL 30 秒）或前置布隆過濾器。
* **快取雪崩（大面積過期）**：TTL Jitter 打散過期點，並以信號量限制回源 DB 的並行上限（Bulkhead 隔離）。
* **刪除快取失敗**：透過 Transactional Outbox 或 CDC（Debezium 監聽 WAL）非同步重試刪除快取，確保最終一致。

## 觀測與排查

* **第一線排查指令**：
  * `redis-cli --latency`：檢測即時延遲。
  * `redis-cli slowlog get 10`：排查慢指令（大 Key 操作或 KEYS）。
  * `redis-cli --bigkeys`：找出佔用過大記憶體的 Key。
  * `redis-cli info stats`：監控每秒操作數與命中率。
* **關鍵監控指標**：命中率（< 85% 告警）、p99 延遲（> 20ms 告警）、回源 DB 次數（激增超過基準 3 倍告警）。

## 決策清單

* **適用情境**：高讀寫比、容許秒級最終一致性（商品展示、分類目錄）。
* **不適用情境**：強一致性扣款與防超賣（須直連 DB 行鎖）、高頻寫入（命中率趨近零）。
