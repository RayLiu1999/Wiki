---
title: "快取併發、限流與分散式鎖的限制"
description: "區分穿透、熱點失效與同時過期，理解原子計數、租約與業務正確性的邊界。"
articleId: "redis-concurrency"
topic: "redis"
category: "redis-caching"
order: 5
tags:
  - "快取穿透"
  - "cache stampede"
  - "快取雪崩"
  - "single flight"
  - "Lua"
  - "INCR"
  - "限流"
  - "分散式鎖"
  - "fencing token"
difficulty: "intermediate"
learningDepth: "deep"
prerequisites:
  - "redis-cache-aside"
  - "csharp-thread-safety"
relatedArticles:
  - "redis-reliability"
  - "data-access-pools-locks"
  - "rabbitmq-retries-idempotency"
applicableVersions: "Redis 8.x／StackExchange.Redis 3.x／.NET 10。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-10"
takeaway: "減少重複載入與限流可以使用 Redis；關鍵業務規則仍須由權威儲存與交易保護。"
sources:
  - title: "Redis：INCR 與限流模式"
    url: "https://redis.io/docs/latest/commands/incr/"
  - title: "Redis：Distributed Locks"
    url: "https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/"
  - title: "Redis：SET"
    url: "https://redis.io/docs/latest/commands/set/"
---

## 案發現場

在高併發秒殺、限時促銷或熱搜榜單場景中，Redis 是擋在資料庫最前線的盾牌。然而，一旦併發快取防護失效，會瞬間引發毀滅性連鎖崩潰。

典型災難現場一：**快取擊穿（Cache Stampede / 熱點失效）**。
某超級爆款商品擁有 10,000 QPS 的存取流量。在整點 00:00:00，該商品的 Redis 快取剛好達到 10 分鐘 TTL 到期被清除。在這短短 10 毫秒的空窗期內，後續湧入的數千個並行請求同時判定 Cache Miss，**全部同時穿透去查詢資料庫**！資料庫連線池瞬間乾涸，執行緒全部卡死，全站 API 504 逾時癱瘓。

典型災難現場二：**土炮分散式鎖導致的誤刪與超賣**。
工程師使用 `SET key value NX EX 5` 自行實作商品扣款分散式鎖：
```csharp
// 致命反模式：未驗證 Token 的土炮釋放鎖
if (await redis.StringSetAsync(lockKey, "locked", TimeSpan.FromSeconds(5), When.NotExists))
{
    try
    {
        await ProcessOrderAsync(); // 悲劇：若業務執行因網路抖動耗時 7 秒...
    }
    finally
    {
        // 5 秒時鎖已自動過期，請求 B 剛好搶到鎖！
        // 請求 A 在第 7 秒執行此處，硬生生把「請求 B 的鎖」給刪除了！
        await redis.KeyDeleteAsync(lockKey);
    }
}
```
這個嚴重的邊界缺陷導致請求 C 又緊接著拿到鎖，多個請求同時進入臨界區，造成嚴重的商品超賣。

---

## 反模式與正確解法

### 1. 快取三害特徵與防禦對照

| 災難類型 | 觸發成因 | 破壞力 | 正確防護架構 |
| :--- | :--- | :--- | :--- |
| **快取擊穿（Stampede）** | **單一極熱點 Key** 正好過期，大量請求同時穿透打庫。 | 資料庫 CPU 瞬間飆至 100%。 | **Single-Flight（請求合併）** / 互斥鎖回源 / 邏輯永不過期。 |
| **快取雪崩（Avalanche）** | **大量不同 Key 在同一秒同時到期**，或者 Redis 節點當機。 | 全庫資料庫全面穿透。 | **TTL 隨機抖動（Jitter）** + Redis 高可用。 |
| **快取穿透（Penetration）** | 惡意查詢**資料庫根本不存在的 Key**（如 ID = -1）。 | 每次查詢必定 Miss，直擊資料庫。 | **布隆過濾器（Bloom Filter）** 或快取空值（Null Value Cache）。 |

---

### 正確解法一：防快取擊穿（Single-Flight 請求合併）

當快取失效時，**只允許單一執行緒去資料庫回源載入**，其餘併發請求在記憶體中排隊等待該執行緒的結果，避免數千次重複查詢：

```csharp
// 正確解法：利用 SemaphoreSlim 在單機實作 Single-Flight 請求合併回源
public class SingleFlightCacheService
{
    private readonly IDatabase _redis;
    private readonly AppDbContext _db;
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> _locks = new();

    public SingleFlightCacheService(IConnectionMultiplexer multiplexer, AppDbContext db)
    {
        _redis = multiplexer.GetDatabase();
        _db = db;
    }

    public async Task<ProductDto?> GetProductWithStampedeProtectionAsync(long id, CancellationToken ct)
    {
        var cacheKey = $"ecommerce:product:{id}";

        // 1. 快速路徑：快取命中立即返回
        var cached = await _redis.StringGetAsync(cacheKey);
        if (cached.HasValue)
        {
            return JsonSerializer.Deserialize<ProductDto>(cached.ToString());
        }

        // 2. 快取失效：獲取該 Key 專屬的單機鎖（Single-Flight）
        var keyLock = _locks.GetOrAdd(cacheKey, _ => new SemaphoreSlim(1, 1));
        await keyLock.WaitAsync(ct);

        try
        {
            // 雙重檢查（Double-Checked Locking）：可能前一個排隊的執行緒已經回填好了
            cached = await _redis.StringGetAsync(cacheKey);
            if (cached.HasValue)
            {
                return JsonSerializer.Deserialize<ProductDto>(cached.ToString());
            }

            // 3. 只有唯一的勝出執行緒真正打到資料庫！
            var product = await _db.Products
                .AsNoTracking()
                .Where(p => p.Id == id)
                .Select(p => new ProductDto(p.Id, p.Name, p.Price))
                .FirstOrDefaultAsync(ct);

            if (product is not null)
            {
                // 加入 10~30 秒隨機 Jitter，防止全體商品同一秒雪崩到期！
                var jitter = TimeSpan.FromSeconds(Random.Shared.Next(10, 30));
                await _redis.StringSetAsync(cacheKey, JsonSerializer.Serialize(product), TimeSpan.FromMinutes(10) + jitter);
            }
            else
            {
                // 防快取穿透：針對不存在的商品快取空值（TTL 設為極短的 60 秒）
                await _redis.StringSetAsync(cacheKey, "null", TimeSpan.FromSeconds(60));
            }

            return product;
        }
        finally
        {
            keyLock.Release();
        }
    }
}
```

---

### 正確解法二：安全的分散式鎖（Lua 原子驗證釋放）

分散式鎖的核心原則：**誰加的鎖，只能由誰來解！**
加鎖時必須注入唯一權杖（`lockValue = Guid.NewGuid()`），釋放鎖時必須透過 **Lua 腳本**原子驗證 Token 是否相符，防止誤刪他人的鎖：

```csharp
// 正確解法：生產級 Redis 安全分散式鎖
public class RedisDistributedLock
{
    private readonly IDatabase _redis;

    // 解鎖 Lua 腳本：只有當前值等於 lockValue 時才允許 DEL（保證原子性）
    private const string ReleaseLockScript = """
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
        """;

    public RedisDistributedLock(IConnectionMultiplexer multiplexer)
    {
        _redis = multiplexer.GetDatabase();
    }

    public async Task<bool> ExecuteWithLockAsync(
        string resourceKey, 
        TimeSpan expiry, 
        Func<Task> action)
    {
        var lockKey = $"lock:{resourceKey}";
        var lockToken = Guid.NewGuid().ToString("N"); // 唯一權杖

        // 原子加鎖並設定租約過期時間
        bool acquired = await _redis.StringSetAsync(lockKey, lockToken, expiry, When.NotExists);
        if (!acquired)
        {
            return false; // 競爭失敗，立即返回或退避
        }

        try
        {
            await action();
            return true;
        }
        finally
        {
            // 原子釋放鎖：透過 Lua 腳本核對 Token
            await _redis.ScriptEvaluateAsync(
                ReleaseLockScript, 
                new RedisKey[] { lockKey }, 
                new RedisValue[] { lockToken });
        }
    }
}
```

---

## 踩坑與避坑指南

### 1. 分散式鎖的理論局限性（Martin Kleppmann 的警告）
- **踩坑點**：分散式鎖**不能保證 100% 的絕對正確性**！若進程 A 獲取了鎖，但在執行業務時遭遇了長達 10 秒的 GC 暫停（Stop-The-World）或虛擬機凍結，Redis 租約過期後進程 B 獲取了鎖。當進程 A 恢復運行時，進程 A 與進程 B 將同時在臨界區執行寫入！
- **黃金準則**：關鍵業務（如金錢、庫存）的防護，不能完全依賴 Redis 分散式鎖；**資料庫底層必須搭配樂觀鎖版本號（Fencing Token）或原子條件扣減（`WHERE stock >= qty`）作為最後防線**。

### 2. Lua 腳本的單執行緒阻塞陷阱
- Redis 執行 Lua 腳本時具備嚴格的原子性，這意味著在該腳本執行完畢前，**Redis 無法處理任何其他客戶端的請求**！
- **鐵律**：Lua 腳本應保持微秒級極速完成，嚴禁在 Lua 內部編寫遍歷百萬元素的長迴圈或複雜運算。

---

## 線上排查指令

### 1. 檢測 Redis 慢查詢（Slowlog）

```bash
# 讀取最近 10 條超過 slowlog-log-slower-than 閾值的慢指令
redis-cli SLOWLOG GET 10
```
檢查輸出中是否有耗時的巨型 Lua 腳本或未加限制的集合操作。

### 2. 檢測即時分散式鎖爭用情況

```bash
# 觀察當前存在的活躍分散式鎖
redis-cli --scan --pattern "lock:*"
```

### 3. Prometheus / Grafana 監控指標

```text
# 快取穿透告警：快取未命中率異常飆高（大於 40%）
(sum(rate(redis_keyspace_misses_total[1m])) / 
 (sum(rate(redis_keyspace_hits_total[1m])) + sum(rate(redis_keyspace_misses_total[1m])))) > 0.4

# 分散式鎖競爭失敗率
rate(distributed_lock_acquisition_failures_total[1m])
```
