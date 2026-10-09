---
title: "Redis 快取一致性與擊穿防禦"
description: "直擊電商高流量下的快取永久髒讀、熱點擊穿事故，提供時序解析、SingleFlight 實作與救火排查指令。"
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
lastReviewed: "2026-10-10"
takeaway: "先更 DB 再刪 Cache 是防髒讀底線；高併發防擊穿必用進程內互斥鎖（SingleFlight）收斂回源，搭配 TTL Jitter 預防雪崩。"
sources:
  - title: "Microsoft Learn：Cache-Aside Pattern"
    url: "https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside"
  - title: "Redis Documentation：Key Eviction and Memory Optimization"
    url: "https://redis.io/docs/latest/develop/reference/eviction/"
---

## 案發現場

在大促活動開跑時，後台明明已經將熱門商品改為特惠價 80 元，為什麼前台使用者重整多次依然顯示 100 元舊價格？更致命的是，當快取在秒殺瞬間到期時，為什麼大量查詢會同時灌入資料庫，瞬間擠爆連線池造成全站雪崩？

這正是快取雙寫時序錯亂引發的「永久髒讀」，以及無防護回源造成的「快取擊穿（Dog-piling）」。

## 致命反模式 vs. 正確解法

### 坑一：先刪快取再改 DB（永久髒讀陷阱）

許多人直覺「先清舊快取再去改資料庫比較乾淨」，但並行交錯時序會引發災難：

```text
時間軸 ────────────────────────────────────────────────────────►
Thread 1 (改價格 80元) : 刪除快取 ──────────────────────► 更新 DB (提交 80 元)
Thread 2 (查商品)      :         未命中 ──► 讀 DB (100元) ──► 回填快取 (💣 100元永久卡死！)
```

```csharp
// 💣 Bad：先刪快取再改 DB，讀寫並行時舊值會被回填卡死
await cache.KeyDeleteAsync($"product:{id}");
await store.UpdatePriceAsync(id, newPrice, ct);

// ✅ Good：資料庫成功提交後，才使快取失效
bool updated = await store.UpdatePriceAsync(id, newPrice, ct);
if (updated)
{
    try 
    { 
        await cache.KeyDeleteAsync($"product:{id}").WaitAsync(ct); 
    }
    catch (RedisException ex) 
    { 
        logger.LogWarning(ex, "快取清除失敗，依賴 TTL 自然失效"); 
    }
}
```

### 坑二：未命中無防護直衝 DB（快取擊穿事故）

當熱點 Key 到期的毫秒瞬間，若 5,000 個請求同時 Cache Miss，不可直接放任 5,000 個查詢湧向資料庫。

首先，標準 Cache-Aside 回源應具備基礎降級彈性，確保 Redis 異常時不中斷業務：

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

更進一步，面對極高頻熱點，應在單機進程內使用 `SemaphoreSlim` 實作 SingleFlight 機制，並進行「雙重檢查（Double-Checked Locking）」，讓同一個 Key 永遠只有一個請求代表回源：

```csharp
// ✅ Good：單實例內同 Key 僅單一請求回源，其餘等待並複用結果
var semaphore = locks.GetOrAdd(id, _ => new SemaphoreSlim(1, 1));
await semaphore.WaitAsync(ct);
try
{
    var cached = await cache.StringGetAsync(key).WaitAsync(ct);
    if (cached.HasValue) return Deserialize(cached!); // 雙重檢查：前一個請求可能已填補

    var data = await store.GetProductAsync(id, ct);
    if (data != null)
    {
        await cache.StringSetAsync(key, Serialize(data), GetJitteredTtl(TimeSpan.FromMinutes(10))).WaitAsync(ct);
    }
    return data;
}
finally { semaphore.Release(); }
```

## 踩坑與避坑指南

* **惡意無效 ID 穿透**：黑客頻繁查詢不存在的商品 ID，資料庫永遠為 null。**解法**：查無資料時向 Redis 寫入空值標記（短 TTL 30 秒），或在最前端加掛布隆過濾器（Bloom Filter）。
* **大批商品同秒過期雪崩**：批次預熱時所有 Key 設相同 TTL，會在一小時後集體失效引發回源海嘯。**解法**：加上 ±10% 隨機擾動（Jitter）：
  ```csharp
  public static TimeSpan GetJitteredTtl(TimeSpan baseTtl) =>
      TimeSpan.FromSeconds(baseTtl.TotalSeconds * (0.9 + Random.Shared.NextDouble() * 0.2));
  ```
* **避坑原則（什麼時候千萬不要加 SingleFlight？）**：
  * **不要過度設計**：內部後台、每秒 QPS < 50 的冷門商品 API，直接使用基本 Cache-Aside 即可。加鎖只會消耗執行緒與記憶體。
  * **強一致性交易嚴禁依賴快取**：庫存扣減防超賣、錢包扣款，必須直接由資料庫交易或分散式鎖保證，絕不可拿快取當決策依據。

## 線上排查指令

明天線上懷疑快取異常或 DB 負載暴增時，直接在終端機貼以下指令救火：

```bash
# 1. 抓延遲：檢測 Redis 伺服器即時網路與回應延遲
redis-cli -h <host> -p 6379 --latency

# 2. 抓兇手：查看阻塞事件循環的慢查詢指令（如誤用 KEYS 或大 HGETALL）
redis-cli -h <host> -p 6379 slowlog get 10

# 3. 抓大 Key：排查是哪一個 Key 佔用巨大頻寬（採漸進掃描不卡死服務）
redis-cli -h <host> -p 6379 --bigkeys

# 4. 抓命中率：監控每秒 QPS 與 hits / misses 統計
redis-cli -h <host> -p 6379 info stats
```

**監控警報閾值參考**：快取命中率 5 分鐘均值低於 85%、Redis p99 延遲 > 20ms、或回源 DB 次數突增超過平常 3 倍時，應立即觸發告警。
