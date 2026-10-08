using MySqlConnector;
using Npgsql;

public static class ConnectionSetup
{
    // 這些數值供教學設定檢查；實際值由容量與延遲量測決定。
    public static MySqlDataSource CreateMySql(string connectionString)
    {
        var options = new MySqlConnectionStringBuilder(connectionString)
        {
            Pooling = true,
            MinimumPoolSize = 0,
            MaximumPoolSize = 20,
            ConnectionTimeout = 5,
            DefaultCommandTimeout = 3,
            CancellationTimeout = 2, // 秒
            ConnectionReset = true,
            SslMode = MySqlSslMode.VerifyFull,
        };
        return new MySqlDataSourceBuilder(options.ConnectionString).Build();
    }

    public static NpgsqlDataSource CreatePostgreSql(string connectionString)
    {
        var options = new NpgsqlConnectionStringBuilder(connectionString)
        {
            Pooling = true,
            MinPoolSize = 0,
            MaxPoolSize = 20,
            Timeout = 5,
            CommandTimeout = 3,
            CancellationTimeout = 2000, // 毫秒
            NoResetOnClose = false,
            SslMode = SslMode.VerifyFull,
        };
        return new NpgsqlDataSourceBuilder(options.ConnectionString).Build();
    }
}
