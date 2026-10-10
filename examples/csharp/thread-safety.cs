// ✅ Good：運用 Interlocked 無鎖原子操作與 SemaphoreSlim 最小化持鎖
var metrics = new OrderMetrics();

// 1. Interlocked 無鎖遞增（由 CPU 硬體保證原子性，0 鎖競爭）
Parallel.For(0, 100, _ => metrics.IncrementOrder());
Console.WriteLine($"累計訂單數: {metrics.TotalOrders}");

// 2. 非同步臨界區持鎖範圍最小化
await metrics.SafeDeductStockAsync();
Console.WriteLine("庫存安全扣減完成");

public sealed class OrderMetrics
{
    private int _totalOrders;
    private int _stock = 10;
    private readonly SemaphoreSlim _lock = new(1, 1);

    public int TotalOrders => Volatile.Read(ref _totalOrders);

    public void IncrementOrder() => Interlocked.Increment(ref _totalOrders);

    public async Task SafeDeductStockAsync()
    {
        await _lock.WaitAsync();
        try
        {
            // 臨界區內僅做極速記憶體狀態變更，絕對不呼叫非同步 I/O
            if (_stock > 0) _stock--;
        }
        finally
        {
            _lock.Release();
        }
    }
}
