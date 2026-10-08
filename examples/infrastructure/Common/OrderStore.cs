using System.Diagnostics;
using System.Text.Json;
using Npgsql;
using NpgsqlTypes;

namespace DevWiki.Labs;

public sealed record PendingEvent(OrderPlaced Event, string? TraceParent);

public sealed class OrderStore(NpgsqlDataSource database)
{
    public async Task<Product?> GetProductAsync(int id, CancellationToken token = default)
    {
        await using var command = database.CreateCommand("SELECT id, name, price, version FROM products WHERE id = $1");
        command.Parameters.AddWithValue(id);
        await using var reader = await command.ExecuteReaderAsync(token);
        return await reader.ReadAsync(token)
            ? new Product(reader.GetInt32(0), reader.GetString(1), reader.GetDecimal(2), reader.GetInt64(3)) : null;
    }

    public async Task<bool> UpdatePriceAsync(int id, decimal price, CancellationToken token = default)
    {
        await using var command = database.CreateCommand("UPDATE products SET price = $2, version = version + 1 WHERE id = $1");
        command.Parameters.AddWithValue(id);
        command.Parameters.AddWithValue(price);
        return await command.ExecuteNonQueryAsync(token) == 1;
    }

    public async Task<OrderPlaced> CreateOrderAsync(Guid orderId, Guid messageId, int productId, int quantity, CancellationToken token = default)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(quantity);
        var message = new OrderPlaced(messageId, orderId, productId, quantity, DateTimeOffset.UtcNow);
        await using var connection = await database.OpenConnectionAsync(token);
        await using var transaction = await connection.BeginTransactionAsync(token);

        // wiki:start:outbox-transaction
        await using var order = new NpgsqlCommand(
            "INSERT INTO orders (id, product_id, quantity, created_at) VALUES ($1, $2, $3, $4)", connection, transaction);
        order.Parameters.AddWithValue(message.OrderId);
        order.Parameters.AddWithValue(message.ProductId);
        order.Parameters.AddWithValue(message.Quantity);
        order.Parameters.AddWithValue(message.OccurredAt);
        await order.ExecuteNonQueryAsync(token);

        await using var outbox = new NpgsqlCommand(
            "INSERT INTO outbox_messages (message_id, order_id, payload, occurred_at, trace_parent) VALUES ($1, $2, $3, $4, $5)",
            connection, transaction);
        outbox.Parameters.AddWithValue(message.MessageId);
        outbox.Parameters.AddWithValue(message.OrderId);
        outbox.Parameters.AddWithValue(NpgsqlDbType.Jsonb, JsonSerializer.Serialize(message, LabJson.Options));
        outbox.Parameters.AddWithValue(message.OccurredAt);
        outbox.Parameters.Add(new NpgsqlParameter { NpgsqlDbType = NpgsqlDbType.Text, Value = (object?)Activity.Current?.Id ?? DBNull.Value });
        await outbox.ExecuteNonQueryAsync(token);
        await transaction.CommitAsync(token);
        // wiki:end:outbox-transaction
        return message;
    }

    public async Task<IReadOnlyList<PendingEvent>> PendingAsync(CancellationToken token = default)
    {
        await using var command = database.CreateCommand(
            "SELECT payload::text, trace_parent FROM outbox_messages WHERE published_at IS NULL ORDER BY occurred_at, message_id LIMIT 20");
        await using var reader = await command.ExecuteReaderAsync(token);
        var messages = new List<PendingEvent>();
        while (await reader.ReadAsync(token))
        {
            var message = JsonSerializer.Deserialize<OrderPlaced>(reader.GetString(0), LabJson.Options)
                ?? throw new JsonException("Outbox 事件不可為 null。");
            messages.Add(new PendingEvent(message, reader.IsDBNull(1) ? null : reader.GetString(1)));
        }
        return messages;
    }

    public async Task MarkPublishedAsync(Guid id, CancellationToken token = default)
    {
        await using var command = database.CreateCommand(
            "UPDATE outbox_messages SET published_at = now() WHERE message_id = $1 AND published_at IS NULL");
        command.Parameters.AddWithValue(id);
        await command.ExecuteNonQueryAsync(token);
    }

    public async Task<bool> RecordNotificationAsync(OrderPlaced message, CancellationToken token = default)
    {
        await using var connection = await database.OpenConnectionAsync(token);
        await using var transaction = await connection.BeginTransactionAsync(token);
        // wiki:start:inbox-transaction
        await using var inbox = new NpgsqlCommand(
            "INSERT INTO inbox_messages (consumer_name, message_id) VALUES ('notifications-v1', $1) ON CONFLICT DO NOTHING",
            connection, transaction);
        inbox.Parameters.AddWithValue(message.MessageId);
        if (await inbox.ExecuteNonQueryAsync(token) == 0)
        {
            await transaction.CommitAsync(token);
            return false;
        }

        await using var notification = new NpgsqlCommand(
            "INSERT INTO notifications (order_id, message_id) VALUES ($1, $2) ON CONFLICT (order_id) DO NOTHING",
            connection, transaction);
        notification.Parameters.AddWithValue(message.OrderId);
        notification.Parameters.AddWithValue(message.MessageId);
        await notification.ExecuteNonQueryAsync(token);
        await transaction.CommitAsync(token);
        // wiki:end:inbox-transaction
        return true;
    }

    public async Task<OrderStatus?> GetOrderAsync(Guid id, CancellationToken token = default)
    {
        await using var command = database.CreateCommand(
            "SELECT id, EXISTS(SELECT 1 FROM notifications WHERE order_id = orders.id) FROM orders WHERE id = $1");
        command.Parameters.AddWithValue(id);
        await using var reader = await command.ExecuteReaderAsync(token);
        return await reader.ReadAsync(token) ? new OrderStatus(reader.GetGuid(0), reader.GetBoolean(1)) : null;
    }
}
