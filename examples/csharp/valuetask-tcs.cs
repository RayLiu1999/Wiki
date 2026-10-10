// ✅ Good：結合 ValueTask 零配置與安全 TaskCompletionSource
var service = new OrderStockService();

// 1. 快速路徑：快取命中，零 Heap 配置
int stock1 = await service.GetStockAsync("P01");
Console.WriteLine($"快取庫存: {stock1}");

// 2. 慢速路徑：透過安全的 TCS 非同步通知結果
var tcs = new TaskCompletionSource<int>(TaskCreationOptions.RunContinuationsAsynchronously);
_ = Task.Run(async () =>
{
    await Task.Delay(20);
    // 在獨立 ThreadPool 執行緒執行續行，不卡住目前排程
    tcs.TrySetResult(99);
});

int stock2 = await tcs.Task;
Console.WriteLine($"遠端回傳庫存: {stock2}");

public sealed class OrderStockService
{
    private readonly Dictionary<string, int> _cache = new() { ["P01"] = 50 };

    public ValueTask<int> GetStockAsync(string sku)
    {
        // 快速路徑：直接以 struct 包裝數值回傳，無 Heap 配置
        if (_cache.TryGetValue(sku, out int count))
        {
            return new ValueTask<int>(count);
        }

        // 慢速路徑：回退至非同步 Task
        return new ValueTask<int>(FetchRemoteAsync(sku));
    }

    private static async Task<int> FetchRemoteAsync(string sku)
    {
        await Task.Delay(10);
        return 10;
    }
}
