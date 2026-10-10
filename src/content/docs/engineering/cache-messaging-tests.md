---
title: "快取與訊息系統的測試及故障診斷"
description: "用真實容器與可觀察結果，驗證商品快取、Outbox、重試、重送及模擬通知的恢復。"
articleId: "engineering-cache-messaging-tests"
topic: "engineering"
category: "testing"
order: 3
tags: ["整合測試", "Redis", "RabbitMQ", "PostgreSQL", "Outbox", "故障演練", "OpenTelemetry", "traceparent", "metrics", "DLQ"]
difficulty: "intermediate"
prerequisites: ["engineering-business-tests", "engineering-metrics-tracing", "architecture-outbox-inbox", "redis-reliability"]
relatedArticles: ["rabbitmq-retries-idempotency", "rabbitmq-queues-ordering", "redis-cache-aside"]
applicableVersions: "以 .NET 10、Redis 8.2.10、RabbitMQ 4.3.6、PostgreSQL 18.6 的教學案例說明。"
verifiedWith: "已執行隔離容器、HTTP 與故障恢復測試，並以 ActivityListener 核對 traceparent；未驗證 OpenTelemetry exporter、Collector 或正式環境監控。"
lastReviewed: "2026-10-10"
takeaway: "測試應確認使用者需要的資料與結果；重送、回滾、服務停止與重啟要用真實邊界驗證。"
noteDates: ["2026-10-10"]
sources: [{"title": "Microsoft Learn：測試策略", "url": "https://learn.microsoft.com/en-us/ef/core/testing/choosing-a-testing-strategy"}, {"title": "RabbitMQ：Reliability", "url": "https://www.rabbitmq.com/docs/reliability"}, {"title": "Redis：Persistence", "url": "https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/"}, {"title": "Microsoft Learn：分散式追蹤", "url": "https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing-instrumentation-walkthroughs"}, {"title": "OpenTelemetry：.NET Instrumentation", "url": "https://opentelemetry.io/docs/languages/dotnet/instrumentation/"}]
learningDepth: "deep"
---

在電商微服務架構中，Redis 快取與 RabbitMQ 訊息佇列承載了高併發流量削峰與最終一致性保障。然而，涉及網路斷線、訊息確認（ACK/NACK）、佇列積壓與死信處理（DLQ）的異常邊界，純記憶體單元測試或 Mock 框架根本無能為力。我們必須藉助真實的容器化基礎設施與混沌故障演練（Failure Drills），以可觀察的業務結果驗證系統的自我修復與韌性。

## 案發現場

某電商在促銷活動開跑首日，因底層雲端機房網路短暫抖動 5 秒鐘，引發了一連串毀滅性的連鎖故障：

1. **快取斷線引發業務直接拋錯（降級機制失效）**：當 Redis 主節點進行容錯移轉時，商品查詢 API 內部拋出 `RedisTimeoutException`。由於程式碼中未正確捕獲快取異常並回源資料庫，前端買家瀏覽商品目錄時直接遭遇 HTTP 500，購物車流量瞬間腰斬。
2. **訊息無預警丟失（缺少 Publisher Confirm）**：訂單服務在建立訂單後，將事件發送到 RabbitMQ。然而在網路中斷瞬間，發布者未開啟 Publisher Confirm 機制，程式以為訊息已送達而將交易完成，實際上 Broker 根本未持久化該筆訊息，導致數十筆訂單從未觸發扣款與出貨通知。
3. **未 Ack 訊息被 Requeue 引發重複請款**：背景 Worker 在處理扣款非同步事件時，連線因長查詢逾時中斷。RabbitMQ 偵測到 Consumer 離線，將尚未收到 ACK 的訊息重新放回佇列（Requeue）。新接手的 Worker 重新消費該訊息，而系統缺乏消費端冪等（Idempotent Consumer）保護，導致同一筆訂單向消費者信用卡連續請款兩次。
4. **毒訊息癱瘓整個訊息通道（Poison Message Storm）**：一筆格式損壞的 JSON 訂單訊息進入佇列，Worker 每次還原序列化失敗就拋出未處理例外並自動 Nack Requeue。這筆「毒訊息」在隊首以每秒上千次的頻率被無限重試，造成 Worker CPU 100% 飆滿，後續正常的數萬筆訂單全數被堵死。

```mermaid
flowchart TD
    subgraph TestEnvironment["Testcontainers 整合測試邊界"]
        API["ASP.NET Core API / Worker (被測目標)"]
        
        API -->|1. 寫入訂單與 Outbox (同一交易)| PG[("真實 PostgreSQL 容器")]
        API -->|2. 讀取快取 / 模擬故障降級| Redis[("真實 Redis 容器 (可動態 Stop)")]
        API -->|3. 發布與確認事件| RMQ[("真實 RabbitMQ 容器 (Publisher Confirm)")]
        
        RMQ -->|4. 派發至 Consumer (Inbox 冪等去重)| Consumer["背景消費 Worker"]
        Consumer -->|5. 毒訊息達重試上限| DLQ["Dead Letter Queue (死信佇列)"]
    end
```

## 反模式與正確解法

### 反模式一：使用 Mock 偽造 Redis 與 RabbitMQ，掩蓋真實網路語意

許多團隊在測試訊息佇列時，使用 NSubstitute 替換 `IConnection` 與 `IModel`，或者用 In-Memory Queue 模擬 RabbitMQ。這種測試完全無法驗證 AMQP 連線重試、TCP 心跳逾時、Prefetch Count 流量控制、未確認訊息重回佇列（Unacked Requeue），以及 Redis 跨分區連線池阻塞等核心問題。

#### 正確解法：採用 Testcontainers.NET 啟動真實容器進行整合驗證

利用 `Testcontainers.PostgreSql`、`Testcontainers.Redis` 與 `Testcontainers.RabbitMq` 在測試生命週期中動態建立完全隔離的真實中介軟體容器：

```csharp
public sealed class OrderMessagingIntegrationTests : IAsyncLifetime
{
    private readonly PostgreSqlContainer _pgContainer = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .Build();

    private readonly RabbitMqContainer _rmqContainer = new RabbitMqBuilder()
        .WithImage("rabbitmq:3.13-alpine")
        .Build();

    public async Task InitializeAsync()
    {
        await Task.WhenAll(_pgContainer.StartAsync(), _rmqContainer.StartAsync());
    }

    public async Task DisposeAsync()
    {
        await Task.WhenAll(_pgContainer.DisposeAsync().AsTask(), _rmqContainer.DisposeAsync().AsTask());
    }

    [Fact]
    public async Task DuplicateMessage_WhenConsumedTwice_ShouldProcessOnlyOnceViaInbox()
    {
        // Arrange：透過真實 RabbitMQ 建立消費者
        var eventId = Guid.NewGuid();
        var message = new OrderCreatedEvent(eventId, OrderId.New(), CustomerId.New(), 100m);

        var consumer = new IdempotentOrderConsumer(
            _pgContainer.GetConnectionString(), 
            _rmqContainer.GetConnectionString());

        // Act：模擬因網路中斷導致同一筆訊息重複投遞兩次
        await consumer.ProcessMessageAsync(message);
        await consumer.ProcessMessageAsync(message); // 第二次投遞

        // Assert：斷言真實資料庫中的處理紀錄與通知次數僅有 1 筆！
        var processedCount = await consumer.GetInboxRecordCountAsync(eventId);
        Assert.Equal(1, processedCount);
    }
}
```

### 反模式二：快取連線失敗時拋出例外阻斷請求，未驗證優雅降級

快取本質是效能優化層，絕對不能成為單點故障（SPOF）。當 Redis 叢集發生維護、網路分割或重啟時，系統必須能安全降級至資料庫回源，保證核心業務可用。

#### 正確解法：混沌故障演練（Chaos Fault Injection）驗證降級

在整合測試中主動暫停 Redis 容器（`await _redisContainer.StopAsync()`），驗證 API 是否能捕捉例外、記錄 Warning 日誌、無縫回源查詢 PostgreSQL，並在 Redis 恢復後自動重新建立連線池：

```csharp
[Fact]
public async Task GetProduct_WhenRedisGoesDown_ShouldFallbackToDatabaseGracefully()
{
    // Arrange：先預熱資料庫
    var service = new ProductCatalogService(_dbConn, _redisConn);

    // Act 1：正常狀態下讀取，快取應生效
    var product1 = await service.GetProductAsync(42);
    Assert.True(product1.IsServedFromCache);

    // 模擬中介軟體故障：強制停止 Redis 容器！
    await _redisContainer.StopAsync();

    // Act 2：Redis 停機時再次請求，驗證是否自動降級回源資料庫且不拋出 500！
    var product2 = await service.GetProductAsync(42);
    Assert.NotNull(product2);
    Assert.False(product2.IsServedFromCache); // 證明成功降級至資料庫

    // 恢復 Redis 容器
    await _redisContainer.StartAsync();
}
```

### 反模式三：未處理毒訊息，導致佇列無限重試死循環

當訊息內容損壞或遇到不可恢復的邏輯錯誤時，若 Consumer 盲目回傳 `BasicNack(requeue: true)`，訊息會立刻回到隊首被同一 Consumer 或其他 Consumer 再次拾起，造成整個叢集 CPU 跑滿且堵塞正常訊息。

#### 正確解法：指數退避重試與死信佇列（Dead Letter Exchange, DLX）

- **重試計數**：在訊息標頭中維護重試次數（例如 `x-retry-count`），透過延遲佇列（Delay Exchange）或 Polly 進行有限重試（如最多 3 次）。
- **轉移死信（DLQ）**：超過最大重試次數後，執行 `BasicNack(requeue: false)`，讓 RabbitMQ 依據宣告的 `x-dead-letter-exchange` 自動將毒訊息路由至專用的死信佇列（DLQ），並觸發告警供維運人員人工介入分析。

## 踩坑與避坑指南

### 1. RabbitMQ 宣告參數不相容引發 PRECONDITION_FAILED
在測試或生產環境中，若試圖以不同的參數（例如修改了 `x-dead-letter-exchange` 或 `x-message-ttl`）重新宣告同一個既有佇列，RabbitMQ 會直接關閉 Channel 並拋出 `406 PRECONDITION_FAILED`。
- **避坑建議**：佇列與交換機的定義必須在專案中統一代碼管理；在整合測試中，為每次測試案例使用唯一的佇列名稱（如 `test-queue-{Guid.NewGuid()}`）以避免衝突。

### 2. Outbox 資料表與商務邏輯的同一交易原子性
若在 API 中先執行了 `await _dbContext.SaveChangesAsync()`，接著在交易外才將 Outbox 記錄寫入資料庫，一旦應用程式在兩者之間崩潰，將造成「訂單已建立但事件未寫入 Outbox」的永久不一致。
- **避坑建議**：訂單實體與 Outbox 訊息必須使用**同一個 DbContext 交易實例**在單次 `SaveChangesAsync` 中完成提交。

### 3. Testcontainers 在 CI 伺服器上的 Docker-in-Docker 權限
在 GitHub Actions 或 GitLab CI 中執行 Testcontainers 時，CI 容器必須具備存取 Docker Daemon 的權限（掛載 `/var/run/docker.sock`），且需允許 Ryuk 資源清理守護程序啟動。
- **避坑建議**：在 CI 配置中設定 `TESTCONTAINERS_RYUK_DISABLED=false`，確保測試崩潰時測試容器與磁碟能被自動徹底銷毀，避免 CI 主機磁碟爆滿。

## 線上排查指令

針對 RabbitMQ 佇列積壓、Unacked 訊息卡死與 Redis 快取故障，使用下列指令排查：

```bash
# 1. 查詢 RabbitMQ 所有佇列狀態（重點觀察 Ready 與 Unacknowledged 訊息數）
rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers

# 2. 檢視死信佇列（DLQ）中的堆積訊息數量
rabbitmqctl list_queues name messages | grep "dead-letter"

# 3. 測試 Redis 連線延遲與即時統計數據
redis-cli -h 127.0.0.1 -p 6379 ping
redis-cli -h 127.0.0.1 -p 6379 info stats | grep -E "total_commands_processed|keyspace_hits|keyspace_misses"

# 4. 監控 Redis 即時慢查詢紀錄（排查是否有人執行高耗時 KEYS 或 FLUSH 指令）
redis-cli -h 127.0.0.1 -p 6379 slowlog get 10

# 5. 執行整合測試並指定單一失敗用例深入除錯
dotnet test tests/DevWiki.Ecommerce.IntegrationTests/ \
    --filter "FullyQualifiedName~GetProduct_WhenRedisGoesDown" \
    --logger "console;verbosity=detailed"
```
