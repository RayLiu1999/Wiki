---
title: "Redis 持久化、記憶體與故障處理"
description: "理解 RDB、AOF、淘汰與高可用性的不同責任，建立有界的快取降級與觀測。"
articleId: "redis-reliability"
topic: "redis"
category: "redis-reliability"
order: 6
tags:
  - "RDB"
  - "AOF"
  - "appendfsync"
  - "maxmemory"
  - "eviction"
  - "Sentinel"
  - "Cluster"
  - "故障降級"
  - "命中率"
difficulty: "advanced"
prerequisites:
  - "redis-cache-aside"
relatedArticles:
  - "redis-concurrency"
  - "engineering-cache-messaging-tests"
  - "engineering-metrics-tracing"
applicableVersions: "Redis 8.x／StackExchange.Redis 3.x／.NET 10。"
lastReviewed: "2026-10-10"
takeaway: "持久化、備份、複寫與降級各自處理不同故障；快取應始終容許資料遺失與重新載入。"
sources:
  - title: "Redis：Persistence"
    url: "https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/"
  - title: "Redis：Key eviction"
    url: "https://redis.io/docs/latest/develop/reference/eviction/"
  - title: "Redis：Replication"
    url: "https://redis.io/docs/latest/operate/oss_and_stack/management/replication/"
---

## 案發現場

在生產環境中，Redis 通常被視為「極速、穩定」的代名詞。然而，當容量達到硬體極限或遭遇節點故障時，缺乏可靠性規劃的系統會瞬間演變成全站崩潰的骨牌效應。

典型災難現場一：**記憶體用盡引發全站寫入癱瘓**。
系統配置了 8GB 的 Redis 實體，但工程師在 `redis.conf` 中**未設定 `maxmemory-policy` 淘汰策略**（預設為 `noeviction`）。當促銷流量激增、資料寫滿 8GB 時，所有後續嘗試寫入快取或會話的請求，全部拋出硬性報錯：
```text
StackExchange.Redis.RedisServerException: OOM command not allowed when used memory > 'maxmemory'.
```
由於應用程式在登入、結帳等關鍵路徑中未捕捉此例外，全站 API 集體噴出 500 錯誤。

典型災難現場二：**BGSAVE 記憶體翻倍觸發 Linux OOM Killer**。
在配置了 RDB 快照持久化的 Redis 主機上，主機實體記憶體為 16GB，Redis 當前佔用了 12GB。當背景觸發 `BGSAVE` 執行快照時，Redis 呼叫作業系統的 `fork()` 產生子進程。此時若正好碰上大量寫入流量，Linux 的寫入時複製（Copy-On-Write）機制需要額外分配數 GB 記憶體。主機記憶體瞬間見底，Linux OOM Killer 直接出手砍死 Redis 主進程，導致資料庫突遭數萬 QPS 穿透，系統瞬間雪崩。

---

## 反模式與正確解法

### 1. Redis 記憶體淘汰策略（Eviction Policies）對照

當記憶體達到 `maxmemory` 上限時，Redis 必須知道該「犧牲」誰：

| 淘汰策略 | 運作機制 | 適用場景 |
| :--- | :--- | :--- |
| **`noeviction`** | **不淘汰任何資料，新寫入直接報錯 OOM！**（預設值） | 絕對禁止資料遺失的場景（但純快取環境切勿使用！）。 |
| **`volatile-lru`** | 針對**有設定過期時間（TTL）的 Key**，優先淘汰最近最少使用（LRU）的鍵。 | **純快取業務的最佳首選！** 保護沒有 TTL 的系統全域配置。 |
| **`allkeys-lru`** | 對**所有 Key（無論有無 TTL）**，淘汰最近最少使用的鍵。 | 所有資料均為可隨時重建之快取的情境。 |
| **`volatile-lfu`** | 針對有 TTL 的 Key，淘汰存取頻率最低（LFU）的鍵。 | 解決 LRU 在偶發偶爾突發遍歷時將熱點快取擠出的缺點。 |

---

### 反模式一：未設定淘汰策略或忽視有界降級

任由 Redis 記憶體無限制膨脹，且在應用層將 Redis 的呼叫視為「必定成功」，一旦連線逾時或拋出 OOM，就讓整個 HTTP 請求失敗。

### 正確解法一：配置 volatile-lru 與應用層 Fallback 容錯

1. 在 `redis.conf` 強制指定安全上限與淘汰策略：
   ```text
   maxmemory 8gb
   maxmemory-policy volatile-lru
   ```
2. 應用層實作「**快取故障優雅降級（Graceful Fallback）**」：當 Redis 出現連線逾時、網路斷開或 OOM 例外時，捕獲例外、記錄 Warning 日誌，並自動回源至權威資料庫，維持全站基本服務可用：

```csharp
// 正確解法：抗 Redis 故障的容錯快取讀取器
public async Task<ProductDto?> GetProductWithFallbackAsync(long id, CancellationToken ct)
{
    var cacheKey = $"ecommerce:product:{id}";

    try
    {
        // 1. 嘗試從 Redis 讀取
        var cached = await _redis.StringGetAsync(cacheKey);
        if (cached.HasValue)
        {
            return JsonSerializer.Deserialize<ProductDto>(cached.ToString());
        }
    }
    catch (Exception ex) when (ex is RedisException or TimeoutException or SocketException)
    {
        // 關鍵防護：Redis 故障絕不能擊垮業務！記錄警告並優雅降級回源
        _logger.LogWarning(ex, "Redis 服務異常，降級直接回源資料庫讀取商品 {Id}", id);
    }

    // 2. 降級回源資料庫
    var product = await _db.Products
        .AsNoTracking()
        .Where(p => p.Id == id)
        .Select(p => new ProductDto(p.Id, p.Name, p.Price))
        .FirstOrDefaultAsync(ct);

    // 3. 嘗試非同步寫回（即使失敗也不影響回傳）
    if (product is not null)
    {
        _ = Task.Run(async () =>
        {
            try
            {
                await _redis.StringSetAsync(cacheKey, JsonSerializer.Serialize(product), TimeSpan.FromMinutes(10));
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "寫回快取失敗（已忽略）");
            }
        }, CancellationToken.None);
    }

    return product;
}
```

---

### 反模式二：在純快取場景無端開啟最高等級持久化（AOF always）

將 `appendfsync always` 設為每次寫入都強制作業系統刷盤至磁碟，這會將 Redis 的記憶體寫入吞吐量從每秒 10 萬次驟降至數千次，抹煞了引入快取的初衷。

### 正確解法二：持久化權衡（AOF everysec 與 RDB 快照）

- **純快取定位**：若所有資料在 DB 中均有備份，**直接關閉持久化（`save ""`）**，可消除 Fork 記憶體暴增與磁碟 I/O 爭用。
- **需要重啟快速恢復時**：採用 `appendfsync everysec`（每秒在背景非同步刷盤一次），兼顧極致效能與最多僅遺失 1 秒資料的可靠性平衡。

---

## 踩坑與避坑指南

### 1. Linux 記憶體過度分配參數（vm.overcommit_memory = 1）
- **現象**：在 Linux 主機中，明明實體記憶體還有剩餘，但 Redis 執行 `BGSAVE` 或 AOF 重寫時卻失敗報錯：`Can't save in background: fork: Cannot allocate memory`。
- **根本原因**：Linux 預設的核心策略（`vm.overcommit_memory = 0`）會嚴格檢查進程申請的虛擬記憶體大小。當 Redis 進程申請 Fork 時，核心認定可能會超過實體容量而拒絕。
- **生產環境鐵律**：在主機的 `/etc/sysctl.conf` 必須配置：
  ```bash
  vm.overcommit_memory = 1
  ```
  讓作業系統無條件允許進程超額分配記憶體，發揮 Copy-On-Write 的真正威力。

### 2. 主從切換時的非同步複製遺失（Replication Lag）
- Redis 的主從複製（Master-Replica）是**非同步的**。當 Master 節點突然 Crash，Sentinel 或 Cluster 將 Replica 提升為新 Master 時，尚未同步至從節點的最新寫入資料會永久遺失。
- **避坑規則**：**切勿將關鍵的唯一交易狀態僅放在 Redis 主從結構中！** 所有關鍵狀態落庫仍應以具備 Write-Ahead-Log 的 ACID 關聯式資料庫為準。

---

## 線上排查指令

### 1. 深度分析 Redis 記憶體使用分佈

```bash
redis-cli INFO memory
```
關鍵欄位解讀：
- `used_memory_human`：Redis 分配的實際資料記憶體。
- `used_memory_rss_human`：作業系統實際分配給 Redis 進程的實體記憶體（包含記憶體碎片）。
- `mem_fragmentation_ratio`：記憶體碎片率（$\text{used\_memory\_rss} / \text{used\_memory}$）。若大於 1.5，代表存在嚴重記憶體碎片，可開啟 `activedefrag yes` 自動清理。
- `evicted_keys`：因達到 `maxmemory` 而被強制淘汰的 Key 累積總數。若此數值持續暴增，代表快取容量嚴重不足！

### 2. 檢測主從複製延遲與健康狀態

```bash
redis-cli INFO replication
```
檢查：
- `role: master`
- `connected_slaves: 1`
- `master_repl_offset` 與 `slave_repl_offset` 的差距（差距過大代表主從網路延遲嚴重）。

### 3. Prometheus / Grafana 監控告警指標

```text
# Redis 記憶體淘汰發生率告警（代表快取正在被強制踢出）
rate(redis_evicted_keys_total[1m]) > 10

# Redis 連線失敗率（觸發 Fallback 降級次數）
rate(redis_connection_errors_total[1m]) > 0
```
