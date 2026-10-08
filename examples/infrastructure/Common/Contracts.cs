using System.Text.Json;

namespace DevWiki.Labs;

public sealed record Product(int Id, string Name, decimal Price, long Version);
public sealed record ProductRead(Product Product, string Source);
public sealed record OrderPlaced(Guid MessageId, Guid OrderId, int ProductId, int Quantity, DateTimeOffset OccurredAt, int Version = 1);
public sealed record OrderStatus(Guid OrderId, bool NotificationRecorded);

public static class LabJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);

    public static OrderPlaced ReadEvent(ReadOnlySpan<byte> body)
    {
        var message = JsonSerializer.Deserialize<OrderPlaced>(body, Options)
            ?? throw new JsonException("事件不可為 null。");
        if (message.Version != 1 || message.MessageId == Guid.Empty || message.OrderId == Guid.Empty
            || message.ProductId <= 0 || message.Quantity <= 0 || message.OccurredAt == default)
            throw new JsonException("事件不符合 orders.placed.v1 契約。");
        return message;
    }
}
