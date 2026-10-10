---
title: "佇列類型、順序與併行控制"
description: "比較 Classic、Quorum 與 Stream，拆開入列、傳遞及完成順序，設計有界的消費容量。"
articleId: "rabbitmq-queues-ordering"
topic: "rabbitmq"
category: "rabbitmq-reliability"
order: 6
tags:
  - "Classic Queue"
  - "Quorum Queue"
  - "Stream"
  - "FIFO"
  - "prefetch"
  - "competing consumers"
  - "順序"
  - "背壓"
  - "delivery limit"
difficulty: "intermediate"
learningDepth: "deep"
prerequisites:
  - "rabbitmq-retries-idempotency"
  - "csharp-channels"
relatedArticles:
  - "engineering-metrics-tracing"
  - "engineering-cache-messaging-tests"
  - "architecture-communication-boundaries"
applicableVersions: "RabbitMQ 4.x／AMQP 0-9-1／RabbitMQ.Client 7.x／.NET 10。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-10"
takeaway: "佇列的入列順序不代表多個 Consumer 的完成順序；容量、重送與每個業務實體的順序要一起設計。"
sources:
  - title: "RabbitMQ：Queues"
    url: "https://www.rabbitmq.com/docs/queues"
  - title: "RabbitMQ：Quorum Queues"
    url: "https://www.rabbitmq.com/docs/quorum-queues"
  - title: "RabbitMQ：Streams"
    url: "https://www.rabbitmq.com/docs/streams"
  - title: "RabbitMQ：Consumer Prefetch"
    url: "https://www.rabbitmq.com/docs/consumer-prefetch"
---

## 案發現場

在分散式系統中，工程師常對訊息佇列抱有一種直覺假設：「隊列既然是 FIFO（先進先出），那我在下游處理的順序必然也是嚴格先進先出的」。

這種錯誤假設往往在**多消費者併發處理**時引發嚴重的順序顛倒災難：
以電商訂單狀態流轉為例，業務事件順序必須是：
`訂單已建立 (Event 1) ➔ 訂單已付款 (Event 2) ➔ 申請退款 (Event 3)`。

為了提高消費效能，工程師在 Kubernetes 中擴展了 5 個 Consumer Pod 監聽同一個 `orders.events` 佇列（競爭消費者模式 Competing Consumers）：
1. Pod A 領取了 Event 1（寫入訂單，因資料庫開交易較慢，耗時 80ms）。
2. Pod B 領取了 Event 2（更新付款，耗時 30ms）。
3. Pod C 領取了 Event 3（申請退款，極速耗時 10ms）。

結果：**Pod C 搶在 Pod B 之前完成了資料庫更新**！資料庫檢查發現狀態尚未變成「已付款」，直接拋出例外中斷退款，導致訂單狀態卡死在矛盾的幽靈狀態中。

另一個經典現場是**高可用鏡像隊列（Mirrored Queues）的被動棄用**：
舊系統中仍採用 Classic Mirrored Queues，在網路分區（Network Partition）或節點重新加入叢集時，產生嚴重的「腦裂（Split-Brain）」或全量訊息同步阻塞，導致 RabbitMQ 叢集集體當機。

---

## 反模式與正確解法

### 1. 三大佇列類型本質與選型矩陣

現代 RabbitMQ 提供了三種截然不同的佇列儲存引擎：

| 佇列類型 | 共識與儲存機制 | 高可用架構 | 典型適用場景 | 缺點 / 限制 |
| :--- | :--- | :--- | :--- | :--- |
| **`Classic Queue`** | 單節點記憶體與磁碟檔案。 | 無高可用（或已棄用的鏡像機制）。 | 暫態非關鍵任務、單節點排程。 | 節點當機即不可用、有資料遺失風險。 |
| **`Quorum Queue`** | **基於 Raft 共識協議的分散式日誌。** | **極高（法定多數票，原生防腦裂）。** | **所有核心業務標配！** 訂單、金融、庫存扣減。 | 記憶體開銷較高，不支援優先權隊列。 |
| **`RabbitMQ Stream`** | **追加型日誌串流（Append-only Log）。** | 極高（分區複製）。 | 海量吞吐日誌、事件溯源、需要 Offset 重播。 | 無 AMQP 隨意 Ack 刪除語意，需用專用協議。 |

---

### 反模式一：在多 Consumer 競爭下假設全域完成順序

誤以為 Queue 內部有序，多個並行 Consumer 就能自動按順序完成。現實是：**網路延遲、GC 暫停、I/O 速度差異會無情打亂多執行緒的完成先後！**

### 正確解法一：一致性雜湊路由（Consistent Hash Exchange）確保局部單流序

若業務要求「同一筆訂單的所有事件必須嚴格按順序處理」，但不同訂單之間可以平行處理：
利用 **Consistent Hash Exchange**，以 `OrderId` 的 Hash 值將相同訂單的所有訊息路由到**固定專屬的單一子佇列（Queue Shard）**，每個子佇列只配置單一消費者（Single Active Consumer）：

```csharp
// 宣告一致性雜湊交換機
await channel.ExchangeDeclareAsync("orders.hash.exchange", "x-consistent-hash", durable: true, cancellationToken: ct);

// 建立 4 個分區佇列，各配置 1 個權重
for (int i = 0; i < 4; i++)
{
    var queueName = $"orders.partition.{i}";
    await channel.QueueDeclareAsync(queueName, durable: true, exclusive: false, autoDelete: false, cancellationToken: ct);
    await channel.QueueBindAsync(queueName, "orders.hash.exchange", "1", cancellationToken: ct);
}

// 發布時以 OrderId 作為 Routing Key，保證同一訂單的所有事件永遠進入同一個 Queue！
var properties = new BasicProperties { MessageId = Guid.NewGuid().ToString() };
await channel.BasicPublishAsync(
    exchange: "orders.hash.exchange",
    routingKey: orderId.ToString(), // 相同的 OrderId 雜湊至同一個分區
    mandatory: true,
    basicProperties: properties,
    body: bodyBytes,
    cancellationToken: ct);
```

---

### 正確解法二：消費端業務狀態機防禦（State Machine Guard）

若架構無法分區，消費端必須實作樂觀版本號或狀態機檢查：
若收到「申請退款」，但當前資料庫狀態仍為「待付款」，Consumer **不應硬報錯**，而應將此訊息延遲暫存或透過重試佇列退避 500ms 後重新檢查，讓先行的事件有機會趕上落庫。

---

## 踩坑與避坑指南

### 1. Quorum Queue 的核心參數與中毒訊息熔斷
- **`x-delivery-limit`**：Quorum Queue 原生支援**投遞次數上限**。若一則毒訊息因格式錯誤反覆被 Nack，達到上限（如 5 次）後，RabbitMQ 會自動將其丟棄或轉發至死信隊列（DLX），徹底避免單一壞訊息阻塞隊列。
- **宣告範例**：
  ```csharp
  var args = new Dictionary<string, object?>
  {
      ["x-queue-type"] = "quorum",
      ["x-delivery-limit"] = 5
  };
  await channel.QueueDeclareAsync("orders.quorum", durable: true, exclusive: false, autoDelete: false, arguments: args, cancellationToken: ct);
  ```

### 2. 隊頭阻塞（Head-of-Line Blocking）
- 在單一佇列中，若前面排著一則耗時 10 秒的巨型報表計算任務，後續數萬個只需要 1ms 的輕量通知全部會被堵在後方。
- **規則**：永遠將「重計算長任務」與「輕量即時通知」拆分為**獨立的專屬佇列**，避免資源相互擠壓。

---

## 線上排查指令

### 1. 檢視 Quorum Queue 的 Raft 副本與 Leader 節點

```bash
# 檢查 Quorum 隊列的 Leader 與 副本（Replicas）狀態
rabbitmq-queues quorum_status orders.quorum
```
確認所有節點均處於 `online` 狀態且無落後副本（Synchronised）。

### 2. 檢測佇列消費速率與積壓趨勢

```bash
rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers
```

### 3. Prometheus / Grafana 監控指標

```text
# Quorum Queue Raft 複寫延遲告警
rabbitmq_quorum_queue_messages_uncommitted > 50

# 隊列積壓增長速率（入列大於出列）
(rate(rabbitmq_queue_messages_published_total[1m]) - rate(rabbitmq_queue_messages_delivered_total[1m])) > 10
```
