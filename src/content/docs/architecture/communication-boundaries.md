---
title: "同步呼叫、背景工作與訊息通訊的選擇"
description: "依程序邊界、可遺失程度與回覆需求，選擇 HTTP、Channel、Redis Pub/Sub、Streams 或 RabbitMQ。"
articleId: "architecture-communication-boundaries"
topic: "architecture"
category: "application-patterns"
order: 3
tags:
  - "HTTP"
  - "Channel"
  - "Redis Pub/Sub"
  - "Redis Streams"
  - "RabbitMQ"
  - "Dapr"
  - "最終一致性"
  - "Domain Event"
  - "Integration Event"
  - "事件契約"
difficulty: "intermediate"
learningDepth: "deep"
prerequisites:
  - "csharp-channels"
  - "rabbitmq-getting-started"
  - "redis-getting-started"
relatedArticles:
  - "architecture-application-patterns"
  - "architecture-outbox-inbox"
  - "aspnet-core-dapr"
  - "rabbitmq-queues-ordering"
applicableVersions: "以 .NET 10、Redis 8.x、RabbitMQ 4.x 說明；driver／EF provider 的主版相容性須各自核對。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-10"
takeaway: "先決定誰需要立即回覆、工作能否遺失、是否需要重播，再選擇通訊機制。"
sources:
  - title: "Microsoft Learn：非同步訊息通訊"
    url: "https://learn.microsoft.com/en-us/dotnet/architecture/microservices/architect-microservice-container-applications/asynchronous-message-based-communication"
  - title: "Microsoft Learn：Channels"
    url: "https://learn.microsoft.com/en-us/dotnet/core/extensions/channels"
  - title: "Redis：Pub/Sub"
    url: "https://redis.io/docs/latest/develop/pubsub/"
  - title: "Redis：Streams"
    url: "https://redis.io/docs/latest/develop/data-types/streams/"
  - title: "RabbitMQ：AMQP 模型"
    url: "https://www.rabbitmq.com/tutorials/amqp-concepts"
---

## 案發現場

在從單體架構轉向微服務或分散式系統的過程中，許多團隊經歷過典型的「鏈式同步呼叫雪崩」：

使用者在電商前端點擊「立即購買」，後端訂單 API 在處理該請求時，依序透過同步 HTTP REST 呼叫了四個下游服務：
1. `GET /inventory/check`（庫存服務，耗時 30ms）
2. `POST /coupon/deduct`（折價券服務，耗時 50ms）
3. `POST /loyalty/points`（點數服務，耗時 40ms）
4. `POST /logistics/reserve`（物流配送服務，遇網路抖動，耗時 4,500ms）

由於物流服務卡頓，整筆訂單 API 耗時長達 4.6 秒。更慘的是，當促銷高峰物流服務負載過高直接 Crash 時，訂單 API 的 HTTP 執行緒被全數卡死，連鎖引發整個下單入口崩潰。

另一種常見的事故是**通訊工具選型錯誤導致的資料憑空蒸發**：
工程師為了追求極致速度，選用 **Redis Pub/Sub** 來通知帳務扣款。某天夜間微服務進行 Rolling Update 滾動重啟，在 Consumer Pod 重新啟動的 15 秒空窗期內，發布端發送了 300 筆扣款通知。由於 Redis Pub/Sub 本質是**即發即忘（Fire-and-forget）**，沒有任何儲存或佇列緩衝機制，這 300 筆關鍵事件永久遺失，造成重大的帳務漏扣事故！

---

## 反模式與正確解法

### 1. 通訊邊界決策矩陣

| 通訊機制 | 運作維度 | 可靠性 / 持久化 | 重播能力 | 典型最佳應用情境 |
| :--- | :--- | :--- | :--- | :--- |
| **`System.Threading.Channels`** | **單一行程內部** | 記憶體（重啟即失） | 無 | 同 Process 內非同步解耦、生產者/消費者工作隊列 |
| **HTTP / gRPC** | **跨跨程序同步** | 無（依賴即時連線） | 無 | 必須立刻取得計算結果的查詢（如即時價格計算） |
| **Redis Pub/Sub** | **跨程序廣播** | **零持久化（不保證送達）** | 無 | 即時快取失效通知（Cache Invalidation）、聊天室廣播 |
| **RabbitMQ** | **跨服務非同步訊息** | **極高（磁碟持久化 + ACK + 死信）** | 無（消費後即從 Queue 移除）| 關鍵業務流程（訂單、支付、庫存扣減、任務派發） |
| **Redis Streams / Kafka** | **分散式事件日誌** | **極高（持久化日誌儲存）** | **有（基於 Offset 重播）** | 審計日誌串流、事件溯源（Event Sourcing）、資料管道 |

---

### 反模式一：跨服務同步鏈式相依（Temporal Coupling）

把非核心路徑的操作（如累積會員點數、發送簡訊通知、預約配送）全部強塞進使用者的 HTTP 請求生命週期中，使得整個系統的可用性（Availability）變成所有下游服務可用性的**乘積**：
$$\text{Availability}_{\text{Total}} = A_{\text{Order}} \times A_{\text{Inv}} \times A_{\text{Coupon}} \times A_{\text{Logistics}} \dots$$
只要任何一個下游掛掉，全站下單立刻失敗。

### 正確解法一：關鍵路徑同步，非核心路徑非同步解耦

使用者下單時，核心路徑只做必要驗證與訂單落庫，其餘動作全部發送至 **RabbitMQ** 非同步執行：

```csharp
// 正確解法：核心路徑極速響應，非同步訊息驅動周邊服務
public async Task<OrderResponse> CheckoutAsync(CheckoutCommand cmd, CancellationToken ct)
{
    // 1. 本地交易：建立訂單與原子寫入 Outbox 事件
    var orderId = await _orderService.CreatePendingOrderAsync(cmd, ct);

    // 2. 立即回傳成功給前端，耗時小於 20ms！
    return new OrderResponse(orderId, "訂單已受理，正在處理付款與配送。");
}
```

---

### 反模式二：混淆 Domain Event 與 Integration Event

- **Domain Event（領域事件）**：發生在**同一微服務與同一個執行緒/行程內部**，表達單一聚合根的業務變更（如 `OrderCreatedDomainEvent`），通常由 MediatR `INotification` 在記憶體中立即同步分發。
- **Integration Event（整合事件）**：跨越**網路邊界與服務邊界**（如發送給財務服務），必須具備嚴格的版本契約（Contract），且必須透過 Message Broker（RabbitMQ）以 JSON/Protobuf 格式傳輸。

```csharp
// 正確解法：行程內 Domain Event 透過 Channel 解耦背景任務
public class OrderDomainEventHandler : INotificationHandler<OrderCreatedDomainEvent>
{
    private readonly Channel<SendEmailTask> _emailChannel;

    public OrderDomainEventHandler(Channel<SendEmailTask> emailChannel)
    {
        _emailChannel = emailChannel;
    }

    public async Task Handle(OrderCreatedDomainEvent notification, CancellationToken ct)
    {
        // 透過行程內 Channel 極速寫入，不阻塞主交易流程
        await _emailChannel.Writer.WriteAsync(
            new SendEmailTask(notification.CustomerId, "訂單確認信"), ct);
    }
}
```

---

## 踩坑與避坑指南

### 1. gRPC 在 Kubernetes 中的負載平衡陷阱
- **現象**：在 K8s 中部署了 5 個庫存服務 Pod，上游透過 gRPC 呼叫。監控發現，所有流量居然全部打在**同一個 Pod** 上，其他 4 個 Pod 完全閒置！
- **根本原因**：gRPC 底層基於 **HTTP/2**，會長久維持單一 TCP 多工連線。Kubernetes 的 ClusterIP 負載平衡是基於 L4 TCP 連線建立。連線一旦建立，後續成千上萬個 RPC 呼叫都會在同一個 Socket 傳輸，K8s 預設無法對 HTTP/2 的各個 Stream 進行負載平衡。
- **避坑規則**：
  1. 在 Kubernetes 部署 **Envoy / Istio Service Mesh** 進行 L7 負載平衡。
  2. 或在 .NET gRPC Client 配置 `RoundRobin` 搭配 Headless Service（`dns:///`）進行客戶端負載平衡。

### 2. 同步 HTTP 呼叫必須設定強制逾時與 Circuit Breaker
- 若架構中必須存在同步 HTTP 呼叫，絕不能使用預設的無限或 100 秒超時！
- 必須透過 `Microsoft.Extensions.Http.Resilience` 配置標準彈性管道：
  ```csharp
  builder.Services.AddHttpClient<ILogisticsClient, LogisticsClient>()
      .AddStandardResilienceHandler(options =>
      {
          options.AttemptTimeout.Timeout = TimeSpan.FromSeconds(2); // 單次最多等 2 秒
          options.CircuitBreaker.SamplingDuration = TimeSpan.FromSeconds(10);
      });
  ```

---

## 線上排查指令

### 1. 檢測跨服務呼叫鏈延遲（OpenTelemetry 追蹤）

透過 Distributed Tracing 識別瀑布流中耗時最長的跨服務呼叫節點：
```bash
# 即時收集 API 呼叫鏈指標與活動
dotnet-trace collect --name Ecommerce.Api --providers OpenTelemetry
```

### 2. 檢測 RabbitMQ 佇列訊息堆積量

```bash
# 檢查各 Queue 的訊息堆積（messages_ready）與處理中數量（messages_unacknowledged）
rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers
```
若 `messages_ready` 持續攀升且 `consumers` 正常，代表下游消費能力不足，需要擴容 Consumer Pod。

### 3. Prometheus / Grafana 監控指標

```text
# 同步跨服務 HTTP 呼叫失敗率（大於 1% 即觸發警報）
sum(rate(http_client_requests_duration_seconds_count{status!~"2.."}[1m])) 
/ 
sum(rate(http_client_requests_duration_seconds_count[1m])) > 0.01

# 訊息佇列堆積警告
rabbitmq_queue_messages_ready{queue="order-created-queue"} > 1000
```
