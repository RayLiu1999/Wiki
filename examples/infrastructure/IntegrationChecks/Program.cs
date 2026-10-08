using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using DevWiki.Labs;
using Npgsql;
using RabbitMQ.Client;
using RabbitMQ.Client.Exceptions;
using StackExchange.Redis;

using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(90));
CancellationToken token = deadline.Token;
await using var database = LabOptions.Database();
var store = new OrderStore(database);
string phase = args.FirstOrDefault() ?? "initial";
if (phase == "redis-down")
{
    using var unavailable = await ConnectionMultiplexer.ConnectAsync(LabOptions.RedisOptions());
    var products = new CachedProducts(store, unavailable.GetDatabase(), TimeSpan.FromSeconds(30));
    ProductRead? read = await products.GetAsync(1, token);
    Require(read is { Source: "database-fallback", Product.Id: 1 }, "Redis 停止時仍須讀取正確商品。");
    Console.WriteLine("✓ Redis 服務停止時回源");
    return;
}

using var redis = await ConnectionMultiplexer.ConnectAsync(LabOptions.RedisOptions());
IDatabase cache = redis.GetDatabase();
await using var connection = await LabOptions.RabbitFactory().CreateConnectionAsync(token);
var recoveryTopology = new BrokerTopology("devwiki.recovery");
await recoveryTopology.DeclareAsync(connection, token);
Guid recoveryOrder = Guid.Parse("10000000-0000-0000-0000-000000000001");
Guid recoveryMessage = Guid.Parse("20000000-0000-0000-0000-000000000001");

if (phase == "recovery")
{
    await Check("AOF 確認後的 Redis 值在重啟後恢復", async () =>
        Require(await cache.StringGetAsync("devwiki:checks:persistence") == "confirmed-before-restart", "Redis 探測值遺失。"));
    await Check("Broker 耐久工作重啟後繼續並保護冪等結果", async () =>
    {
        Require(await store.GetOrderAsync(recoveryOrder, token) is { NotificationRecorded: false }, "重啟前不應已有通知結果。");
        await using var consumer = await NotificationConsumer.StartAsync(connection, recoveryTopology, store.RecordNotificationAsync, token);
        await Until(async () => await store.GetOrderAsync(recoveryOrder, token) is { NotificationRecorded: true }, consumer);
        Require(await Count("SELECT count(*) FROM notifications WHERE order_id = $1", recoveryOrder) == 1, "恢復結果必須只有一份。");
        await using var publisher = await ConfirmedPublisher.CreateAsync(connection, recoveryTopology, token);
        var dispatcher = new OutboxDispatcher(store, publisher);
        await dispatcher.DispatchAsync(token);
        await Until(async () => (await store.PendingAsync(token)).Count == 0, consumer);
    });
    Console.WriteLine("重啟恢復驗證通過。");
    return;
}
if (phase != "initial") throw new ArgumentException("未知的驗證階段。");

await Check("PostgreSQL 的表與欄位註解已寫入 metadata", async () =>
{
    Require(await Count("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'") == 5,
        "實驗必須有五張表。");
    Require(await Count("""
        SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r' AND nullif(obj_description(c.oid,'pg_class'),'') IS NULL
        """) == 0, "資料表缺少註解。");
    Require(await Count("""
        SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped
        AND nullif(col_description(c.oid,a.attnum),'') IS NULL
        """) == 0, "欄位缺少註解。");
});

await Check("商品冷讀、命中與更新失效", async () =>
{
    await cache.KeyDeleteAsync(CachedProducts.Key(1));
    var products = new CachedProducts(store, cache, TimeSpan.FromSeconds(30));
    ProductRead first = (await products.GetAsync(1, token))!;
    ProductRead second = (await products.GetAsync(1, token))!;
    Require(first.Source == "database" && second.Source == "redis" && products.DatabaseReads == 1, "第二次讀取應命中且不增加回源。");
    Require(await products.UpdateAsync(1, 120.00m, token), "更新商品失敗。");
    ProductRead third = (await products.GetAsync(1, token))!;
    Require(third.Source == "database" && third.Product.Price == 120.00m && third.Product.Version > first.Product.Version
        && products.DatabaseReads == 2, "失效後必須讀到新價格與版本。");
});

await Check("TTL 到期後重新載入", async () =>
{
    await cache.KeyDeleteAsync(CachedProducts.Key(2));
    var products = new CachedProducts(store, cache, TimeSpan.FromMilliseconds(100));
    await products.GetAsync(2, token);
    await Until(async () => !await cache.KeyExistsAsync(CachedProducts.Key(2)));
    ProductRead next = (await products.GetAsync(2, token))!;
    Require(next.Source == "database" && next.Product.Id == 2 && products.DatabaseReads == 2, "到期後須重新讀取資料庫。");
});

await Check("損壞的快取不影響商品資料", async () =>
{
    foreach (string payload in new[]
    {
        "{invalid-json", "null", "{}",
        JsonSerializer.Serialize(new Product(2, "錯誤商品", 1.00m, 1), LabJson.Options),
        JsonSerializer.Serialize(new Product(1, "商品名稱", -1.00m, 1), LabJson.Options)
    })
    {
        await cache.StringSetAsync(CachedProducts.Key(1), payload, TimeSpan.FromSeconds(30));
        var products = new CachedProducts(store, cache, TimeSpan.FromSeconds(30));
        ProductRead read = (await products.GetAsync(1, token))!;
        Require(read.Source == "database-fallback" && read.Product is { Id: 1, Price: 120.00m },
            "損壞或不符契約的副本應回源，不得回傳另一個商品或錯誤價格。");
    }
    await cache.KeyDeleteAsync(CachedProducts.Key(1));
});

await Check("不存在的商品不建立成功副本", async () =>
{
    var products = new CachedProducts(store, cache, TimeSpan.FromSeconds(30));
    Require(await products.GetAsync(int.MaxValue, token) is null, "不存在的商品應回傳 null。");
    Require(!await cache.KeyExistsAsync(CachedProducts.Key(int.MaxValue)), "不能建立不存在商品的成功快取。");
});

await Check("無法連線的 Redis client 有界回源", async () =>
{
    using var unreachable = await ConnectionMultiplexer.ConnectAsync(LabOptions.RedisOptions(port: 1));
    var products = new CachedProducts(store, unreachable.GetDatabase(), TimeSpan.FromSeconds(30));
    ProductRead read = (await products.GetAsync(1, token))!;
    Require(read.Source == "database-fallback" && read.Product.Id == 1, "連線失敗應回源。");
});

await Check("無法路由的發布保留 Outbox，修復後恢復", async () =>
{
    var topology = await NewTopology();
    OrderPlaced message = await NewOrder();
    await using var channel = await connection.CreateChannelAsync(cancellationToken: token);
    await channel.QueueUnbindAsync(topology.WorkQueue, topology.Events, BrokerTopology.RoutingKey, cancellationToken: token);
    await using var publisher = await ConfirmedPublisher.CreateAsync(connection, topology, token);
    var dispatcher = new OutboxDispatcher(store, publisher);
    await Expect<PublishException>(async () => { await dispatcher.DispatchAsync(token); });
    Require(await Count("SELECT count(*) FROM outbox_messages WHERE message_id=$1 AND published_at IS NULL", message.MessageId) == 1,
        "發布失敗不可標記完成。");
    await channel.QueueBindAsync(topology.WorkQueue, topology.Events, BrokerTopology.RoutingKey, cancellationToken: token);
    Require(await dispatcher.DispatchAsync(token) == 1, "修復後必須能重新發布。");
    await using var consumer = await NotificationConsumer.StartAsync(connection, topology, store.RecordNotificationAsync, token);
    await Until(async () => await store.GetOrderAsync(message.OrderId, token) is { NotificationRecorded: true }, consumer);
});

await Check("Outbox 寫入失敗讓新訂單一起回滾", async () =>
{
    OrderPlaced original = await NewOrder();
    Guid conflictingOrder = Guid.NewGuid();
    await Expect<PostgresException>(() => store.CreateOrderAsync(conflictingOrder, original.MessageId, 1, 2, token),
        error => error.SqlState == PostgresErrorCodes.UniqueViolation);
    Require(await store.GetOrderAsync(conflictingOrder, token) is null, "不能留下沒有 Outbox 的新訂單。");
    Require(await Count("SELECT count(*) FROM outbox_messages WHERE message_id=$1", original.MessageId) == 1, "既有事件不得被改寫。");
});

await Check("非法件數與 SQL 約束不留下訂單", async () =>
{
    Guid id = Guid.NewGuid();
    await Expect<ArgumentOutOfRangeException>(() => store.CreateOrderAsync(id, Guid.NewGuid(), 1, 0, token));
    Require(await store.GetOrderAsync(id, token) is null, "拒絕的數量不能建立訂單。");
    await Expect<PostgresException>(async () =>
    {
        await using var command = database.CreateCommand("INSERT INTO orders (id, product_id, quantity) VALUES ($1, 1, 0)");
        command.Parameters.AddWithValue(id);
        await command.ExecuteNonQueryAsync(token);
    }, error => error.SqlState == PostgresErrorCodes.CheckViolation);
});

await Check("同一事件並行處理只有一份通知結果", async () =>
{
    OrderPlaced message = await NewOrder();
    bool[] results = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => store.RecordNotificationAsync(message, token)));
    Require(results.Count(first => first) == 1, "同一 MessageId 只有一個處理者可以首次提交。");
    Require(await Count("SELECT count(*) FROM notifications WHERE order_id=$1", message.OrderId) == 1, "通知不可重複。");
    Require(await Count("SELECT count(*) FROM inbox_messages WHERE message_id=$1", message.MessageId) == 1, "Inbox 不可重複。");
});

await Check("業務結果失敗時 Inbox 回滾，修復後可重送", async () =>
{
    var message = new OrderPlaced(Guid.NewGuid(), Guid.NewGuid(), 1, 2, DateTimeOffset.UtcNow);
    await Expect<PostgresException>(() => store.RecordNotificationAsync(message, token),
        error => error.SqlState == PostgresErrorCodes.ForeignKeyViolation);
    Require(await Count("SELECT count(*) FROM inbox_messages WHERE message_id=$1", message.MessageId) == 0, "失敗事件不可留下成功 Inbox。");
    await store.CreateOrderAsync(message.OrderId, Guid.NewGuid(), 1, 2, token);
    Require(await store.RecordNotificationAsync(message, token), "修復後應允許重新處理。");
    Require(await Count("SELECT count(*) FROM notifications WHERE order_id=$1", message.OrderId) == 1, "修復後須有一份結果。");
});

await Check("資料庫提交後 Ack 前中斷，重送仍只有一份效果", async () =>
{
    var topology = await NewTopology();
    OrderPlaced message = await NewOrder();
    await using var publisher = await ConfirmedPublisher.CreateAsync(connection, topology, token);
    await publisher.PublishAsync(message, token: token);
    await using (var channel = await connection.CreateChannelAsync(cancellationToken: token))
    {
        BasicGetResult delivery = await Get(channel, topology.WorkQueue);
        Require(await store.RecordNotificationAsync(LabJson.ReadEvent(delivery.Body.Span), token), "首次處理須提交。");
        await channel.CloseAsync(cancellationToken: token); // 故意不 Ack，觸發重送。
    }
    int duplicateDeliveries = 0;
    await using var consumer = await NotificationConsumer.StartAsync(connection, topology, async (item, cancellation) =>
    {
        bool first = await store.RecordNotificationAsync(item, cancellation);
        if (!first) Interlocked.Increment(ref duplicateDeliveries);
        return first;
    }, token);
    await Until(() => Task.FromResult(Volatile.Read(ref duplicateDeliveries) == 1), consumer);
    Require(await Count("SELECT count(*) FROM notifications WHERE order_id=$1", message.OrderId) == 1, "重送不可新增結果。");
});

await Check("暫時失敗兩次後成功，處理次數有界", async () =>
{
    var topology = await NewTopology();
    OrderPlaced message = await NewOrder();
    int attempts = 0;
    await using var consumer = await NotificationConsumer.StartAsync(connection, topology, async (item, cancellation) =>
    {
        if (Interlocked.Increment(ref attempts) <= 2) throw new IOException("可控制的暫時故障");
        return await store.RecordNotificationAsync(item, cancellation);
    }, token);
    await using var publisher = await ConfirmedPublisher.CreateAsync(connection, topology, token);
    await publisher.PublishAsync(message, token: token);
    await Until(async () => await store.GetOrderAsync(message.OrderId, token) is { NotificationRecorded: true }, consumer);
    Require(attempts == 3, "應在第三次成功。");
    Require(await Count("SELECT count(*) FROM notifications WHERE order_id=$1", message.OrderId) == 1, "成功結果不可重複。");
});

await Check("持續失敗最多三次並進入死信", async () =>
{
    var topology = await NewTopology();
    OrderPlaced message = await NewOrder();
    int attempts = 0;
    await using var consumer = await NotificationConsumer.StartAsync(connection, topology, (_, _) =>
    {
        Interlocked.Increment(ref attempts);
        throw new IOException("可控制的持續故障");
    }, token);
    await using var publisher = await ConfirmedPublisher.CreateAsync(connection, topology, token);
    await publisher.PublishAsync(message, token: token);
    await using var channel = await connection.CreateChannelAsync(cancellationToken: token);
    BasicGetResult dead = await Get(channel, topology.FailedQueue, consumer);
    Require(LabJson.ReadEvent(dead.Body.Span).MessageId == message.MessageId && attempts == 3, "失敗訊息須在三次後保存至死信。");
    Require(NotificationConsumer.ReadAttempt(dead.BasicProperties.Headers) == 2, "最後一次的重試 header 應保留。");
    Require(await store.GetOrderAsync(message.OrderId, token) is { NotificationRecorded: false }, "失敗工作不能留下成功通知。");
    await channel.BasicAckAsync(dead.DeliveryTag, false, token);
});

await Check("毒訊息與無效重試 header 直接隔離", async () =>
{
    foreach (bool invalidHeader in new[] { false, true })
    {
        var topology = await NewTopology();
        await using var consumer = await NotificationConsumer.StartAsync(connection, topology, store.RecordNotificationAsync, token);
        await using var publisher = await ConfirmedPublisher.CreateAsync(connection, topology, token);
        var message = new OrderPlaced(Guid.NewGuid(), Guid.NewGuid(), 1, 2, DateTimeOffset.UtcNow);
        var properties = new BasicProperties
        {
            DeliveryMode = DeliveryModes.Persistent, MessageId = message.MessageId.ToString(), ContentType = "application/json",
            Headers = new Dictionary<string, object?> { ["x-lab-attempt"] = invalidHeader ? -1 : 0 }
        };
        byte[] body = invalidHeader ? JsonSerializer.SerializeToUtf8Bytes(message, LabJson.Options) : Encoding.UTF8.GetBytes("{invalid-json");
        await publisher.PublishRawAsync(topology.Events, BrokerTopology.RoutingKey, properties, body, token);
        await using var channel = await connection.CreateChannelAsync(cancellationToken: token);
        BasicGetResult dead = await Get(channel, topology.FailedQueue, consumer);
        Require(dead.BasicProperties.MessageId == message.MessageId.ToString(), "毒訊息須保留識別碼。");
        await channel.BasicAckAsync(dead.DeliveryTag, false, token);
    }
});

await Check("Outbox 保存並傳遞 W3C traceparent", async () =>
{
    OrderPlaced message;
    string parent;
    using (var activity = new Activity("checks.create-order").SetIdFormat(ActivityIdFormat.W3C).Start())
    {
        parent = activity.Id!;
        message = await NewOrder();
    }
    PendingEvent pending = (await store.PendingAsync(token)).Single(item => item.Event.MessageId == message.MessageId);
    Require(pending.TraceParent == parent, "Outbox 必須保存原始追蹤 context。");
    var topology = await NewTopology();
    var spans = new ConcurrentBag<Activity>();
    using var listener = new ActivityListener
    {
        ShouldListenTo = source => source.Name == "DevWiki.Labs",
        Sample = (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllDataAndRecorded,
        ActivityStopped = spans.Add
    };
    ActivitySource.AddActivityListener(listener);
    await using var consumer = await NotificationConsumer.StartAsync(connection, topology, store.RecordNotificationAsync, token);
    await using var publisher = await ConfirmedPublisher.CreateAsync(connection, topology, token);
    await publisher.PublishAsync(message, pending.TraceParent, token: token);
    await Until(() => Task.FromResult(spans.Any()), consumer);
    Activity span = spans.Single();
    Require(span.Kind == ActivityKind.Consumer && span.TraceId.ToString() == parent.Split('-')[1]
        && span.ParentSpanId.ToString() == parent.Split('-')[2], "Consumer 必須接回原 trace 與 parent。");
});

await Check("準備已確認的 Redis 與 Broker 重啟資料", async () =>
{
    await cache.StringSetAsync("devwiki:checks:persistence", "confirmed-before-restart", TimeSpan.FromMinutes(30));
    RedisResult result = await cache.ExecuteAsync("WAITAOF", 1, 0, 5000);
    var counts = (RedisResult[])result!;
    Require((long)counts[0] >= 1, "重啟前需確認本地 AOF fsync。");
    OrderPlaced message = await store.CreateOrderAsync(recoveryOrder, recoveryMessage, 1, 2, token);
    await using var publisher = await ConfirmedPublisher.CreateAsync(connection, recoveryTopology, token);
    await publisher.PublishAsync(message, token: token);
    await store.MarkPublishedAsync(message.MessageId, token);
    Require(await store.GetOrderAsync(recoveryOrder, token) is { NotificationRecorded: false }, "工作應等待重啟後才消費。");
});
Console.WriteLine("初始整合驗證通過；等待服務重啟恢復驗證。");

async Task<BrokerTopology> NewTopology()
{
    var topology = new BrokerTopology("devwiki.checks." + Guid.NewGuid().ToString("N"));
    await topology.DeclareAsync(connection, token);
    return topology;
}

Task<OrderPlaced> NewOrder() => store.CreateOrderAsync(Guid.NewGuid(), Guid.NewGuid(), 1, 2, token);

async Task<long> Count(string sql, object? parameter = null)
{
    await using var command = database.CreateCommand(sql);
    if (parameter is not null) command.Parameters.AddWithValue(parameter);
    return Convert.ToInt64(await command.ExecuteScalarAsync(token));
}

async Task<BasicGetResult> Get(IChannel channel, string queue, NotificationConsumer? consumer = null)
{
    BasicGetResult? found = null;
    await Until(async () => (found = await channel.BasicGetAsync(queue, autoAck: false, token)) is not null, consumer);
    return found!;
}

async Task Until(Func<Task<bool>> condition, NotificationConsumer? consumer = null)
{
    long start = Stopwatch.GetTimestamp();
    while (!await condition())
    {
        if (consumer?.Completion.IsCompleted == true) await consumer.Completion;
        if (Stopwatch.GetElapsedTime(start) > TimeSpan.FromSeconds(15)) throw new TimeoutException("等待可觀察的結果超時。");
        await Task.Delay(25, token);
    }
}

static void Require(bool condition, string explanation)
{
    if (!condition) throw new InvalidOperationException(explanation);
}

static async Task Expect<T>(Func<Task> action, Func<T, bool>? match = null) where T : Exception
{
    try { await action(); }
    catch (T error) when (match?.Invoke(error) ?? true) { return; }
    throw new InvalidOperationException("預期的失敗沒有發生：" + typeof(T).Name);
}

static async Task Check(string name, Func<Task> action)
{
    await action();
    Console.WriteLine("✓ " + name);
}
