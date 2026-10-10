---
title: "Exchange、Binding 與訊息路由"
description: "理解 Direct、Fanout、Topic 與預設 Exchange，避免把 Queue 名稱與 Routing Key 混用。"
articleId: "rabbitmq-routing"
topic: "rabbitmq"
category: "rabbitmq-basics"
order: 2
tags:
  - "Exchange"
  - "Direct"
  - "Fanout"
  - "Topic"
  - "Routing Key"
  - "Binding"
  - "mandatory"
  - "default exchange"
difficulty: "intermediate"
learningDepth: "deep"
prerequisites:
  - "rabbitmq-getting-started"
relatedArticles:
  - "rabbitmq-dotnet-integration"
  - "rabbitmq-acknowledgements"
  - "rabbitmq-retries-idempotency"
applicableVersions: "RabbitMQ 4.x／AMQP 0-9-1／RabbitMQ.Client 7.x／.NET 10。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-10"
takeaway: "Producer 發布到 Exchange；哪些 Queue 收到訊息由 Binding 與路由規則決定。"
sources:
  - title: "RabbitMQ：AMQP 0-9-1 Model"
    url: "https://www.rabbitmq.com/tutorials/amqp-concepts"
  - title: "RabbitMQ：Publishers"
    url: "https://www.rabbitmq.com/docs/publishers"
  - title: "RabbitMQ：Exchanges"
    url: "https://www.rabbitmq.com/docs/exchanges"
---

## 案發現場

在分散式微服務架構中，如果對 AMQP 路由機制缺乏理解，很容易將發布/訂閱（Pub/Sub）模式退化成「強耦合的偽隊列呼叫」。

典型反模式現場：**Producer 直接硬編碼目標 Queue 名稱**。
剛上線時，訂單服務發布「訂單建立」事件，只有「庫存服務」需要處理，開發者偷懶使用預設交換機（Default Exchange，傳入空字串 `""`），將 Queue 名稱直接作為 Routing Key：
```csharp
// 致命反模式：Producer 直接向特定 Queue 寫入
await channel.BasicPublishAsync(exchange: "", routingKey: "inventory-service-queue", body: payload);
```
三個月後，系統演進：
- 行銷團隊需要接收該事件發送折扣通知，建立了 `marketing-queue`。
- 大數據團隊需要接收該事件進行即時分析，建立了 `analytics-queue`。
- 財務團隊需要接收該事件開發票，建立了 `invoice-queue`。

結果：**訂單服務的 Producer 代碼被迫修改了三次！** 發布端代碼充斥著四個連續的 `BasicPublishAsync`，每次下游服務有增減，發布端就必須重新編譯部署。一旦某個下游 Queue 名稱改動，發布端立刻發生異常。

更可怕的事故是**「無路由訊息靜默丟失」**：
某次 Producer 的 Routing Key 打錯了一個字母（例如將 `orders.created` 誤打成 `order.created`）。在 RabbitMQ 預設行為中，若訊息發送至 Exchange 後**沒有任何 Queue 與之匹配綁定，RabbitMQ 會默不作聲地直接將該訊息丟棄（Black-holed）**！發布端顯示成功，下游卻永遠等不到訊息，造成嚴重的幽靈事故。

---

## 反模式與正確解法

### 1. 四大核心 Exchange 類型特徵與路由矩陣

AMQP 的核心鐵律是：**Producer 只需要關心發布的「事件語意（Routing Key）」，完全不需要知道世界上有哪些 Queue 存在！**

| 交換機類型 (Type) | 路由比對規則 | 典型使用場景 | 複雜度 |
| :--- | :--- | :--- | :--- |
| **`Direct`** | **精確相等匹配**（Routing Key 完全一致才轉發）。 | 點對點任務、單一特定路由、嚴重性日誌（`error`, `info`）。 | 低 |
| **`Fanout`** | **無條件全量廣播**（完全忽略 Routing Key，轉發給所有綁定的 Queue）。 | 全域通知、即時配置刷新（Cache Invalidation）、狀態廣播。 | 極低（最高吞吐）|
| **`Topic`** | **萬用字元階層匹配**（支援 `*` 單詞與 `#` 多詞比對）。 | **微服務整合事件的最佳首選！** 支援靈活依條件訂閱。 | 中 |
| **`Headers`** | **依據訊息屬性 Header** 的鍵值匹配（忽略 Routing Key）。 | 多維度屬性篩選（實務中較罕用）。 | 較高 |

---

### 正確解法一：採用 Topic Exchange 實現微服務優雅解耦

在領域事件中，建議統一使用 **`Topic Exchange`**，以清晰的命名空間定義 Routing Key（例如：`<業務領域>.<實體>.<動作>`）：

```csharp
// 1. 宣告拓撲（可在 Consumer 端或 CI/CD 自動化腳本中宣告）
public async Task SetupTopologyAsync(IChannel channel, CancellationToken ct)
{
    // 宣告可持久化的 Topic 交換機
    await channel.ExchangeDeclareAsync("ecommerce.events", ExchangeType.Topic, durable: true, cancellationToken: ct);

    // 宣告庫存服務的專屬 Queue
    await channel.QueueDeclareAsync("inventory.orders", durable: true, exclusive: false, autoDelete: false, cancellationToken: ct);

    // 庫存服務只訂閱「所有地區的訂單建立事件」（orders.*.created）
    await channel.QueueBindAsync("inventory.orders", "ecommerce.events", "orders.*.created", cancellationToken: ct);

    // 大數據分析服務的 Queue 訂閱「所有訂單的一切事件」（orders.#）
    await channel.QueueDeclareAsync("analytics.orders", durable: true, exclusive: false, autoDelete: false, cancellationToken: ct);
    await channel.QueueBindAsync("analytics.orders", "ecommerce.events", "orders.#", cancellationToken: ct);
}
```

發布端只需專注於單一事件語意，**一次發布，全網自動按規則路由**：
```csharp
// 2. Producer 端極致乾淨：只發布到 Exchange，零下游 Queue 耦合！
public async Task PublishOrderCreatedAsync(IChannel channel, OrderPlaced order, CancellationToken ct)
{
    var routingKey = "orders.tw.created"; // 訂單-台灣區-建立
    var body = JsonSerializer.SerializeToUtf8Bytes(order);

    var properties = new BasicProperties
    {
        ContentType = "application/json",
        DeliveryMode = DeliveryModes.Persistent,
        MessageId = order.MessageId.ToString()
    };

    // 僅此一次發布！庫存服務與分析服務會自動由 RabbitMQ 複製分發
    await channel.BasicPublishAsync(
        exchange: "ecommerce.events",
        routingKey: routingKey,
        mandatory: true, // 關鍵：開啟強制路由檢查！
        basicProperties: properties,
        body: body,
        cancellationToken: ct);
}
```

---

### 正確解法二：啟用 mandatory 標記與監聽 BasicReturn 防止黑洞丟失

當發布訊息時設定 `mandatory: true`，若該訊息在 Exchange 找不到任何符合的 Queue，RabbitMQ 會透過通道向發布端**退回（Return）**該訊息，絕不默默丟棄：

```csharp
// 監聽未路由被退回的訊息事件
channel.BasicReturnAsync += (sender, args) =>
{
    var returnedMessageId = args.BasicProperties.MessageId;
    var routingKey = args.RoutingKey;
    _logger.LogError("嚴重告警：訊息 {MessageId} 發送至 {Exchange} 時因 RoutingKey {RoutingKey} 無匹配 Queue 被退回！",
        returnedMessageId, args.Exchange, routingKey);

    return Task.CompletedTask;
};
```

---

## 踩坑與避坑指南

### 1. Topic 萬用字元 `*` 與 `#` 的語意差異
- **`*`（星號）**：剛好匹配**單一個單詞**（以句號 `.` 切隔）。
  - 例如 `orders.*.created` 能匹配 `orders.tw.created`，但**無法**匹配 `orders.tw.taipei.created`。
- **`#`（井號）**：匹配**零個或多個單詞**。
  - 例如 `orders.#` 能匹配 `orders`、`orders.tw`、`orders.tw.taipei.created`。

### 2. 備用交換機（Alternate Exchange）兜底策略
- 若不想在客戶端處理 `BasicReturn`，可在宣告 Exchange 時透過引數指定 `alternate-exchange: "unrouted.events"`。
- 任何無法路由的孤兒訊息，會自動被 RabbitMQ 轉發至備用交換機儲存於專屬 Queue，供後續日誌排查與重播。

---

## 線上排查指令

### 1. 檢視當前所有 Binding 綁定關係

使用 `rabbitmqadmin`（或管理後台 HTTP API）檢查路由綁定是否正確生效：
```bash
rabbitmqadmin list bindings source destination destination_type routing_key
```
確認你的 Queue 是否已正確綁定至目標 Topic Exchange 與 Routing Key。

### 2. 命令行發布測試訊息驗證路由

```bash
# 透過 rabbitmqadmin 模擬發布一則測試訊息
rabbitmqadmin publish exchange="ecommerce.events" routing_key="orders.tw.created" payload="{\"test\":true}"
```
隨後檢查目標 Queue 的 `messages` 計數是否由 0 變為 1。

### 3. Prometheus / Grafana 監控指標

```text
# 訊息未路由被丟棄/退回率（Unrouted Drop Rate，大於 0 代表存在孤兒訊息！）
rate(rabbitmq_exchange_messages_unrouted_total[1m]) > 0

# 各 Exchange 每秒發布吞吐量
rate(rabbitmq_exchange_messages_published_total{exchange="ecommerce.events"}[1m])
```
