---
title: "連線池預算、背壓與高併發容量"
description: "用持有時間與系統總量推算候選池大小，分清 session 上限和安全的資料庫工作量。"
articleId: "data-access-pool-capacity"
topic: "data-access"
category: "database-connections"
order: 13
tags:
  - "連線池"
  - "高併發"
  - "Little’s Law"
  - "背壓"
  - "HPA"
  - "SemaphoreSlim"
difficulty: "intermediate"
learningDepth: "deep"
prerequisites:
  - "data-access-pools-locks"
  - "data-access-csharp-connections"
relatedArticles:
  - "kubernetes-autoscaling"
  - "redis-reliability"
  - "data-access-load-validation"
applicableVersions: "以 .NET 10、MySQL 8.4（InnoDB）、PostgreSQL 18 說明；driver／EF provider 的主版相容性須各自核對。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-10"
takeaway: "用持有時間與系統總量推算候選池大小，分清 session 上限和安全的資料庫工作量。"
sources:
  - title: "Npgsql：DataSource 與借還連線"
    url: "https://www.npgsql.org/doc/basic-usage.html"
  - title: "MySqlConnector：連線設定"
    url: "https://mysqlconnector.net/connection-options/"
  - title: "PostgreSQL 18：連線容量"
    url: "https://www.postgresql.org/docs/18/runtime-config-connection.html"
  - title: "Kubernetes：Deployment 與終止中 Pod"
    url: "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/"
---

## 案發現場

每逢雙十一或限時搶購活動，後端工程師常會目睹一場典型的「水平擴展引發的系統自殘」：

流量如潮水般湧入，Kubernetes 的 HPA（Horizontal Pod Autoscaler）迅速響應，將 API 服務從平時的 5 個 Pod 自動擴容至 40 個 Pod。每個 Pod 的連線池採用了網路上常見的設定 `Max Pool Size=100`。

幾秒鐘之內，資料庫後端（如 Cloud SQL 或 RDS）的連線數如火箭般飆破 2,000。然而，資料庫實體的 `max_connections` 上限僅配置為 600。資料庫開始無差別拒絕新連線：
```text
Npgsql.NpgsqlException: FATAL: remaining connection slots are reserved for non-replication superuser connections
   at Npgsql.Internal.NpgsqlConnector.ReadExpecting[T](...)
```

由於新啟動的 Pod 無法取得資料庫連線，Kubernetes 的 Startup / Readiness Probe 紛紛失敗；K8s 判定 Pod 不健康並予以重啟。重啟中的 Pod 再次瘋狂發送 TLS 握手與連線請求，形成了致命的**連線重試風暴（Thundering Herd）**，最終導致 API Gateway 504 逾時、全站癱瘓。

根本原因在於：**未以數學模型推算容量預算，且誤將「連線數」等同於「處理能力」，缺乏應用層背壓防護。**

---

## 反模式與正確解法

### 反模式一：盲信「開大連線池能提高系統吞吐量」

很多工程師認為：「我有 1000 個併發請求，所以連線池應該開到 1000」。這是致命的誤解！

資料庫伺服器的運算核心是 CPU。假設你的資料庫主機擁有 16 核心 CPU，同一微秒內硬體最多只能平行運算 16 個執行緒。當有 500 個查詢同時在資料庫內部運行時，作業系統必須在 500 個執行緒/行程之間進行極其頻繁的**上下文切換（Context Switch）**，CPU 大量時間浪費在記憶體切換與快取失效（Cache Miss）上，導致整體吞吐量斷崖式下跌，查詢延遲從 2ms 惡化至數秒。

### 正確解法一：利特爾法則（Little's Law）與連線預算公式

根據排隊理論的利特爾法則（Little's Law）：
$$N = \lambda \times W$$
其中：
- $N$：系統平均需要的並行連線數（Concurrent Connections）。
- $\lambda$：每秒到達的查詢率（Queries Per Second, QPS）。
- $W$：單次查詢的平均持有連線時間（Latency in seconds）。

**實務算例：**
若單一 Pod 承載的 QPS 為 1,000，且在良好優化下平均查詢延遲為 5ms（0.005 秒）：
$$N = 1000 \times 0.005 = 5 \text{ 條連線}$$
這意味著：**一個每秒處理 1,000 次查詢的 Pod，平均只需要 5 條活動連線！**
加上 3 倍的安全峰值抖動餘裕，單 Pod 的 `Max Pool Size` 設定為 **15 ~ 20** 便綽綽有餘。

全系統安全容量公式約束：
$$\sum (\text{Pod 數量} \times \text{單 Pod Max Pool Size}) \le \text{DB max\_connections} \times 0.7$$
（保留 30% 連線給管理工具、備份排程與主從複製）。

---

### 反模式二：無限量接收請求並讓資料庫承受連線超載

當資料庫遭遇慢查詢抖動時，查詢時間 $W$ 拉長，導致需要的連線數 $N$ 瞬間激增。如果應用程式無限制地讓請求去搶資料庫連線，只會讓連線池瞬間乾涸，所有執行緒卡在 `GetConnectionAsync` 逾時。

### 正確解法二：在應用層使用 SemaphoreSlim 建立連線背壓（Backpressure）

應用層應實作「快速失敗（Fail-fast）」與「主動背壓」：當進入資料庫的併發請求達到單 Pod 安全上限時，立即排隊或回傳 HTTP 429 / 503，保護資料庫不被擊垮：

```csharp
// 生產級背壓資料存取閘門：保護底層連線池不被瞬間突波擊潰
public class DatabaseBackpressureGate
{
    private readonly SemaphoreSlim _semaphore;
    private readonly TimeSpan _acquireTimeout;
    private readonly ILogger<DatabaseBackpressureGate> _logger;

    public DatabaseBackpressureGate(
        int maxConcurrentDbOperations, 
        TimeSpan acquireTimeout,
        ILogger<DatabaseBackpressureGate> logger)
    {
        // 限制本 Pod 同一時間最多只能有 N 個非同步工作進入資料庫層
        _semaphore = new SemaphoreSlim(maxConcurrentDbOperations, maxConcurrentDbOperations);
        _acquireTimeout = acquireTimeout;
        _logger = logger;
    }

    public async Task<T> ExecuteWithBackpressureAsync<T>(
        Func<CancellationToken, Task<T>> action, 
        CancellationToken ct)
    {
        // 1. 嘗試獲取進入許可，若超過時間未排到，立即快速失敗拋出背壓例外
        var acquired = await _semaphore.WaitAsync(_acquireTimeout, ct);
        if (!acquired)
        {
            _logger.LogWarning("資料庫背壓閘門已滿，主動拒絕請求以保護資料庫！");
            throw new DatabaseOverloadedException("系統繁忙，請稍後再試。");
        }

        try
        {
            // 2. 獲准進入：執行資料庫操作
            return await action(ct);
        }
        finally
        {
            // 3. 釋放閘門許可
            _semaphore.Release();
        }
    }
}
```

在 ASP.NET Core 的 Minimal API 或 Controller 中使用：
```csharp
app.MapGet("/api/products/{id}", async (
    int id, 
    DatabaseBackpressureGate gate, 
    AppDbContext db, 
    CancellationToken ct) =>
{
    try
    {
        var product = await gate.ExecuteWithBackpressureAsync(
            async token => await db.Products.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id, token),
            ct);

        return product is not null ? Results.Ok(product) : Results.NotFound();
    }
    catch (DatabaseOverloadedException)
    {
        // 回傳 503 Service Unavailable 並提示重試時間
        return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
    }
});
```

---

## 踩坑與避坑指南

### 1. HPA 滾動發布（Rolling Update）期間的連線翻倍
- **現象**：設定了 `maxSurge: 50%` 的 Deployment，在部署新版時，新舊 Pod 同時存活，Pod 總數短暫達到平常的 1.5 倍。
- **踩坑點**：若平常連線數已達到資料庫上限的 80%，滾動發布時連線數會直接衝破 120%，瞬間癱瘓整個生產環境。
- **規則**：在規劃連線預算時，**Pod 最大數必須計入 `maxSurge` 的尖峰重疊數量**。

### 2. K8s Pod 終止中的連線清理與 Graceful Shutdown
- 當 Pod 收到 `SIGTERM` 訊號開始終止時，若未妥善處理 Graceful Shutdown，正在執行的長查詢可能被硬生生中斷，導致連線在資料庫端處於無主或卡死狀態數十秒。
- **避坑規則**：在 `Program.cs` 設定 `HostOptions.ShutdownTimeout`（如 15 秒），確保現有 HTTP 請求完成並主動關閉連線。

### 3. 連線借用逾時（Connection Timeout）絕不能過長
- 預設的連線逾時常為 15 秒或 30 秒。在高流量下，若取不到連線讓每個 Request 等待 15 秒，Kestrel 的工作執行緒池（ThreadPool）會瞬間被卡滿，連不受資料庫影響的靜態請求、Health Check 都會連帶逾時。
- **規則**：在微服務架構中，連線字串的 `Connection Timeout` 應縮減至 **3 ~ 5 秒**。

---

## 線上排查指令

### 1. 即時計算全叢集 Pod 消耗的資料庫連線分佈

```sql
-- PostgreSQL: 依據客戶端 IP 統計當前連線數（識別哪個 Pod 連線最多）
SELECT client_addr, count(*) AS connection_count
FROM pg_stat_activity
WHERE client_addr IS NOT NULL
GROUP BY client_addr
ORDER BY connection_count DESC;
```

```sql
-- MySQL: 依據主機來源 IP 統計連線數
SELECT SUBSTRING_INDEX(host, ':', 1) AS client_ip, count(*) AS connection_count
FROM information_schema.processlist
GROUP BY client_ip
ORDER BY connection_count DESC;
```

### 2. Kubernetes 快速排查異常連線數的 Pod

```bash
# 觀察當前運行的 Pod 數量
kubectl get pods -l app=ecommerce-api --no-headers | wc -l

# 查看是否有 Pod 處於 CrashLoopBackOff 或健康檢查失敗
kubectl get pods -l app=ecommerce-api | grep -E 'CrashLoop|0/'
```

### 3. Prometheus / Grafana 容量告警指標

```text
# 全叢集 Pod 連線數佔 DB 最大連線數超過 75%
(sum(npgsql_active_connections) / pg_settings_max_connections) > 0.75

# 應用端背壓觸發次數（每秒大於 1 次即代表資料庫已達飽和邊界）
rate(dotnet_backpressure_rejections_total[1m]) > 1
```
