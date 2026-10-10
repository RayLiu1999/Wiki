---
title: "讀副本與復原：延遲、Failover 和備份"
description: "設計讀寫路由、提交結果查詢與復原驗證，連回 GKE 與 Cloud SQL。"
articleId: "data-access-replication-recovery"
topic: "data-access"
category: "database-scale"
order: 19
tags:
  - "MySQL"
  - "PostgreSQL"
  - "Cloud SQL"
  - "Read Replica"
  - "Failover"
  - "PITR"
  - "RPO"
  - "RTO"
difficulty: "intermediate"
learningDepth: "deep"
prerequisites:
  - "data-access-pool-capacity"
  - "data-access-concurrent-crud"
relatedArticles:
  - "gke-data-services"
  - "kubernetes-autoscaling"
  - "engineering-recovery-cost"
  - "data-access-load-validation"
applicableVersions: "以 .NET 10、MySQL 8.4（InnoDB）、PostgreSQL 18 說明；driver／EF provider 的主版相容性須各自核對。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-10"
takeaway: "設計讀寫路由、提交結果查詢與復原驗證，連回 GKE 與 Cloud SQL。"
sources:
  - title: "PostgreSQL 18：高可用與複寫"
    url: "https://www.postgresql.org/docs/18/high-availability.html"
  - title: "Npgsql：failover 與讀取路由"
    url: "https://www.npgsql.org/doc/failover-and-load-balancing.html"
  - title: "Cloud SQL：從 GKE 連接 PostgreSQL"
    url: "https://docs.cloud.google.com/sql/docs/postgres/connect-kubernetes-engine"
  - title: "PgBouncer：池模式與相容性"
    url: "https://www.pgbouncer.org/features.html"
---

## 案發現場

為了降低單一資料庫主庫（Primary）的讀取壓力，高流量系統普遍引入了讀寫分離（Read-Write Splitting）架構：主庫負責寫入，多個唯讀副本（Read Replicas）負責分攤查詢。

然而，一旦上線，最困擾產品與客服的致命問題隨之而來——**「寫後讀舊資料（Read-Your-Own-Writes Violation）」**：
使用者在電商網站下單並付款成功，系統重導向至「訂單詳情」頁面。由於查詢被路由至讀副本，而此時主從複製存在 300 毫秒的延遲（Replication Lag），讀副本尚未同步該筆新訂單。頁面直接顯示「查無訂單」或「訂單未付款」！使用者以為交易失敗，立即按上一頁再次點擊付款，引發嚴重的客訴與重複扣款糾紛。

另一個災難現場是**容錯切換（Failover）引發的集體寫入癱瘓**：
當雲端資料庫（如 Cloud SQL 或 AWS RDS）進行例行維護或主庫硬體故障，觸發高可用性（HA）自動容錯切換時，舊主庫被降級為唯讀（Read-Only），新節點被提升為主庫。然而，Kubernetes 中的 .NET 應用程式連線池依然抓著舊主庫的實體 TCP Socket 連線不放，持續發送寫入並頻繁拋出：
```text
Npgsql.PostgresException: 25006: cannot execute INSERT in a read-only transaction
```
直到手動重啟所有 Pod 之前，全站寫入業務完全無法自我癒合。

---

## 反模式與正確解法

### 反模式一：一刀切將所有 SELECT 查詢全部路由至讀副本

工程師常直覺地設定規則：「寫入呼叫 PrimaryDbContext，所有查詢呼叫 ReplicaDbContext」。
這完全忽略了**非同步複製（Asynchronous Replication）在物理上必然存在延遲**。任何在使用者剛完成寫入後的即時反查（如建立訂單後導向詳情頁、修改密碼後重新登入），只要撞上延遲，就會引發一致性災難。

### 正確解法一：寫後即讀（Read-Your-Own-Writes）粘性路由策略

核心原則：**只有對一致性延遲不敏感的查詢（如首頁推薦、報表瀏覽）才走讀副本；剛完成寫入的使用者，在一定時間窗口內強制將查詢路由回主庫！**

```csharp
// 寫後即讀路由協調器：透過 HttpContext 與 Cookie/Token 決定路由
public interface IDbRoutingSelector
{
    bool ShouldRouteToPrimary();
    void MarkRecentWrite(TimeSpan stickyDuration);
}

public class DbRoutingSelector : IDbRoutingSelector
{
    private readonly IHttpContextAccessor _httpContextAccessor;
    private const string WriteTimestampKey = "X-Last-Write-Utc";

    public DbRoutingSelector(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public void MarkRecentWrite(TimeSpan stickyDuration)
    {
        var context = _httpContextAccessor.HttpContext;
        if (context == null) return;

        // 在 Session 或 Response Header 標記最新寫入時間戳
        context.Response.Cookies.Append(WriteTimestampKey, 
            DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(), 
            new CookieOptions { MaxAge = stickyDuration, HttpOnly = true, SameSite = SameSiteMode.Lax });
    }

    public bool ShouldRouteToPrimary()
    {
        var context = _httpContextAccessor.HttpContext;
        if (context == null) return true; // 背景作業預設走主庫

        // 若最近 5 秒內曾發生寫入，強制將該用戶的所有讀取導向主庫！
        if (context.Request.Cookies.TryGetValue(WriteTimestampKey, out var timestampStr) &&
            long.TryParse(timestampStr, out var lastWriteSec))
        {
            var elapsed = DateTimeOffset.UtcNow - DateTimeOffset.FromUnixTimeSeconds(lastWriteSec);
            if (elapsed < TimeSpan.FromSeconds(5))
            {
                return true; // 走主庫，保證絕對能讀到自己剛寫入的最新資料！
            }
        }

        return false; // 安全走讀副本
    }
}
```

---

### 反模式二：依賴靜態 IP 或未設定 Driver 原生容錯參數

硬編碼主庫 IP，或在連線字串中只給單一主機位址，當 HA 切換時，客戶端只能眼睜睜看著連線失敗或嘗試寫入已唯讀的降級節點。

### 正確解法二：利用 Driver 原生 TargetSessionAttributes 自動切換

現代 Npgsql 與 MySqlConnector 均支援多主機配置與連線屬性探測：

```csharp
// Program.cs: Npgsql 自動容錯與主從自癒連線字串
var haConnectionString = new NpgsqlConnectionStringBuilder
{
    // 同時提供 Primary 與 Standby 主機清單
    Host = "db-node-a.internal,db-node-b.internal",
    Port = 5432,
    Database = "ecommerce_db",
    Username = "app_user",
    Password = builder.Configuration["DbPassword"],

    // 關鍵設定：強制連線池只與具備「可寫入能力（Primary）」的節點握手！
    // 若節點切換為唯讀，Driver 會自動拋棄該連線並尋找新的 Primary
    TargetSessionAttributes = "primary",

    // 容錯切換時的心跳與快速重試設定
    Timeout = 3,
    CommandTimeout = 10,
    ConnectionIdleLifetime = 10
}.ConnectionString;
```

---

## 踩坑與避坑指南

### 1. 主庫大交易導致讀副本複製延遲激增
- **現象**：平時主從延遲只有 50ms，但在夜間批次更新商品或執行巨型 Migration 時，讀副本延遲突然暴衝至 3,600 秒（1 小時）以上。
- **根本原因**：主庫透過多執行緒並行執行，但從庫回放 WAL / Binlog 在傳統機制下通常是單一線程（Single-threaded replay）。一旦遇到單一耗時 10 分鐘的巨型交易，從庫必須按順序執行完畢才能繼續同步後續交易。
- **規則**：嚴格拆分主庫更新為微小批次（Chunked Updates），並在 MySQL 8.0+ / PostgreSQL 啟用**並行回放（MTS / Parallel Apply Worker）**。

### 2. PITR 災難復原演練（RPO 與 RTO 的真實考驗）
- **RPO（復原點目標）**：最多允許遺失多少時間的資料（由 WAL/Binlog 備份頻率決定）。
- **RTO（復原時間目標）**：從災難發生到系統完全恢復可用的耗時。
- **避坑規則**：**未經真實還原驗證的備份，等同於沒有備份！** 團隊必須每季執行一次自動化演練：將昨天的備份還原至獨立隔離環境，指定恢復至特定時間戳（Point-in-Time Recovery），並驗證訂單資料校驗和。

---

## 線上排查指令

### 1. 查詢主從複製延遲即時狀態

**PostgreSQL 查詢從庫複製延遲（在主庫執行）：**
```sql
SELECT 
    client_addr, 
    application_name, 
    state, 
    sync_state,
    pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) AS lag_bytes,
    ROUND(EXTRACT(EPOCH FROM (now() - reply_time))) AS lag_seconds
FROM pg_stat_replication;
```

**MySQL 查詢從庫複製狀態（在從庫執行）：**
```sql
-- 檢查 Seconds_Behind_Master 是否大於 0
SHOW REPLICA STATUS\G
```
重點檢查：
- `Replica_IO_Running: Yes`
- `Replica_SQL_Running: Yes`
- `Seconds_Behind_Master`: 當前延遲秒數。

### 2. 手動驗證 PostgreSQL 連線是否具備寫入能力

```sql
-- 檢查目前連線是否為唯讀節點（t 代表在唯讀從庫，f 代表在主庫）
SELECT pg_is_in_recovery();
```

### 3. Prometheus / Grafana 監控指標

```text
# 主從延遲超過 5 秒即時告警
pg_stat_replication_lag_seconds > 5

# MySQL 主從複製執行緒中斷告警
mysql_slave_status_slave_io_running == 0 or mysql_slave_status_slave_sql_running == 0
```
