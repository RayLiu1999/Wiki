---
title: "Ack、Publisher Confirm 與可靠傳遞"
description: "拆開發布與消費的確認邊界，理解持久化、退回、重送、Delivery Tag 與 Prefetch。"
articleId: "rabbitmq-acknowledgements"
topic: "rabbitmq"
category: "rabbitmq-integration"
order: 4
tags:
  - "Ack"
  - "Nack"
  - "Publisher Confirms"
  - "mandatory"
  - "durable"
  - "persistent"
  - "prefetch"
  - "at-least-once"
difficulty: "intermediate"
learningDepth: "deep"
prerequisites:
  - "rabbitmq-dotnet-integration"
  - "data-access-transactions"
relatedArticles:
  - "rabbitmq-retries-idempotency"
  - "architecture-outbox-inbox"
  - "rabbitmq-queues-ordering"
applicableVersions: "RabbitMQ 4.x／AMQP 0-9-1／RabbitMQ.Client 7.x／.NET 10。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-10"
takeaway: "發布確認與消費確認是兩段獨立責任；穩定 MessageId 與冪等結果補上重送帶來的風險。"
sources:
  - title: "RabbitMQ：Acknowledgements and Confirms"
    url: "https://www.rabbitmq.com/docs/confirms"
  - title: "RabbitMQ：Reliability"
    url: "https://www.rabbitmq.com/docs/reliability"
  - title: "RabbitMQ：Consumer Prefetch"
    url: "https://www.rabbitmq.com/docs/consumer-prefetch"
---

## 案發現場

在訊息驅動系統中，「訊息遺失」往往是後端工程師最難以向業務主管交代的嚴重事故。

典型災難現場一：**自動確認（AutoAck）導致的資料大蒸發**。
在訂單消費端微服務中，工程師使用簡便的預設設定：
```csharp
// 致命反模式：開啟 autoAck: true
await channel.BasicConsumeAsync(queue: "orders.work", autoAck: true, consumer: consumer);
```
上線某天夜間，促銷活動帶來大量流量，Consumer 剛自 RabbitMQ 一口氣拉取了 300 筆訂單。當 Consumer 正在逐筆呼叫金流扣款與寫入資料庫時，容器因記憶體不足（OOM）被 Kubernetes 強制重啟。
由於 `autoAck: true` 的機制是：**只要 RabbitMQ 將訊息發送到 TCP Socket 的瞬間，就立刻在 Broker 端將該訊息標記為完成並永久刪除**！
這意味著：**這 300 筆尚未處理完畢的訂單訊息全部憑空消失**，RabbitMQ 認為已完成，資料庫中卻毫無紀錄，造成不可逆的資料斷裂。

典型災難現場二：**發布端「發完即忘（Fire-and-Forget）」**。
在 Producer 端，程式碼呼叫 `BasicPublishAsync` 後便認為「發布成功」。然而若剛好碰上 RabbitMQ 伺服器磁碟空間用盡觸發警報（Disk Alarm Blocked）、或發生網路斷開，Broker 拒絕接收訊息，Producer 卻完全無從得知，誤以為下游正在處理。

---

## 反模式與正確解法

### 1. 訊息可靠性全鏈路確認邊界

在 AMQP 中，可靠傳遞由兩段**完全獨立**的確認機制所保障：

```text
[ Producer ] ─── 1. Publisher Confirm ───> [ RabbitMQ Broker ]
                                                   │
                                            2. 持久化 (Durable Queue + Persistent Message)
                                                   │
[ Consumer ] <─── 3. Consumer Manual Ack ── [ RabbitMQ Broker ]
```

---

### 反模式一：Producer 未開啟發布確認機制

盲目發布訊息，在網路中斷或 Broker 拒絕時直接遺失訊息。

### 正確解法一：啟用 Publisher Confirmations

在 RabbitMQ.Client 7.x 中，宣告 Channel 時必須明確配置開啟發布確認與追蹤：

~~~csharp
var options = new CreateChannelOptions(
    publisherConfirmationsEnabled: true,
    publisherConfirmationTrackingEnabled: true);
var channel = await connection.CreateChannelAsync(options, token);
~~~

搭配發布時的等待確認，保證 Broker 真正將訊息寫入持久化磁碟或法定副本：
```csharp
// 正確解法：等待 Broker 的發布確認
await channel.BasicPublishAsync(
    exchange: "orders.events",
    routingKey: "orders.placed",
    mandatory: true,
    basicProperties: properties,
    body: bodyBytes,
    cancellationToken: ct);

// 在 Client 7.x 啟用確認追蹤時，可確保訊息已安全落盤
```

---

### 反模式二：在業務處理前提前 Ack 或未配置 Prefetch

- **提早 Ack**：剛拿到訊息就立刻發送 Ack，隨後才去執行資料庫更新；若資料庫更新失敗，訊息無法再被重送。
- **無 Prefetch 限制**：預設 prefetchCount 為 0（無限），RabbitMQ 會將佇列中的數萬筆訊息一次性傾倒給單一 Consumer，瞬間撐爆 Consumer 的本機記憶體。

### 正確解法二：手動確認（Manual Ack）與合理 Prefetch 背壓

1. **先提交本地業務交易，最後才發送 Ack**。
2. 配置 `BasicQosAsync(prefetchCount: 20)`，限制單一 Consumer 同時間最多只能持有 20 筆未確認訊息，達成平滑背壓：

```csharp
// 正確解法：配置 Prefetch 背壓與手動手動確認
public async Task StartConsumingAsync(IChannel channel, CancellationToken ct)
{
    // 限制本 Consumer 同一時間最多只預取 20 筆未確認訊息
    await channel.BasicQosAsync(prefetchSize: 0, prefetchCount: 20, global: false, cancellationToken: ct);

    var consumer = new AsyncEventingBasicConsumer(channel);
    consumer.ReceivedAsync += async (sender, ea) =>
    {
        try
        {
            // 1. 執行本地資料庫業務（包含 Inbox 防重）
            await ProcessBusinessTransactionAsync(ea.Body.Span, ct);

            // 2. 業務交易 Commit 成功後，才向 RabbitMQ 確認！
            await channel.BasicAckAsync(deliveryTag: ea.DeliveryTag, multiple: false, cancellationToken: ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "處理訊息失敗，退回佇列或轉發死信");

            // 3. 處理失敗：發送 Nack（不重回隊列，直接由 DLX 死信處理）
            await channel.BasicNackAsync(
                deliveryTag: ea.DeliveryTag, 
                multiple: false, 
                requeue: false, 
                cancellationToken: ct);
        }
    };

    await channel.BasicConsumeAsync(queue: "orders.notifications", autoAck: false, consumer: consumer, cancellationToken: ct);
}
```

---

## 踩坑與避坑指南

### 1. DeliveryTag 跨 Channel 違規操作
- **踩坑點**：`DeliveryTag` 是在特定 `IChannel` 內部單調遞增的 64 位元整數。它**只對分配它的那條 Channel 有效**！
- 若在背景工作線程中拿著 Channel A 派發的 DeliveryTag，卻去呼叫 Channel B 的 `BasicAckAsync`，RabbitMQ 會立即判定通道違規，拋出 `PRECONDITION_FAILED - unknown delivery tag` 並強制關閉連線！

### 2. 重複投遞（At-least-once）與消費端冪等防護
- 當 Consumer 成功將業務資料寫入資料庫，但就在發送 `BasicAckAsync` 前的一毫秒，網路突發斷開或容器重啟。
- RabbitMQ 會偵測到連線中斷，並自動將該訊息重新標記為未確認並投遞給其他 Consumer。
- **鐵律**：手動 Ack 只能保證「至少送達一次（At-least-once）」，**不能保證恰好一次**。消費端業務必須搭配 **Inbox 表** 或唯一索引達成冪等性！

---

## 線上排查指令

### 1. 查詢佇列中未確認（Unacknowledged）訊息數量

```bash
# 檢查是否有大量訊息卡在 unacknowledged 狀態（代表 Consumer 處理緩慢或忘了 Ack）
rabbitmqctl list_queues name messages_ready messages_unacknowledged
```
若 `messages_unacknowledged` 居高不下，通常代表 Consumer 正在死等外部 I/O 逾時，或是代碼漏寫了 Ack！

### 2. 檢測特定 Channel 的消費者狀態

```bash
rabbitmqctl list_consumers
```

### 3. Prometheus / Grafana 監控指標

```text
# 訊息未確認積壓量告警（大於 200 筆即代表 Consumer 出現瓶頸）
rabbitmq_queue_messages_unacknowledged{queue="orders.notifications"} > 200

# Consumer Nack 產生率（每秒大於 1 筆即代表有異常報錯）
rate(rabbitmq_queue_messages_rejected_total[1m]) > 1
```
