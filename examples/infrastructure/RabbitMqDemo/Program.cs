using DevWiki.Labs;
using RabbitMQ.Client;

using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(15));
CancellationToken token = deadline.Token;
await using var connection = await LabOptions.RabbitFactory().CreateConnectionAsync(token);
var topology = new BrokerTopology("devwiki.demo." + Guid.NewGuid().ToString("N"));
await topology.DeclareAsync(connection, token);
await using var channel = await connection.CreateChannelAsync(cancellationToken: token);
try
{
    // wiki:start:rabbitmq-dotnet
    await using var publisher = await ConfirmedPublisher.CreateAsync(connection, topology, token);
    var message = new OrderPlaced(Guid.NewGuid(), Guid.NewGuid(), 1, 2, DateTimeOffset.UtcNow);
    await publisher.PublishAsync(message, token: token);
    Console.WriteLine("發布確認: broker 已接收");

    BasicGetResult? delivery;
    while ((delivery = await channel.BasicGetAsync(topology.WorkQueue, autoAck: false, token)) is null)
        await Task.Delay(50, token);
    OrderPlaced received = LabJson.ReadEvent(delivery.Body.Span);
    Console.WriteLine("消費內容: 商品 " + received.ProductId + "，數量 " + received.Quantity);
    await channel.BasicAckAsync(delivery.DeliveryTag, multiple: false, token);
    Console.WriteLine("消費確認: 已完成處理");
    // wiki:end:rabbitmq-dotnet
}
finally
{
    // 只移除本次產生的唯一 demo topology。
    if (channel.IsOpen)
    {
        foreach (string queue in new[] { topology.WorkQueue, topology.RetryQueue, topology.FailedQueue })
            await channel.QueueDeleteAsync(queue, ifUnused: false, ifEmpty: false);
        foreach (string exchange in new[] { topology.Events, topology.RetryExchange, topology.FailedExchange })
            await channel.ExchangeDeleteAsync(exchange, ifUnused: true);
    }
}
