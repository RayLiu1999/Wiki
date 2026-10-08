using System.Data.Common;
using Microsoft.Extensions.DependencyInjection;
using MySqlConnector;
using Npgsql;

bool validate = args.Length == 0 || args is ["--validate"];
bool probe = args is ["--probe", "mysql"] or ["--probe", "postgresql"];
if (!validate && !probe)
{
    Console.Error.WriteLine("使用方式：--validate 或 --probe mysql|postgresql");
    return 2;
}

// 預設只解析設定；保留網域不會被連線，也不需要真實密碼。
string mysql = "Server=mysql.example.invalid;Database=shop;User ID=learning";
string postgres = "Host=postgres.example.invalid;Database=shop;Username=learning";
if (probe)
{
    string variable = args[1] == "mysql" ? "DB_MYSQL" : "DB_POSTGRESQL";
    string? configured = Environment.GetEnvironmentVariable(variable);
    if (string.IsNullOrWhiteSpace(configured))
    {
        Console.Error.WriteLine($"請先由自己的安全設定提供 {variable}，程式不會輸出連線字串。");
        return 2;
    }
    if (args[1] == "mysql") mysql = configured; else postgres = configured;
}

var services = new ServiceCollection();
services.AddSingleton(_ => ConnectionSetup.CreateMySql(mysql));
services.AddSingleton(_ => ConnectionSetup.CreatePostgreSql(postgres));
await using var provider = services.BuildServiceProvider();
var mysqlSource = provider.GetRequiredService<MySqlDataSource>();
var postgresSource = provider.GetRequiredService<NpgsqlDataSource>();
if (validate)
{
    Console.WriteLine("MySQL 與 PostgreSQL DataSource 設定解析通過。");
    Console.WriteLine("此模式未建立資料庫連線，未驗證 CRUD 或效能。");
    return 0;
}

DbDataSource selected = args[1] == "mysql" ? mysqlSource : postgresSource;
using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
await using var connection = await selected.OpenConnectionAsync(deadline.Token);
await using var command = connection.CreateCommand();
command.CommandText = "SELECT 1";
object? result = await command.ExecuteScalarAsync(deadline.Token);
Console.WriteLine(Convert.ToInt32(result) == 1 ? "SELECT 1 連線檢查通過。" : "連線回應不符合預期。");
return Convert.ToInt32(result) == 1 ? 0 : 1;
