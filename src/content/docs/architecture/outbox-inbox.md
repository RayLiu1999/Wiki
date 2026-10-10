---
title: "Outbox、Inbox 與最終一致性"
description: "用本地交易保存待發布事件與消費結果，分析資料庫提交、Broker 確認及 Ack 之間的故障窗口。"
articleId: "architecture-outbox-inbox"
topic: "architecture"
category: "application-patterns"
order: 4
tags:
  - "Transactional Outbox"
  - "Inbox"
  - "冪等"
  - "Integration Event"
  - "PostgreSQL"
  - "transaction"
  - "MessageId"
  - "最終一致性"
difficulty: "intermediate"
learningDepth: "deep"
prerequisites:
  - "data-access-transactions"
  - "rabbitmq-acknowledgements"
  - "architecture-communication-boundaries"
relatedArticles:
  - "rabbitmq-retries-idempotency"
  - "engineering-cache-messaging-tests"
  - "redis-cache-aside"
applicableVersions: "以 .NET 10、RabbitMQ 4.x、PostgreSQL 18 說明；driver／EF provider 的主版相容性須各自核對。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-10"
takeaway: "本地交易保護資料與意圖，Outbox 與 Inbox 協助恢復；跨邊界仍可能重送，因此結果必須冪等。"
sources:
  - title: "Microsoft Learn：非同步訊息與 Outbox"
    url: "https://learn.microsoft.com/en-us/dotnet/architecture/microservices/architect-microservice-container-applications/asynchronous-message-based-communication"
  - title: "Microsoft Learn：訂閱與冪等"
    url: "https://learn.microsoft.com/en-us/dotnet/architecture/microservices/multi-container-microservice-net-applications/subscribe-events"
  - title: "PostgreSQL：Constraints"
    url: "https://www.postgresql.org/docs/18/ddl-constraints.html"
  - title: "RabbitMQ：Reliability"
    url: "https://www.rabbitmq.com/docs/reliability"
---

## 案發現場

在分散式系統或微服務架構中，最常發生的重大事故莫過於**「雙寫一致性斷裂（Dual-Write Failure）」**。

典型案發現場：
在使用者建立訂單後，系統必須發送整合事件通知庫存服務扣減庫存、並通知促銷服務核銷折價券。開發團隊寫下了看似合情合理的代碼：

```csharp
// 致命的雙寫反模式
await using var tx = await _db.Database.BeginTransactionAsync();

// 1. 寫入訂單至資料庫
_db.Orders.Add(order);
await _db.SaveChangesAsync();
await tx.CommitAsync(); // 資料庫交易成功提交！

// 2. 發送整合事件到 RabbitMQ
// 致命故障窗口：若此時 RabbitMQ 網路抖動、連線逾時、或 Pod 突然 Crash 重啟...
await _bus.PublishAsync(new OrderCreatedIntegrationEvent(order.Id));
```

在這個情境下，資料庫中的訂單已經正式成立，但發送至 RabbitMQ 的操作失敗拋出例外。結果：**訂單成立了，但庫存服務從未收到扣庫存通知，折價券也未被核銷**。

工程師試圖將順序顛倒：「先發送 RabbitMQ 訊息，成功後再提交資料庫交易」。
結果引發了更嚴重的災難：訊息剛發送成功，資料庫提交時卻遭遇唯一鍵衝突回滾。消費端庫存服務已經收到訊息並扣減了庫存，但資料庫中**根本沒有這張訂單**！

在分散式環境下，資料庫與訊息佇列（Message Broker）分屬兩個獨立的儲存系統，跨越網路邊界的兩步操作**在物理上不可能具備單一原子性**。

---

## 反模式與正確解法

### 反模式一：分散式雙寫與妄想依賴 2PC / XA 交易

試圖透過跨網路的分散式二階段提交（2PC / XA Transactions）來綁定資料庫與 Message Broker，不僅吞吐量低落、鎖定時間極長，且在雲端環境（Kubernetes / Serverless / Cloud SQL）中絕大多數基礎設施均不支援 XA 協議。

### 正確解法一：事務性發件箱（Transactional Outbox 模式）

**核心哲學：將「發送訊息的意圖」與「業務資料的變更」，在同一個本地資料庫交易（Local ACID Transaction）中原子提交！**

在資料庫建立一張 `outbox_messages` 表，並在同一筆交易內同時寫入訂單與待發布訊息：

~~~csharp
await using var order = new NpgsqlCommand(
    "INSERT INTO orders (id, product_id, quantity, created_at) VALUES ($1, $2, $3, $4)", connection, transaction);
order.Parameters.AddWithValue(message.OrderId);
order.Parameters.AddWithValue(message.ProductId);
order.Parameters.AddWithValue(message.Quantity);
order.Parameters.AddWithValue(message.OccurredAt);
await order.ExecuteNonQueryAsync(token);

await using var outbox = new NpgsqlCommand(
    "INSERT INTO outbox_messages (message_id, order_id, payload, occurred_at, trace_parent) VALUES ($1, $2, $3, $4, $5)",
    connection, transaction);
outbox.Parameters.AddWithValue(message.MessageId);
outbox.Parameters.AddWithValue(message.OrderId);
outbox.Parameters.AddWithValue(NpgsqlDbType.Jsonb, JsonSerializer.Serialize(message, JsonDefaults.Options));
outbox.Parameters.AddWithValue(message.OccurredAt);
outbox.Parameters.Add(new NpgsqlParameter { NpgsqlDbType = NpgsqlDbType.Text, Value = (object?)Activity.Current?.Id ?? DBNull.Value });
await outbox.ExecuteNonQueryAsync(token);
await transaction.CommitAsync(token);
~~~

---

### 正確解法二：非同步 Outbox 發布背景工作（搭配 SKIP LOCKED）

由專屬的背景服務（`BackgroundService`）定期自 `outbox_messages` 取出未發布訊息，發送至 RabbitMQ 並標記完成：

```csharp
// 生產級 Outbox 發布處理器：利用 SKIP LOCKED 支援多 Pod 平行安全處理
public class OutboxProcessor : BackgroundService
{
    private readonly DbDataSource _dataSource;
    private readonly IMessagePublisher _publisher;
    private readonly ILogger<OutboxProcessor> _logger;

    public OutboxProcessor(
        DbDataSource dataSource, 
        IMessagePublisher publisher, 
        ILogger<OutboxProcessor> logger)
    {
        _dataSource = dataSource;
        _publisher = publisher;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessOutboxBatchAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "處理 Outbox 訊息時發生異常");
            }

            await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken);
        }
    }

    private async Task ProcessOutboxBatchAsync(CancellationToken ct)
    {
        const string selectSql = """
            SELECT message_id, payload, trace_parent
            FROM outbox_messages
            WHERE published_at IS NULL
            ORDER BY occurred_at ASC
            LIMIT 50
            FOR UPDATE SKIP LOCKED;
            """;

        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);

        var messages = (await conn.QueryAsync<OutboxItem>(
            new CommandDefinition(selectSql, transaction: tx, cancellationToken: ct))).ToList();

        foreach (var msg in messages)
        {
            await _publisher.PublishAsync("order.placed", msg.Payload, ct);

            await conn.ExecuteAsync(
                "UPDATE outbox_messages SET published_at = NOW() WHERE message_id = @MessageId",
                new { msg.MessageId },
                transaction: tx);
        }

        await tx.CommitAsync(ct);
    }
}
```

---

### 正確解法三：消費端事務性收件箱（Transactional Inbox 模式）

在分散式訊息投遞中，**「至少送達一次（At-least-once Delivery）」是基本定律**——網路抖動或 Consumer 在 ACK 前 Crash，會導致同一則訊息被重複投遞。

消費端必須實作 **Transactional Inbox**，利用訊息的唯一 `MessageId` 進行防重校驗：

~~~csharp
await using var inbox = new NpgsqlCommand(
    "INSERT INTO inbox_messages (consumer_name, message_id) VALUES ('notifications-v1', $1) ON CONFLICT DO NOTHING",
    connection, transaction);
inbox.Parameters.AddWithValue(message.MessageId);
if (await inbox.ExecuteNonQueryAsync(token) == 0)
{
    await transaction.CommitAsync(token);
    return false;
}

await using var notification = new NpgsqlCommand(
    "INSERT INTO notifications (order_id, message_id) VALUES ($1, $2) ON CONFLICT (order_id) DO NOTHING",
    connection, transaction);
notification.Parameters.AddWithValue(message.OrderId);
notification.Parameters.AddWithValue(message.MessageId);
await notification.ExecuteNonQueryAsync(token);
await transaction.CommitAsync(token);
~~~

---

## 踩坑與避坑指南

### 1. Outbox 高頻輪詢對資料庫的 CPU 負擔
- **踩坑點**：若系統包含 30 個 Pod，每個 Pod 每秒都執行一次 `SELECT ... FROM outbox_messages`，在無訊息時會造成資料庫不必要的每秒 30 次查詢。
- **最佳實踐**：
  - 輕量架構：採用單一專屬 Worker 或搭配 Postgres `LISTEN/NOTIFY` 喚醒 Worker。
  - 大規模架構：採用 **CDC（Change Data Capture）** 工具（如 Debezium），直接監聽資料庫 WAL 日誌串流並轉發至 Kafka/RabbitMQ，完全零資料庫輪詢開銷。

### 2. Outbox 資料保留與歸檔策略
- `outbox_messages` 表如果只增不減，半年內會累積數千萬列，拖慢查詢。
- 必須配置每日排程分塊清理（Chunked Delete），將 `published_at` 超過 7 天的歷史記錄安全清除。

### 3. 發布與消費的失敗隔離
- 若某則訊息格式損壞導致發布反覆崩潰，必須在 Outbox 加入 `retry_count` 與 `error` 欄位。超過 3 次重試後標記為 `Failed`，並觸發告警，切勿阻擋後續其他正常訊息的處理。

---

## 線上排查指令

### 1. 查詢卡死或延遲未發布的 Outbox 訊息

```sql
-- 找出超過 30 秒仍未發布的堆積訊息
SELECT message_id, occurred_at, trace_parent
FROM outbox_messages
WHERE published_at IS NULL
  AND occurred_at < NOW() - INTERVAL '30 seconds'
ORDER BY occurred_at ASC
LIMIT 10;
```

### 2. 檢測 Inbox 訊息重複消費與防重成效

```sql
-- 統計 Inbox 總處理量與最近接收記錄
SELECT consumer_name, count(*) AS total_processed
FROM inbox_messages
GROUP BY consumer_name;
```

### 3. Prometheus / Grafana 監控指標

```text
# Outbox 未處理訊息堆積量告警（大於 100 筆即需注意 Worker 是否卡死）
outbox_unprocessed_messages_count > 100

# 訊息從產生到發布的平均延遲（秒）
outbox_message_publishing_latency_seconds > 5
```
