---
title: ".NET 整合 Redis 與連線生命週期"
description: "比較 IDistributedCache 與 StackExchange.Redis，管理共享連線、序列化、逾時與取消。"
articleId: "redis-dotnet-integration"
topic: "redis"
category: "redis-caching"
order: 3
tags:
  - "IDistributedCache"
  - "StackExchange.Redis"
  - "ConnectionMultiplexer"
  - "DI"
  - "序列化"
  - "timeout"
difficulty: "advanced"
prerequisites:
  - "redis-data-types-ttl"
  - "aspnet-core-dependency-injection"
  - "csharp-cancellation-disposable"
relatedArticles:
  - "redis-cache-aside"
  - "data-access-pools-locks"
  - "redis-reliability"
applicableVersions: ".NET 10／Microsoft.Extensions.Caching.StackExchangeRedis 10.x／StackExchange.Redis 3.x／Redis 8.x。"
lastReviewed: "2026-10-10"
takeaway: "IDistributedCache 提供快取抽象，原生 client 提供 Redis 操作；連線由應用程式生命週期管理。"
sources:
  - title: "Microsoft Learn：分散式快取"
    url: "https://learn.microsoft.com/en-us/aspnet/core/performance/caching/distributed?view=aspnetcore-10.0"
  - title: "StackExchange.Redis：Basic Usage"
    url: "https://seredis.dev/Basics"
  - title: "Redis：.NET 用戶端"
    url: "https://redis.io/docs/latest/develop/clients/dotnet/"
---

## 案發現場

在 .NET 專案中引入 Redis 時，最容易出現的架構事故是**「連線生命週期誤用引發的 Socket 耗盡與連線風暴」**。

許多初次使用 `StackExchange.Redis` 的開發者，習慣了 ADO.NET「用完即關（Open/Close）」的思維，在每次 HTTP 請求中這樣寫：
```csharp
// 致命反模式：在每次請求中手動建立連線
public async Task<string?> GetValueAsync(string key)
{
    using var redis = await ConnectionMultiplexer.ConnectAsync("redis.internal:6379");
    var db = redis.GetDatabase();
    return await db.StringGetAsync(key);
}
```
上線後，當並行流量衝上每秒 1,000 次時：
1. **Socket 耗盡（Socket Exhaustion）**：作業系統的 Ephemeral Ports 在數秒內被借光，處於 `TIME_WAIT` 狀態的連線高達數萬條，伺服器開始丟出 `SocketException: Only one usage of each socket address is normally permitted`。
2. **Redis 端連線打滿**：Redis 伺服器回報 `ERR max number of clients reached`，直接拒絕新連線。
3. **執行緒池飢餓（ThreadPool Starvation）**：反覆建立 TCP 連線與 TLS 握手極度消耗 CPU，導致 Task 排隊，所有正常 API 響應時間暴衝至 5 秒以上。

另一種常見災難是**容器啟動期崩潰（CrashLoopBackOff）**：
由於連線設定中保留了預設的 `abortConnect=true`，當 Redis 服務短暫處於重啟或網路抖動時，Kubernetes 中的 API Pod 在啟動的第一秒直接拋出例外退出，導致整組服務陷入無限重啟的死迴圈。

---

## 反模式與正確解法

### 1. StackExchange.Redis 的連線多工（Multiplexing）本質

`ConnectionMultiplexer` 的設計理念與 ADO.NET 完全相反：
**它是執行緒安全的長連線多工器（Connection Multiplexer）**。它在底層只維持少數極少量的實體 TCP Socket（通常為 1~2 條），透過單一連線同時並行管線化（Pipelining）發送成千上萬個並行執行緒的請求。

因此：**`ConnectionMultiplexer` 必須在整個應用程式生命週期中作為 Singleton 唯一執行個體共享！**

---

### 反模式一：混用 IDistributedCache 與原生客戶端時反覆建立底層連線

在同一個應用程式中，一部分模組注入 `IDistributedCache`，另一部分直接連線 `ConnectionMultiplexer`，若各自獨立初始化，會造成重複維護兩套長連線。

### 正確解法一：透過工廠將 Singleton 連線注入 IDistributedCache

透過 `ConnectionMultiplexerFactory` 讓 `IDistributedCache` 共享同一個全域 `ConnectionMultiplexer`：

~~~csharp
var registrations = new ServiceCollection();
registrations.AddStackExchangeRedisCache(options =>
{
    options.InstanceName = prefix;
    options.ConnectionMultiplexerFactory = () => Task.FromResult<IConnectionMultiplexer>(redis);
});
using var services = registrations.BuildServiceProvider();
IDistributedCache cache = services.GetRequiredService<IDistributedCache>();
await cache.SetStringAsync("product:1", "商品快取", new DistributedCacheEntryOptions
{
    AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(30)
});
Console.WriteLine("IDistributedCache: " + await cache.GetStringAsync("product:1"));
~~~

---

### 正確解法二：生產級 ConfigurationOptions 與抗網路抖動設定

在 `Program.cs` 註冊 Singleton Redis 服務時，必須精確配置超時、重連與 DNS 探測參數：

```csharp
// Program.cs: 現代 .NET 生產級 Redis 連線設定最佳實踐
var builder = WebApplication.CreateBuilder(args);

var redisConfig = new ConfigurationOptions
{
    EndPoints = { { "redis-primary.internal", 6379 } },
    Password = builder.Configuration["RedisPassword"],
    Ssl = false, // 雲端環境若啟用 TLS 則設為 true

    // 關鍵 1: 防止啟動時因 Redis 短暫離線而導致 Pod CrashLoop
    AbortOnConnectFail = false,

    // 關鍵 2: 縮短命令同步超時（預設 5000ms 太長，在高併發下會卡死執行緒）
    SyncTimeout = 1000,       // 1 秒超時立即快速失敗
    AsyncTimeout = 1000,
    ConnectTimeout = 3000,    // 連線握手最多等 3 秒

    // 關鍵 3: 心跳與連線自我癒合
    KeepAlive = 30,           // 每 30 秒發送 Ping 保活
    ConnectRetry = 3,

    // 連線佇列深度防護
    ResponseTimeout = 1000
};

var multiplexer = await ConnectionMultiplexer.ConnectAsync(redisConfig);
builder.Services.AddSingleton<IConnectionMultiplexer>(multiplexer);
builder.Services.AddSingleton(sp => sp.GetRequiredService<IConnectionMultiplexer>().GetDatabase());
```

---

### 正確解法三：採用 .NET 9/10 HybridCache 取代手動雙層快取

在過去，為了兼顧微秒級讀取與多 Pod 一致性，團隊得自己手寫 `IMemoryCache` 包裹 `IDistributedCache`。
在 .NET 9 與 .NET 10 中，官方推出了全新的 **`HybridCache`**：
1. **L1（本機記憶體）+ L2（Redis 分散式）自動串聯**。
2. **原生防快取擊穿（Built-in Stampede Protection / Single-flight）**：若多個並行請求同時未命中，同一 Pod 內部只有一個請求會打到資料庫，其餘請求自動等待共享結果！

```csharp
// 註冊原生 HybridCache
builder.Services.AddHybridCache(options =>
{
    options.MaximumPayloadBytes = 1024 * 1024; // 單一物件最大 1MB
    options.DefaultEntryOptions = new HybridCacheEntryOptions
    {
        Expiration = TimeSpan.FromMinutes(10),       // Redis (L2) 過期時間
        LocalCacheExpiration = TimeSpan.FromMinutes(2) // 本機 (L1) 過期時間
    };
});

// 在業務中使用極致簡潔的 GetOrCreateAsync
public class CatalogService
{
    private readonly HybridCache _cache;
    private readonly AppDbContext _db;

    public CatalogService(HybridCache cache, AppDbContext db)
    {
        _cache = cache;
        _db = db;
    }

    public async Task<ProductDto?> GetProductAsync(long id, CancellationToken ct)
    {
        // 自動先查 L1 記憶體 ➔ 若無再查 L2 Redis ➔ 若無自動防擊穿回源 DB 並同時回填 L1/L2！
        return await _cache.GetOrCreateAsync(
            $"product:{id}",
            async token => await _db.Products
                .AsNoTracking()
                .Where(p => p.Id == id)
                .Select(p => new ProductDto(p.Id, p.Name, p.Price))
                .FirstOrDefaultAsync(token),
            cancellationToken: ct);
    }
}
```

---

## 踩坑與避坑指南

### 1. SyncTimeout 預設過長引發執行緒池雪崩
- **踩坑點**：`StackExchange.Redis` 預設的 `SyncTimeout = 5000ms`。若 Redis 突然出現慢查詢，上百個同步呼叫（如 `StringGet`）會各自卡死 5 秒。這會迅速耗盡 .NET ThreadPool 的工作執行緒，導致整個 Web 伺服器連健康檢查（Health Check）都無法處理。
- **規則**：生產環境必須將 `SyncTimeout` 與 `AsyncTimeout` 調降至 **1,000ms 或更低**。

### 2. ThreadPool 最小執行緒數調優（MinThreads）
- .NET ThreadPool 在面對突波請求時，其預設的擴展算法極為保守（每秒僅注入 1~2 個新執行緒）。當併發突增時，大量任務會排隊等待 Worker Thread，進而觸發 StackExchange.Redis 的 `TimeoutException (qs: ..., in: ..., mgr: ...)`。
- **解法**：在高併發服務的 `Program.cs` 啟動時主動調高最小執行緒數：
  ```csharp
  ThreadPool.SetMinThreads(200, 200);
  ```

---

## 線上排查指令

### 1. 查詢 Redis 伺服器當前連線數與來源客戶端

```bash
# 檢查當前連線總數與歷史連線峰值
redis-cli INFO clients
```
重點關注：
- `connected_clients`：當前連線數。若遠大於 `Pod數量 × 2`，通常代表存在短命連線洩漏！
- `blocked_clients`：正在等待 BLPOP 等阻塞指令的客戶端數量。

```bash
# 查看所有已連線客戶端的詳細資訊（來源 IP、空閒秒數）
redis-cli CLIENT LIST | head -n 10
```

### 2. 即時觀測 .NET 應用端執行緒池佇列積壓

當 Redis 出現 Timeout 報錯時，使用 `dotnet-counters` 驗證是否為本地 ThreadPool 飢餓：
```bash
dotnet-counters monitor -p $(pgrep -f "Ecommerce.Api.dll") \
  --counters System.Runtime
```
關注 `threadpool-queue-length` 是否大於 0。若佇列持續積壓，代表是本機執行緒池阻塞而非 Redis 伺服器問題。

### 3. Prometheus / Grafana 監控指標

```text
# Redis 連線數佔比超過上限 75%
(redis_connected_clients / redis_config_maxclients) > 0.75

# .NET Redis 操作逾時報錯計數
rate(redis_timeouts_total[1m]) > 0
```
