using System.Diagnostics;
using System.Text;
using System.Text.Json;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace DevWiki.Labs;

public sealed record BrokerTopology(string Prefix)
{
    public string Events => Prefix + ".events";
    public string WorkQueue => Prefix + ".notifications";
    public string RetryExchange => Prefix + ".retry";
    public string RetryQueue => Prefix + ".retry.500ms";
    public string FailedExchange => Prefix + ".failed";
    public string FailedQueue => Prefix + ".dead";
    public const string RoutingKey = "orders.placed.v1";

    public async Task DeclareAsync(IConnection connection, CancellationToken token = default)
    {
        await using var channel = await connection.CreateChannelAsync(cancellationToken: token);
        await channel.ExchangeDeclareAsync(Events, ExchangeType.Topic, durable: true, cancellationToken: token);
        await channel.ExchangeDeclareAsync(RetryExchange, ExchangeType.Direct, durable: true, cancellationToken: token);
        await channel.ExchangeDeclareAsync(FailedExchange, ExchangeType.Direct, durable: true, cancellationToken: token);
        await channel.QueueDeclareAsync(WorkQueue, durable: true, exclusive: false, autoDelete: false,
            arguments: Quorum(FailedExchange, "orders.failed"), cancellationToken: token);
        var retryArguments = Quorum(Events, RoutingKey);
        retryArguments["x-message-ttl"] = 500;
        await channel.QueueDeclareAsync(RetryQueue, durable: true, exclusive: false, autoDelete: false,
            arguments: retryArguments, cancellationToken: token);
        await channel.QueueDeclareAsync(FailedQueue, durable: true, exclusive: false, autoDelete: false,
            arguments: new Dictionary<string, object?> { ["x-queue-type"] = "quorum" }, cancellationToken: token);
        await channel.QueueBindAsync(WorkQueue, Events, RoutingKey, cancellationToken: token);
        await channel.QueueBindAsync(RetryQueue, RetryExchange, "retry", cancellationToken: token);
        await channel.QueueBindAsync(FailedQueue, FailedExchange, "orders.failed", cancellationToken: token);
    }

    private static Dictionary<string, object?> Quorum(string deadLetterExchange, string routingKey) => new()
    {
        ["x-queue-type"] = "quorum",
        ["x-dead-letter-exchange"] = deadLetterExchange,
        ["x-dead-letter-routing-key"] = routingKey,
        ["x-dead-letter-strategy"] = "at-least-once",
        ["x-overflow"] = "reject-publish"
    };
}

public sealed class ConfirmedPublisher : IAsyncDisposable
{
    private readonly IChannel channel;
    private readonly BrokerTopology topology;
    private readonly SemaphoreSlim gate = new(1, 1);
    private ConfirmedPublisher(IChannel channel, BrokerTopology topology) => (this.channel, this.topology) = (channel, topology);

    public static async Task<ConfirmedPublisher> CreateAsync(IConnection connection, BrokerTopology topology, CancellationToken token = default)
    {
        // wiki:start:publisher-channel
        var options = new CreateChannelOptions(
            publisherConfirmationsEnabled: true,
            publisherConfirmationTrackingEnabled: true);
        var channel = await connection.CreateChannelAsync(options, token);
        // wiki:end:publisher-channel
        return new ConfirmedPublisher(channel, topology);
    }

    public Task PublishAsync(OrderPlaced message, string? traceParent = null, string? routingKey = null, CancellationToken token = default)
    {
        var properties = new BasicProperties
        {
            ContentType = "application/json",
            DeliveryMode = DeliveryModes.Persistent,
            MessageId = message.MessageId.ToString(),
            CorrelationId = message.OrderId.ToString(),
            Headers = new Dictionary<string, object?> { ["x-lab-attempt"] = 0 }
        };
        string? parent = Activity.Current?.Id ?? traceParent;
        if (parent is not null) properties.Headers["traceparent"] = parent;
        return PublishRawAsync(topology.Events, routingKey ?? BrokerTopology.RoutingKey,
            properties, JsonSerializer.SerializeToUtf8Bytes(message, LabJson.Options), token);
    }

    public Task RetryAsync(BasicDeliverEventArgs delivery, int attempt, byte[] body, CancellationToken token)
    {
        var properties = new BasicProperties
        {
            ContentType = delivery.BasicProperties.ContentType,
            DeliveryMode = DeliveryModes.Persistent,
            MessageId = delivery.BasicProperties.MessageId,
            CorrelationId = delivery.BasicProperties.CorrelationId,
            Headers = delivery.BasicProperties.Headers is { } headers
                ? new Dictionary<string, object?>(headers) : []
        };
        properties.Headers["x-lab-attempt"] = attempt;
        return PublishRawAsync(topology.RetryExchange, "retry", properties, body, token);
    }

    public async Task PublishRawAsync(string exchange, string routingKey, BasicProperties properties, byte[] body, CancellationToken token = default)
    {
        await gate.WaitAsync(token);
        try
        {
            // Tracking 會等待 confirm；mandatory 的退回或 nack 會使 await 失敗。
            await channel.BasicPublishAsync(exchange, routingKey, mandatory: true,
                basicProperties: properties, body: body, cancellationToken: token);
        }
        finally { gate.Release(); }
    }

    public async ValueTask DisposeAsync()
    {
        await channel.DisposeAsync();
        gate.Dispose();
    }
}

public sealed class OutboxDispatcher(OrderStore store, ConfirmedPublisher publisher)
{
    public async Task<int> DispatchAsync(CancellationToken token = default)
    {
        int count = 0;
        foreach (PendingEvent pending in await store.PendingAsync(token))
        {
            // 單一發布器示範；多個發布器會造成重複，消費端仍須冪等。
            await publisher.PublishAsync(pending.Event, pending.TraceParent, token: token);
            await store.MarkPublishedAsync(pending.Event.MessageId, token);
            count++;
        }
        return count;
    }
}

public sealed class NotificationConsumer : IAsyncDisposable
{
    private readonly IChannel channel;
    private readonly ConfirmedPublisher retryPublisher;
    private readonly Func<OrderPlaced, CancellationToken, Task<bool>> handle;
    private readonly CancellationTokenSource lifetime;
    private readonly TaskCompletionSource completion = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly SemaphoreSlim callbackGate = new(1, 1);
    private string consumerTag = "";
    public Task Completion => completion.Task;
    private const int MaximumAttempts = 3;

    private NotificationConsumer(IChannel channel, ConfirmedPublisher retryPublisher,
        Func<OrderPlaced, CancellationToken, Task<bool>> handle, CancellationToken token)
    {
        this.channel = channel;
        this.retryPublisher = retryPublisher;
        this.handle = handle;
        lifetime = CancellationTokenSource.CreateLinkedTokenSource(token);
    }

    public static async Task<NotificationConsumer> StartAsync(IConnection connection, BrokerTopology topology,
        Func<OrderPlaced, CancellationToken, Task<bool>> handle, CancellationToken token = default)
    {
        var channel = await connection.CreateChannelAsync(cancellationToken: token);
        var publisher = await ConfirmedPublisher.CreateAsync(connection, topology, token);
        var instance = new NotificationConsumer(channel, publisher, handle, token);
        await channel.BasicQosAsync(0, 1, global: false, cancellationToken: token);
        var consumer = new AsyncEventingBasicConsumer(channel);
        consumer.ReceivedAsync += instance.ReceivedAsync;
        instance.consumerTag = await channel.BasicConsumeAsync(topology.WorkQueue, autoAck: false, consumer, cancellationToken: token);
        return instance;
    }

    private async Task ReceivedAsync(object sender, BasicDeliverEventArgs delivery)
    {
        await callbackGate.WaitAsync();
        try
        {
            // RabbitMQ.Client 7 的 body 只保證在 callback 期間有效。
            byte[] body = delivery.Body.ToArray();
            CancellationToken token = lifetime.Token;
            token.ThrowIfCancellationRequested();
            int attempt = 0;
            try
            {
                attempt = ReadAttempt(delivery.BasicProperties.Headers);
                OrderPlaced message = LabJson.ReadEvent(body);
                if (!Guid.TryParse(delivery.BasicProperties.MessageId, out Guid id) || id != message.MessageId)
                    throw new JsonException("AMQP MessageId 與事件內容不一致。");
                string? parent = ReadText(delivery.BasicProperties.Headers, "traceparent");
                ActivityContext.TryParse(parent, null, isRemote: true, out var context);
                using var activity = LabDiagnostics.Traces.StartActivity("orders.consume", ActivityKind.Consumer, context);
                bool first = await handle(message, token);
                if (first) LabDiagnostics.Processed.Add(1);
                else LabDiagnostics.Duplicates.Add(1);
                // 只有業務結果與 Inbox 已提交後才 Ack。
                await channel.BasicAckAsync(delivery.DeliveryTag, multiple: false, cancellationToken: token);
            }
            catch (OperationCanceledException) when (token.IsCancellationRequested) { }
            catch (Exception error)
            {
                bool poison = error is JsonException
                    or Npgsql.PostgresException { SqlState: Npgsql.PostgresErrorCodes.ForeignKeyViolation };
                if (poison || attempt + 1 >= MaximumAttempts)
                {
                    await channel.BasicNackAsync(delivery.DeliveryTag, multiple: false, requeue: false, cancellationToken: token);
                    LabDiagnostics.DeadLettered.Add(1);
                }
                else
                {
                    // 新的重試訊息確認後才刪除原訊息；中斷仍可能造成重複。
                    await retryPublisher.RetryAsync(delivery, attempt + 1, body, token);
                    await channel.BasicAckAsync(delivery.DeliveryTag, multiple: false, cancellationToken: token);
                    LabDiagnostics.Retried.Add(1);
                }
            }
        }
        catch (OperationCanceledException) when (lifetime.IsCancellationRequested) { }
        catch (Exception error)
        {
            // 重試的發布失敗不能把原訊息 Ack；讓呼叫端停止並關閉 channel 後重送。
            completion.TrySetException(error);
        }
        finally { callbackGate.Release(); }
    }

    public static int ReadAttempt(IDictionary<string, object?>? headers)
    {
        if (headers is null || !headers.TryGetValue("x-lab-attempt", out object? value)) return 0;
        return value switch
        {
            int number when number is >= 0 and < MaximumAttempts => number,
            long number when number is >= 0 and < MaximumAttempts => (int)number,
            _ => throw new JsonException("本實驗的重試次數必須介於 0 與 2。")
        };
    }

    private static string? ReadText(IDictionary<string, object?>? headers, string key) =>
        headers?.TryGetValue(key, out object? value) == true ? value switch
        {
            byte[] bytes => Encoding.UTF8.GetString(bytes),
            string text => text,
            _ => null
        } : null;

    public async ValueTask DisposeAsync()
    {
        await lifetime.CancelAsync();
        if (channel.IsOpen && consumerTag.Length > 0)
            await channel.BasicCancelAsync(consumerTag);
        await callbackGate.WaitAsync();
        try
        {
            await channel.DisposeAsync();
            await retryPublisher.DisposeAsync();
            completion.TrySetResult();
        }
        finally
        {
            callbackGate.Release();
            callbackGate.Dispose();
            lifetime.Dispose();
        }
    }
}
