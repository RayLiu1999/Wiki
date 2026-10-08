using MySqlConnector;

public static class MySqlProductQueries
{
    // 呼叫端提供已存在的 products(id, price)；本範例不建立資料表。
    public static async Task<decimal?> ReadPriceAsync(
        MySqlDataSource source, long productId, CancellationToken token)
    {
        await using var connection = await source.OpenConnectionAsync(token);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT price FROM products WHERE id = @id";
        command.Parameters.Add("@id", MySqlDbType.Int64).Value = productId;
        object? value = await command.ExecuteScalarAsync(token);
        return value is null or DBNull ? null : Convert.ToDecimal(value);
    }
}
