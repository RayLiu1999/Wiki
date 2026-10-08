using Npgsql;
using NpgsqlTypes;

public static class PostgreSqlProductQueries
{
    // 呼叫端提供已存在的 products(id, price)；本範例不建立資料表。
    public static async Task<decimal?> ReadPriceAsync(
        NpgsqlDataSource source, long productId, CancellationToken token)
    {
        await using var connection = await source.OpenConnectionAsync(token);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT price FROM products WHERE id = $1";
        command.Parameters.Add(new NpgsqlParameter { NpgsqlDbType = NpgsqlDbType.Bigint, Value = productId });
        object? value = await command.ExecuteScalarAsync(token);
        return value is null or DBNull ? null : Convert.ToDecimal(value);
    }
}
