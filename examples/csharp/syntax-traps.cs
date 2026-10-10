// ✅ Good：金額、庫存、稅率一律強制使用 128 位元十進位 decimal
decimal unitPrice = 99.99m;
int quantity = 3;
decimal total = unitPrice * quantity;
Console.WriteLine($"金額計算精確: {total}");

// 模式比對（Pattern Matching）安全評估狀態
OrderStatus status = OrderStatus.Paid;
string result = status switch
{
    OrderStatus.Paid => "可出貨",
    OrderStatus.Pending => "等待付款",
    OrderStatus.Cancelled or OrderStatus.Refunded => "已終止",
    _ => "未知狀態"
};
Console.WriteLine($"訂單狀態: {result}");

enum OrderStatus { Pending, Paid, Cancelled, Refunded }
