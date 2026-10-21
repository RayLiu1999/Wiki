---
title: ".NET 發布、消費與 Worker 生命週期"
description: "使用 RabbitMQ.Client 7 非同步 API，管理長連線、獨立 Channel、訊息記憶體與正常關閉。"
articleId: "rabbitmq-dotnet-integration"
topic: "rabbitmq"
category: "rabbitmq-integration"
order: 3
tags:
  - "RabbitMQ.Client"
  - "IConnection"
  - "IChannel"
  - "AsyncEventingBasicConsumer"
  - "Worker"
  - "BackgroundService"
  - "CancellationToken"
difficulty: "advanced"
prerequisites:
  - "rabbitmq-routing"
  - "dotnet-hosting"
  - "aspnet-core-dependency-injection"
relatedArticles:
  - "rabbitmq-acknowledgements"
  - "rabbitmq-retries-idempotency"
  - "engineering-cache-messaging-tests"
applicableVersions: "RabbitMQ 4.x／AMQP 0-9-1／RabbitMQ.Client 7.x／.NET 10。"
lastReviewed: "2026-10-10"
takeaway: "Connection 長時間重用，Channel 依工作分配；停止程序時讓未確認工作可以重送。"
sources:
  - title: "RabbitMQ：.NET API Guide"
    url: "https://www.rabbitmq.com/client-libraries/dotnet-api-guide"
  - title: "RabbitMQ：可靠發布 C# 教學"
    url: "https://www.rabbitmq.com/tutorials/tutorial-seven-dotnet"
  - title: "Microsoft Learn：Worker services"
    url: "https://learn.microsoft.com/en-us/dotnet/core/extensions/workers"
---

## 案發現場

隨著官方在 .NET 生態系推出全新的 **`RabbitMQ.Client 7.x`**，API 發生了顛覆性的架構重構（所有舊版同步方法全部廢棄，全面改為純非同步 `ValueTask` / `Task`）。然而，許多團隊在升級或新實作時，踩進了嚴重的**連線與通道生命週期陷阱**。

最普遍的崩潰情境一：**跨執行緒共用 IChannel 引發狀態損毀**。
開發團隊將 `IChannel`（或舊稱 `IModel`）註冊為 Singleton 服務，並在多個並行的 Web API 請求中同時呼叫 `channel.BasicPublishAsync(...)`。
RabbitMQ 協議的 Channel **在設計上是嚴格非執行緒安全的（Non-thread-safe）**。多個執行緒同時在同一條 Channel 上寫入 Frame，會導致底層 Socket 的二進位位元組交錯錯亂，觸發：
```text
System.InvalidOperationException: Pipelining of requests forbidden
   at RabbitMQ.Client.Impl.ChannelBase.EnsureNoConcurrentPipelining(...)
```
隨後整條 TCP 連線被 Broker 判定協議違規而強制關閉。

另一個極端情境是：**每次發布訊息都手動建立與銷毀 IConnection**。
在 AMQP 協議中，建立一條實體 TCP 連線需要經過 Protocol Header 交換、Connection.Start、Tune、Open 等 **7 次以上的網路往返握手**，CPU 開銷極其昂貴。短命連線在高併發下迅速耗盡伺服器 Socket，引發連線雪崩。

---

## 反模式與正確解法

### 1. Connection 與 Channel 的生命週期邊界規範

- **`IConnection`（實體 TCP 連線）**：**應全域 Singleton 長時間重用！** 一個標準的應用程式進程通常只需要 **1~2 條** 實體 Connection（發布與消費可各分一條）。
- **`IChannel`（多工通道）**：代表單一邏輯對話，應由單一工作單元或單一背景消費執行緒獨立持有，**嚴禁跨執行緒同時並發呼叫**。

---

### 正確解法一：利用 ConfirmedPublisher 與 BasicGet/BasicAck 進行可控發布消費

在 .NET 10 與 RabbitMQ.Client 7.x 中，標準的確認發布與手動消費拉取流程：

~~~csharp
await using var publisher = await ConfirmedPublisher.CreateAsync(connection, topology, token);
var message = new OrderPlaced(Guid.NewGuid(), Guid.NewGuid(), 1, 2, DateTimeOffset.UtcNow);
await publisher.PublishAsync(message, token: token);
Console.WriteLine("發布確認: broker 已接收");

BasicGetResult? delivery;
while ((delivery = await channel.BasicGetAsync(topology.WorkQueue, autoAck: false, token)) is null)
    await Task.Delay(50, token);
OrderPlaced received = JsonDefaults.ReadEvent(delivery.Body.Span);
Console.WriteLine("消費內容: 商品 " + received.ProductId + "，數量 " + received.Quantity);
await channel.BasicAckAsync(delivery.DeliveryTag, multiple: false, token);
Console.WriteLine("消費確認: 已完成處理");
~~~

---

### 正確解法二：在 BackgroundService 中實作具備 Graceful Shutdown 的消費者

背景工作（Worker）必須具備優雅終止能力：當 Pod 收到 Kubernetes 的 `SIGTERM` 訊號時，必須停止接收新訊息，並等待當前正在處理的訊息順利 Ack 後再釋放資源：

```csharp
// 正確解法：生產級 BackgroundService 消費者與優雅終止
public class OrderProcessingWorker : BackgroundService
{
    private readonly IConnection _connection;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<OrderProcessingWorker> _logger;
    private IChannel? _channel;

    public OrderProcessingWorker(
        IConnection connection, 
        IServiceScopeFactory scopeFactory, 
        ILogger<OrderProcessingWorker> logger)
    {
        _connection = connection;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // 1. 本 Worker 專屬的獨立 Channel
        _channel = await _connection.CreateChannelAsync(cancellationToken: stoppingToken);
        await _channel.BasicQosAsync(0, prefetchCount: 10, false, stoppingToken);

        var consumer = new AsyncEventingBasicConsumer(_channel);
        consumer.ReceivedAsync += async (sender, ea) =>
        {
            // 將 Body 複製至受管記憶體（避免底層二進位緩衝區釋放後引發記憶體損毀）
            var bodyCopy = ea.Body.ToArray();

            try
            {
                using var scope = _scopeFactory.CreateScope();
                var handler = scope.ServiceProvider.GetRequiredService<IOrderCommandHandler>();
                
                await handler.ProcessOrderAsync(bodyCopy, stoppingToken);

                // 處理成功：確認 Ack
                await _channel.BasicAckAsync(ea.DeliveryTag, multiple: false, stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "處理訂單失敗");
                // 轉交重試或死信（不重新塞回原隊列避免毒訊息死循環）
                await _channel.BasicNackAsync(ea.DeliveryTag, multiple: false, requeue: false, stoppingToken);
            }
        };

        await _channel.BasicConsumeAsync("orders.notifications", autoAck: false, consumer: consumer, cancellationToken: stoppingToken);

        // 持續等待終止訊號
        await Task.Delay(Timeout.Infinite, stoppingToken).ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("正在優雅關閉 RabbitMQ Worker...");
        if (_channel != null && _channel.IsOpen)
        {
            await _channel.CloseAsync(cancellationToken);
        }
        await base.StopAsync(cancellationToken);
    }
}
```

---

## 踩坑與避坑指南

### 1. ReadOnlyMemory<byte> 的記憶體生命週期陷阱
- 在 RabbitMQ.Client 7.x 中，`ea.Body` 的型別是 `ReadOnlyMemory<byte>`，它指向底層 Socket 接收緩衝區的記憶體片段。
- **踩坑點**：若你將 `ea.Body` 直接傳入背景非同步 Task（未呼叫 `ToArray()` 拷貝），當目前事件處理方法返回時，底層的緩衝區會被 Socket 重新覆寫重用，導致背景 Task 讀取到被損壞的亂碼資料！
- **規則**：若需要跨非同步生命週期使用訊息內容，**必須先呼叫 `ea.Body.ToArray()` 拷貝為獨立陣列**。

### 2. 獨立分離發布連線與消費連線
- 在高吞吐系統中，當伺服器記憶體告警觸發「發布端流控（Flow Control Block）」時，RabbitMQ 會暫時阻塞發布連線的 Socket。
- **踩坑點**：若你的 Consumer 與 Producer 共享同一個 `IConnection`，發布被阻塞會連帶使消費者的 Ack 封包也無法送達，導致整個系統死鎖！
- **規則**：生產環境強烈建議將 **發布連線（Publisher Connection）** 與 **消費連線（Consumer Connection）** 分開建立。

---

## 線上排查指令

### 1. 檢視當前已連線的客戶端清單與 Channels 數量

```bash
# 查看所有連線的客戶端來源 IP、名稱與擁有的 Channel 數
rabbitmqctl list_connections name peer_host channels state
```
確認單一 Pod 的連線數是否維持在 1~2 條，且沒有異常的連線洩漏。

### 2. 檢測特定連線的 Channel 流量與未確認封包

```bash
rabbitmqctl list_channels pid connection name unacknowledged_message_count
```

### 3. Prometheus / Grafana 監控指標

```text
# 應用端 RabbitMQ 連線中斷次數告警
rate(rabbitmq_client_connection_failures_total[1m]) > 0

# Channel 異常常態關閉次數
rate(rabbitmq_client_channel_exceptions_total[1m]) > 0
```
