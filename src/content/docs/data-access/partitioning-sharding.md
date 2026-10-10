---
title: "分割、封存與分片：一億列之後的選擇"
description: "依維護與容量證據區分 partition、archive 和 shard，保留唯一性與交易邊界。"
articleId: "data-access-partitioning-sharding"
topic: "data-access"
category: "database-scale"
order: 18
tags:
  - "Partition"
  - "Shard"
  - "分割表"
  - "分片"
  - "封存"
  - "CDC"
  - "上億筆"
difficulty: "intermediate"
learningDepth: "deep"
prerequisites:
  - "data-access-large-table-queries"
  - "data-access-bulk-retention"
relatedArticles:
  - "data-access-replication-recovery"
  - "data-access-load-validation"
applicableVersions: "以 .NET 10、MySQL 8.4（InnoDB）、PostgreSQL 18 說明；driver／EF provider 的主版相容性須各自核對。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-10"
takeaway: "依維護與容量證據區分 partition、archive 和 shard，保留唯一性與交易邊界。"
sources:
  - title: "PostgreSQL 18：分割表"
    url: "https://www.postgresql.org/docs/18/ddl-partitioning.html"
  - title: "MySQL 8.4：分割鍵與唯一鍵"
    url: "https://dev.mysql.com/doc/refman/8.4/en/partitioning-limitations-partitioning-keys-unique-keys.html"
  - title: "MySQL 8.4：分割表與外鍵限制"
    url: "https://dev.mysql.com/doc/refman/8.4/en/partitioning-limitations-storage-engines.html"
  - title: "PostgreSQL 18：高可用與複寫"
    url: "https://www.postgresql.org/docs/18/high-availability.html"
---

## 案發現場

當資料表突破一億列甚至數億列時，最具破壞力的災難通常不是讀取，而是**資料清理與維護**。

典型案發現場：**在大表上執行大區間 DELETE 引發資料庫自毀**。
某平台的使用者行為日誌表與審計日誌累積至 1.8 億列，磁碟使用率達到 90% 警戒線。維運工程師為了釋放空間，在業務離峰期執行了一句看似簡單的 SQL：
```sql
DELETE FROM audit_logs WHERE created_at < '2025-01-01';
```
執行不到一分鐘，慘劇發生：
1. **日誌爆炸**：MySQL 的 Undo Log 或 PostgreSQL 的 WAL（Write-Ahead Logging）急劇膨脹數十 GB，把剩餘的 10% 磁碟直接塞爆，資料庫瞬間轉為唯讀崩潰。
2. **鎖表與雪崩**：這條巨型 DELETE 在 InnoDB 中鎖定了數百萬筆記錄的間隙，後續所有的正常 INSERT 請求全部被卡死，連線池在 10 秒內耗盡。
3. **主從延遲失控**：複製日誌傳輸到唯讀從庫（Read Replica）後，從庫單線程回放這條長交易，導致主從延遲狂飆至數小時，讀寫分離全線癱瘓。

另一種常見的極端是：團隊一聽到資料量有一億筆，未經評估便草率引入**分庫分表（Sharding）**，結果遭遇跨庫交易難以維持 ACID、分片鍵查詢跨節點廣播（Scatter-Gather）、跨庫 JOIN 完全失效等巨大架構代價，開發成本呈指數級暴增。

---

## 反模式與正確解法

### 1. 資料庫擴充策略演進階梯

面對海量資料，架構演進應遵循嚴格的階梯順序，切勿越級跳步：
1. **第一階（最佳化單表）**：複合索引覆蓋、Keyset 分頁、收窄欄位長度。
2. **第二階（表分割 Partitioning）**：將單一邏輯表按時間切分為多個物理子表，解決維護與清理難題。
3. **第三階（冷熱資料封存 Archive）**：將超過 1 年的冷歷史資料透過 CDC 卸載至物件儲存（GCS / S3）或分析資料庫（ClickHouse）。
4. **第四階（分庫分表 Sharding）**：當單一資料庫實體的**寫入吞吐量（IOPS / CPU）**達到物理極限，且前述手段無法緩解時，才作為最後防線引入。

---

### 反模式一：單表直接 DELETE 歷史資料

關聯式資料庫中，`DELETE` 是代價極高的寫入操作：引擎必須逐列記錄 Undo/WAL 日誌、維護所有二級索引樹，且刪除後硬碟空間**不會立刻還給作業系統**（只標記為可重用空間）。

### 正確解法一：宣告式表分割（Declarative Partitioning）與 O(1) 瞬間清理

以時間範圍進行表分割（Range Partitioning）。當需要刪除舊月份資料時，使用 `DETACH` 與 `DROP TABLE`，底層是直接刪除作業系統實體檔案，**耗時僅需 0.01 秒，零日誌膨脹、零鎖等待**：

```sql
-- PostgreSQL 宣告式時間表分割設計
CREATE TABLE audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY,
    user_id BIGINT NOT NULL,
    action VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (id, created_at) -- 關鍵：分割鍵必須是主鍵的一部分！
) PARTITION BY RANGE (created_at);

-- 建立 2026 年各月份子表
CREATE TABLE audit_logs_2026_01 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE audit_logs_2026_02 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- 當 2026 年 1 月資料過期時：極速無痛瞬間秒殺清理！
ALTER TABLE audit_logs DETACH PARTITION audit_logs_2026_01;
DROP TABLE audit_logs_2026_01; -- 立即釋放作業系統磁碟空間，零 WAL 負擔！
```

---

### 反模式二：查詢條件遺漏分割鍵引發全區掃描

建立了分割表後，若查詢條件僅包含 `user_id` 而未包含 `created_at`（分割鍵），資料庫引擎必須掃描這張邏輯表底下的**每一個物理子表**，效能甚至比未分割前更慢。

### 正確解法二：確保分割區裁剪（Partition Pruning）生效

在應用程式層（C# / EF Core）的查詢合約中，強制將分割鍵作為必填條件：

```csharp
// 正確解法：在查詢 API 中嚴格帶入時間範圍以觸發 Partition Pruning
public async Task<List<AuditLogDto>> QueryUserLogsAsync(
    long userId, 
    DateTimeOffset fromUtc, 
    DateTimeOffset toUtc, 
    CancellationToken ct)
{
    // WHERE 條件包含 created_at 範圍，資料庫只會打開特定月份的子表（Partition Pruning）
    return await _db.AuditLogs
        .AsNoTracking()
        .Where(x => x.UserId == userId && x.CreatedAt >= fromUtc && x.CreatedAt < toUtc)
        .OrderByDescending(x => x.CreatedAt)
        .Take(50)
        .Select(x => new AuditLogDto(x.Id, x.Action, x.CreatedAt))
        .ToListAsync(ct);
}
```

---

## 踩坑與避坑指南

### 1. 分割表的唯一性約束限制
- **硬性規則**：在 MySQL 與 PostgreSQL 中，分割表上的**所有主鍵（Primary Key）與唯一索引（Unique Index）必須包含分割鍵欄位**！
- **踩坑點**：若業務要求 `order_no` 必須全域唯一，但你按 `created_at` 分割，資料庫**不允許**單獨在 `order_no` 上建立唯一索引（因為每個子表無法跨表檢驗唯一性）。
- **解決方案**：
  1. 複合唯一鍵：宣告唯一索引為 `(order_no, created_at)`。
  2. 若必須嚴格全域唯一，在 Redis 中維護全域 Set，或在分片鍵前綴嵌入路由資訊。

### 2. 動態 SQL 參數與編譯期裁剪失效
- 在某些 PostgreSQL 版本中，若在預編譯陳述式（Prepared Statement）中使用動態條件或函式轉換（如 `WHERE created_at::text = ...`），執行計畫生成階段可能無法在編譯期完成裁剪（Compile-time pruning），而必須推遲到執行期裁剪（Run-time pruning），增加微秒級開銷。

### 3. 分片鍵（Shard Key）選擇不當導致熱點傾斜
- 若進入第四階分庫分表，分片鍵切忌選擇單調遞增的欄位（如時間或自增 ID），否則所有最新寫入只會瘋狂湧入最後一個分片，其他分片完全閒置。應使用雜湊（Hash-based）或將租戶 ID 作為分片鍵。

---

## 線上排查指令

### 1. 檢驗查詢是否成功觸發 Partition Pruning

```sql
-- PostgreSQL 檢查執行計畫
EXPLAIN (COSTS OFF)
SELECT * FROM audit_logs 
WHERE created_at >= '2026-02-01' AND created_at < '2026-02-15';
```
**正常輸出特徵：**
輸出中應僅顯示 `Seq Scan on audit_logs_2026_02` 或其索引掃描。若看到同時掃描了 `audit_logs_2026_01` 或其他子表，代表裁剪失效！

### 2. 查詢各分割區實體大小與列數

```sql
-- PostgreSQL 查詢各子表實際佔用磁碟與行數
SELECT
    child.relname       AS partition_name,
    pg_size_pretty(pg_total_relation_size(child.oid)) AS total_size,
    child.reltuples::bigint AS estimated_rows
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child  ON pg_inherits.inhrelid   = child.oid
WHERE parent.relname = 'audit_logs'
ORDER BY child.relname;
```

```sql
-- MySQL 查詢各分割區狀態
SELECT 
    PARTITION_NAME, 
    TABLE_ROWS, 
    DATA_LENGTH / 1024 / 1024 AS data_mb,
    INDEX_LENGTH / 1024 / 1024 AS index_mb
FROM information_schema.PARTITIONS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'audit_logs';
```

### 3. Prometheus / Grafana 監控指標

```text
# 資料庫單一表或分割區磁碟佔用超過 50GB 告警
pg_total_relation_size_bytes{relname=~"audit_logs.*"} > 53687091200

# 表分割未覆蓋（即將到來的月份缺乏子表）告警通知
```
