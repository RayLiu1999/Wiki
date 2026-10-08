using Npgsql;
using RabbitMQ.Client;
using StackExchange.Redis;

namespace DevWiki.Labs;

public static class LabOptions
{
    public static NpgsqlDataSource Database()
    {
        var options = new NpgsqlConnectionStringBuilder
        {
            Host = "127.0.0.1",
            Port = Port("LAB_POSTGRES_PORT", 15432),
            Database = "devwiki",
            Username = Required("LAB_POSTGRES_USER"),
            Password = Required("LAB_POSTGRES_PASSWORD"),
            Timeout = 5,
            CommandTimeout = 5
        };
        return NpgsqlDataSource.Create(options.ConnectionString);
    }

    public static ConfigurationOptions RedisOptions(int? port = null) => new()
    {
        EndPoints = { { "127.0.0.1", port ?? Port("LAB_REDIS_PORT", 16379) } },
        AbortOnConnectFail = false,
        ConnectRetry = 0,
        ConnectTimeout = 500,
        AsyncTimeout = 500
    };

    public static ConnectionFactory RabbitFactory() => new()
    {
        HostName = "127.0.0.1",
        Port = Port("LAB_RABBITMQ_PORT", 5673),
        UserName = Required("LAB_RABBITMQ_USER"),
        Password = Required("LAB_RABBITMQ_PASSWORD"),
        VirtualHost = "devwiki",
        AutomaticRecoveryEnabled = true,
        RequestedConnectionTimeout = TimeSpan.FromSeconds(5),
        ConsumerDispatchConcurrency = 1
    };

    private static string Required(string name) =>
        Environment.GetEnvironmentVariable(name) is { Length: > 0 } value
            ? value : throw new InvalidOperationException($"缺少 {name}；請使用 pnpm lab:* 指令載入實驗設定。");

    private static int Port(string name, int fallback) =>
        int.TryParse(Environment.GetEnvironmentVariable(name), out int port) && port is > 0 and <= 65535
            ? port : fallback;
}
