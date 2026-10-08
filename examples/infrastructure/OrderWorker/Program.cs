using DevWiki.Labs;
using Npgsql;
using RabbitMQ.Client.Exceptions;

using var stopping = new CancellationTokenSource();
Console.CancelKeyPress += (_, args) => { args.Cancel = true; stopping.Cancel(); };
CancellationToken token = stopping.Token;
await using var database = LabOptions.Database();
var store = new OrderStore(database);
await using var connection = await LabOptions.RabbitFactory().CreateConnectionAsync(token);
var topology = new BrokerTopology("devwiki.orders");
await topology.DeclareAsync(connection, token);
await using var publisher = await ConfirmedPublisher.CreateAsync(connection, topology, token);
await using var consumer = await NotificationConsumer.StartAsync(connection, topology, store.RecordNotificationAsync, token);
var dispatcher = new OutboxDispatcher(store, publisher);
Console.WriteLine("Worker 已啟動：發布 Outbox，並記錄模擬通知；Ctrl+C 正常停止。");

try
{
    while (!token.IsCancellationRequested)
    {
        if (consumer.Completion.IsCompleted) await consumer.Completion;
        try
        {
            int count = await dispatcher.DispatchAsync(token);
            if (count > 0) Console.WriteLine("已確認發布 " + count + " 個事件。");
        }
        catch (Exception error) when (error is NpgsqlException or AlreadyClosedException or PublishException or IOException)
        {
            Console.Error.WriteLine("發布暫時失敗，Outbox 保留待重試：" + error.GetType().Name);
        }
        await Task.Delay(500, token);
    }
}
catch (OperationCanceledException) when (token.IsCancellationRequested) { }
