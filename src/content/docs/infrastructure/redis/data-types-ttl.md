---
title: "Redis 資料型別、Key 與 TTL"
description: "依讀寫行為選資料結構，理解過期時間、覆寫、命名與原子操作的界線。"
articleId: "redis-data-types-ttl"
topic: "redis"
category: "redis-basics"
order: 2
tags:
  - "String"
  - "Hash"
  - "List"
  - "Set"
  - "Sorted Set"
  - "TTL"
  - "EXPIRE"
  - "SET"
  - "Key"
difficulty: "beginner"
prerequisites:
  - "redis-getting-started"
relatedArticles:
  - "redis-dotnet-integration"
  - "redis-concurrency"
  - "redis-reliability"
applicableVersions: "Redis 8.x／StackExchange.Redis 3.x／.NET 10。"
lastReviewed: "2026-10-10"
takeaway: "Key、資料結構與 TTL 是同一份資料契約；單一命令的原子性不會自動延伸到一串命令。"
sources:
  - title: "Redis：資料型別"
    url: "https://redis.io/docs/latest/develop/data-types/"
  - title: "Redis：SET"
    url: "https://redis.io/docs/latest/commands/set/"
  - title: "Redis：TTL"
    url: "https://redis.io/docs/latest/commands/ttl/"
  - title: "Redis：INCR"
    url: "https://redis.io/docs/latest/commands/incr/"
---

## 案發現場

在許多 Redis 故障覆盤報告中，最常見的元凶往往不是 Redis 引擎本身，而是開發團隊對**資料型別與鍵（Key）生命週期**的隨意使用。

典型災難現場一：**BigKey 塞爆頻寬與阻塞單執行緒**。
在電商商品頁面中，工程師將包含商品基礎資訊、50 種規格 SKU、幾百張圖片連結以及最新評論的龐大資料結構（體積高達 600KB），一股腦序列化為單一 JSON 字串，以 `String` 型別存入 Redis。
當有併發請求需要「扣減其中某個規格的庫存 1 件」時，代碼寫成了經典的「讀出 600KB ➔ 記憶體反序列化 ➔ 修改數字 ➔ 序列化為 600KB ➔ 寫回 Redis」。
在促銷高峰期：
1. **網路頻寬耗盡（NIC Saturation）**：每秒 1,000 次存取直接消耗 600MB/s 頻寬，瞬間打滿雲端伺服器的網卡上限。
2. **更新丟失（Lost Update）**：兩個執行緒同時讀取 600KB，分別扣減不同的規格，後寫回的物件直接覆蓋了先寫回的更新，引發嚴重的庫存錯亂。

典型災難現場二：**永久 Key 導致記憶體無情膨脹（OOM）**。
開發者在記錄使用者瀏覽記錄或防刷驗證碼時，使用 `SET verify_code:13800000000 123456`，**卻忘了加上過期時間（TTL）**。幾個月下來，累積了上千萬個無用的過期驗證碼。Redis 記憶體被撐滿達到 `maxmemory`，觸發了記憶體淘汰機制，導致原本重要的全域使用者 Session 快取被強制清除，全站使用者集體被迫登出！

---

## 反模式與正確解法

### 1. Redis 五大核心型別選型指南

| 資料型別 | 最佳使用情境 | 典型操作命令 | 避免場景 |
| :--- | :--- | :--- | :--- |
| **`String`** | 小型物件快取、原子計數器、分散式鎖 | `GET`, `SET`, `INCRBY` | 儲存大於 50KB 的巨型巢狀 JSON |
| **`Hash`** | 包含多個屬性的結構化實體（如商品、用戶設定） | `HGET`, `HSET`, `HINCRBY` | 整個物件所有欄位總是一起讀寫且極小（此時用 String 更單純） |
| **`List`** | 有界日誌、輕量佇列、時間軸最新消息 | `LPUSH`, `RPOP`, `LTRIM` | 隨機按索引讀取大集合（$O(N)$ 效能差） |
| **`Set`** | 唯一值去重、共同好友、抽獎去重池 | `SADD`, `SISMEMBER`, `SINTER` | 需要保證元素排序順序 |
| **`Sorted Set (ZSet)`**| 熱搜排行榜、分頁評分、延時任務佇列 | `ZADD`, `ZRANGEBYSCORE` | 元素頻繁大量修改且不需任何排序 |

---

### 反模式一：單純依賴 String 儲存複雜實體並手動比對

將整個大實體存成 String，每次局部修改都需要拉回全量資料，浪費 I/O 且無法達成原子更新。

### 正確解法一：利用 Hash 與原子 HINCRBY 進行局部更新

將商品結構分解為 Redis `Hash`，不僅利用底層 `listpack`（或 `ziplist`）達成極高記憶體壓縮比，還能在 Redis 端直接對單一欄位進行原子計算：

```csharp
// 正確解法：利用 Hash 與 HINCRBY 進行欄位級原子扣減
public async Task<bool> DeductStockFieldAsync(
    long productId, 
    string skuCode, 
    int quantity, 
    CancellationToken ct)
{
    var hashKey = $"ecommerce:product:stock:{productId}";
    var db = _redis.GetDatabase();

    // 在 Redis 內部直接對特定 SKU 欄位執行原子遞減（避免網路傳輸整包物件！）
    var remainingStock = await db.HashDecrementAsync(hashKey, skuCode, quantity);

    if (remainingStock < 0)
    {
        // 若扣成負數，立即原子補回並回報失敗
        await db.HashIncrementAsync(hashKey, skuCode, quantity);
        return false;
    }

    return true;
}
```

---

### 反模式二：覆寫 Key 時意外丟失原有的 TTL

工程師在一個已經設定過過期時間（TTL = 300 秒）的 Key 上，執行常規的 `SET key value`。
**在 Redis 協議中，常規的 `SET` 會預設將該 Key 的過期時間徹底清除，使其變為永久保存（TTL = -1）！**

### 正確解法二：使用 KEEPTTL 參數或在同一指令顯式指定過期時間

現代 Redis 支援在更新值時保留原先的過期時間倒數（`KEEPTTL`）：

```csharp
// 正確解法：更新值的同時保留原有剩餘的過期時間（KEEPTTL）
public async Task UpdateValueKeepTtlAsync(string key, string newValue)
{
    var db = _redis.GetDatabase();

    // 透過 keepTtl: true，確保不會把原本的過期倒數抹煞成永久 Key！
    await db.StringSetAsync(key, newValue, keepTtl: true);
}
```

---

### 正確解法三：規範化的 Key 命名空間與強制預設 TTL

團隊必須訂立統一的 Key 命名規範：`{系統}:{領域模組}:{實體ID}:{屬性}`。
任何寫入 Redis 的代碼，**必須強制傳入 `TimeSpan expiration`**：

```csharp
// 命名範例：層次清晰且利於監控統計
string productKey = $"ecommerce:catalog:product:{id}";
string rateLimitKey = $"ecommerce:security:ratelimit:{ip}";

// 寫入時強制指定 TTL，杜絕孤兒永久 Key
await db.StringSetAsync(productKey, json, TimeSpan.FromMinutes(15));
```

---

## 踩坑與避坑指南

### 1. 嚴禁在線上執行 KEYS * 指令
- **踩坑點**：`KEYS *` 指令的時間複雜度為 $O(N)$，它會暴力遍歷記憶體中的所有百萬個 Key。由於 Redis 是單執行緒模型（Single-threaded Engine），在遍歷的 3~5 秒內，Redis 完全無法響應任何其他客戶端請求，導致全站雪崩！
- **線上鐵律**：生產環境必須使用 **`SCAN` 游標遍歷**，分批漸進式掃描。

### 2. 刪除巨型 BigKey 時使用 UNLINK 取代 DEL
- 若一個包含 100 萬個元素的 Hash 或 ZSet 需要被刪除，直接執行 `DEL key` 會在主執行緒同步釋放這數十萬個記憶體節點，阻塞 Redis 達數百毫秒。
- **規則**：使用 **`UNLINK key`**。Redis 會將該 Key 立即從鍵空間摘除，並在背景獨立執行緒非同步釋放記憶體。

---

## 線上排查指令

### 1. 檢測生產環境中的 BigKeys 分佈

在終端機執行 Redis 內建工具（不會阻塞線上服務）：
```bash
redis-cli -h redis-host -p 6379 -a "password" --bigkeys
```
此指令會透過 `SCAN` 漸進掃描並回報每種資料型別（String, Hash, List, Set, ZSet）中佔用記憶體最大、元素最多的 Top 1 巨型鍵。

### 2. 使用 SCAN 安全遍歷特定前綴的 Key

```bash
# 安全漸進式掃描前綴，每次讀取 100 筆，不卡死 Redis
redis-cli --scan --pattern "ecommerce:catalog:*" | head -n 20
```

### 3. 檢查特定 Key 的剩餘存活秒數（TTL）

```bash
redis-cli TTL "ecommerce:catalog:product:101"
```
回傳值意涵：
- 正整數：剩餘存活秒數。
- `-1`：該 Key 為永久保存（無過期時間，若為快取即屬異味！）。
- `-2`：該 Key 不存在或已過期刪除。

### 4. Prometheus / Grafana 監控指標

```text
# 永久 Key（無 TTL）佔比告警
(redis_db_keys_total - redis_db_expires_keys_total) / redis_db_keys_total > 0.3

# 記憶體使用率佔 maxmemory 比例超過 80%
(redis_memory_used_bytes / redis_memory_max_bytes) > 0.8
```
