---
title: "有限重試、死信與冪等處理"
description: "區分可恢復與無法處理的訊息，用確認、退避、死信及資料庫約束避免無限循環。"
articleId: "rabbitmq-retries-idempotency"
topic: "rabbitmq"
category: "rabbitmq-reliability"
order: 5
tags:
  - "retry"
  - "backoff"
  - "DLX"
  - "DLQ"
  - "dead letter"
  - "冪等"
  - "idempotency"
  - "Inbox"
  - "poison message"
difficulty: "intermediate"
learningDepth: "deep"
prerequisites:
  - "rabbitmq-acknowledgements"
relatedArticles:
  - "architecture-outbox-inbox"
  - "redis-concurrency"
  - "engineering-cache-messaging-tests"
applicableVersions: "RabbitMQ 4.x／AMQP 0-9-1／RabbitMQ.Client 7.x／.NET 10。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-10"
takeaway: "重試需要次數與退避上限；消費成功與去重紀錄必須一起提交，才能安全面對重送。"
sources:
  - title: "RabbitMQ：Dead Letter Exchanges"
    url: "https://www.rabbitmq.com/docs/dlx"
  - title: "RabbitMQ：Reliability"
    url: "https://www.rabbitmq.com/docs/reliability"
  - title: "RabbitMQ：Quorum Queues"
    url: "https://www.rabbitmq.com/docs/quorum-queues"
  - title: "Microsoft Learn：訂閱與冪等"
    url: "https://learn.microsoft.com/en-us/dotnet/architecture/microservices/multi-container-microservice-net-applications/subscribe-events"
---

## 案發現場

在以訊息佇列驅動的非同步架構中，如果錯誤處理設計不當，輕則引發全站死鎖風暴，重則造成嚴重的重複扣款與資料損壞。

典型災難現場一：**「毒訊息（Poison Message）」引發的無窮 Requeue 活鎖死迴圈**。
生產環境接收到了一筆上游發送的損壞資料（例如 JSON 缺少必要欄位，反序列化必然拋出例外）。消費端工程師在 `catch` 區塊中寫下了這行看似負責任的代碼：
```csharp
// 致命反模式：發生未捕捉例外時，無腦 requeue: true
await channel.BasicNackAsync(deliveryTag: ea.DeliveryTag, multiple: false, requeue: true);
```
這行代碼引爆了系統自殘：
1. Consumer 報錯 ➔ 發送 Nack 并要求 Requeue。
2. RabbitMQ 立即將這筆壞訊息放回佇列最前端。
3. Consumer 毫無延遲地再次拉取這筆壞訊息 ➔ 再次拋錯 ➔ 再次 Requeue。
**每秒鐘這筆壞訊息被反覆處理與拋錯 5,000 次！** Consumer 的 CPU 飆上 100%，RabbitMQ 的日誌被塞爆數十 GB，而隊列中排在後面的數萬筆正常訂單訊息被徹底卡死，系統陷入完全癱瘓。

典型災難現場二：**網路抖動重送導致的重複扣款**。
當 Consumer 處理完扣款業務後，在發送 Ack 的前一刻網路短暫抖動斷開。RabbitMQ 判定消費者離線，自動將該訊息重新投遞給另一個 Consumer。由於缺乏冪等性防護，第二個 Consumer 再次對同一個訂單執行扣款，引發重大帳務客訴。

---

## 反模式與正確解法

### 1. 錯誤類型分類與處置矩陣

並非所有錯誤都應該重試！在消費端必須精確區分錯誤類型：

| 錯誤類型 | 特徵與成因 | 處置策略 |
| :--- | :--- | :--- |
| **暫態錯誤（Transient Faults）** | 外部微服務網路短暫抖動、資料庫連線逾時、資料庫死鎖。 | **有限指數退避重試（Backoff Retry）**。 |
| **永久錯誤（Permanent Faults）** | JSON 格式損壞、型別轉換失敗、違反商業約束（如商品已下架）。 | **直接轉發死信（Dead Letter）**，絕不原隊列重試！ |

---

### 正確解法一：三級有界延時重試與死信隊列（DLX / DLQ）

透過 RabbitMQ 的 **Dead Letter Exchange (DLX)** 與訊息 TTL 機制，建構階梯式重試管道，將毒訊息隔離：

```text
[ Work Queue (正常工作佇列) ] 
       │ (消費失敗，且未達最大次數)
       ▼
[ Retry Queue (帶 TTL 例如 500ms，無消費者) ] ── (TTL到期死信轉發) ──> [ Work Queue (重試) ]
       │
       ▼ (超過最大重試次數例如 3 次)
[ Dead Letter Queue (死信佇列 DLQ) ] ──> 人工檢視 / 報警修復
```

拓撲宣告與延時重試邏輯：
```csharp
// 宣告死信與延時重試拓撲
public async Task DeclareRetryTopologyAsync(IChannel channel, CancellationToken ct)
{
    // 1. 正常工作佇列：設定死信交換機為 failed-exchange
    var workArgs = new Dictionary<string, object?>
    {
        ["x-queue-type"] = "quorum",
        ["x-dead-letter-exchange"] = "failed.events",
        ["x-dead-letter-routing-key"] = "orders.dead"
    };
    await channel.QueueDeclareAsync("orders.work", durable: true, exclusive: false, autoDelete: false, arguments: workArgs, cancellationToken: ct);

    // 2. 延時重試佇列：設定 1,000ms TTL，到期自動死信回 orders.events
    var retryArgs = new Dictionary<string, object?>
    {
        ["x-message-ttl"] = 1000, // 延遲 1 秒後重試
        ["x-dead-letter-exchange"] = "orders.events",
        ["x-dead-letter-routing-key"] = "orders.placed"
    };
    await channel.QueueDeclareAsync("orders.retry.1s", durable: true, exclusive: false, autoDelete: false, arguments: retryArgs, cancellationToken: ct);

    // 3. 最終死信佇列（DLQ）
    await channel.QueueDeclareAsync("orders.dead", durable: true, exclusive: false, autoDelete: false, cancellationToken: ct);
}
```

---

### 正確解法二：Quorum Queue 原生 x-delivery-limit（極簡重試）

在現代 RabbitMQ 4.x 中，若使用 **Quorum Queue**，無需手動建立複雜的 TTL 重試隊列，直接配置 `x-delivery-limit`：

```csharp
// Quorum Queue 原生支援投遞次數限制
var quorumArgs = new Dictionary<string, object?>
{
    ["x-queue-type"] = "quorum",
    ["x-delivery-limit"] = 3, // 最多投遞 3 次，第 4 次失敗自動直接進 DLQ！
    ["x-dead-letter-exchange"] = "failed.events"
};
await channel.QueueDeclareAsync("orders.quorum.work", durable: true, exclusive: false, autoDelete: false, arguments: quorumArgs, cancellationToken: ct);
```

---

### 正確解法三：消費端事務性收件箱（Transactional Inbox）防重冪等

利用全域唯一的 `MessageId` 與資料庫唯一索引，保證即使訊息因網路抖動被重複投遞 10 次，核心業務也只會執行一次：

```csharp
// 正確解法：本地交易同時寫入業務與 Inbox 記錄
public async Task<bool> ProcessIdempotentAsync(
    Guid messageId, 
    Func<NpgsqlTransaction, Task> businessAction, 
    CancellationToken ct)
{
    await using var conn = await _dataSource.OpenConnectionAsync(ct);
    await using var tx = await conn.BeginTransactionAsync(ct);

    // 1. 嘗試插入收件箱記錄（message_id 為主鍵唯一鍵）
    const string sql = """
        INSERT INTO inbox_messages (message_id, handler_name, processed_at)
        VALUES (@MessageId, 'OrderPaymentHandler', NOW())
        ON CONFLICT (message_id) DO NOTHING;
        """;

    var affected = await conn.ExecuteAsync(new CommandDefinition(sql, new { messageId }, transaction: tx, cancellationToken: ct));

    if (affected == 0)
    {
        // 該訊息已經成功處理過，直接回滾並視為成功（冪等安全！）
        await tx.RollbackAsync(ct);
        return false;
    }

    // 2. 執行核心業務（如扣款落庫）
    await businessAction(tx);

    // 3. 業務與 Inbox 同生共死提交
    await tx.CommitAsync(ct);
    return true;
}
```

---

## 踩坑與避坑指南

### 1. 毒訊息的無腦 requeue 懲罰
- **鐵律**：在消費者 `catch` 例外區塊中，**除非是為了等待某個必定在數毫秒內恢復的內部記憶體狀態，否則永遠不要使用 `requeue: true`**！
- 失敗時應優先發送 `requeue: false`（觸發死信轉發）或主動發送至專屬的延遲重試隊列。

### 2. 避免重複消費與 Ack 洩漏
- 若 Consumer 在處理過程中拋出例外，必須確保一定會執行 `BasicNackAsync` 或 `BasicAckAsync`（透過 `finally` 區塊包裹）。
- 若發生例外卻什麼都沒發送，該訊息會在 RabbitMQ 處於 `unacknowledged` 狀態卡死，直到該 Consumer 進程終止。

---

## 線上排查指令

### 1. 檢測死信佇列（DLQ）積壓

```bash
# 檢查死信佇列是否有堆積（代表有處理失敗的毒訊息！）
rabbitmqctl list_queues name messages | grep "dead"
```
若 `orders.dead` 訊息數大於 0，代表有需要人工介入排查修復的異常資料。

### 2. 檢測 Quorum Queue 達到投遞上限被丟棄的訊息

```bash
# 查看死信原因與 Reject 計數
rabbitmq-queues quorum_status orders.quorum.work
```

### 3. Prometheus / Grafana 監控指標

```text
# 死信隊列產生速率（大於 0 需立即發出警告）
rate(rabbitmq_queue_messages_published_total{queue="orders.dead"}[1m]) > 0

# 訊息被拒絕（Nack without requeue）頻率
rate(rabbitmq_queue_messages_rejected_total[1m]) > 0.1
```
