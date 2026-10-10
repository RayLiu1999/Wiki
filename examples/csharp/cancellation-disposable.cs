// ✅ Good：非同步資源釋放與取消權杖串聯實作
using var cts = new CancellationTokenSource();
cts.CancelAfter(TimeSpan.FromMilliseconds(50));

try
{
    await using var session = new DatabaseSession();
    await session.ExecuteQueryAsync(cts.Token);
}
catch (OperationCanceledException)
{
    Console.WriteLine("作業已依取消請求及時中止");
}

public sealed class DatabaseSession : IAsyncDisposable
{
    public async Task ExecuteQueryAsync(CancellationToken cancellationToken)
    {
        Console.WriteLine("查詢開始執行");
        // 將 Token 一路向下傳遞給支援取消的非同步 API
        await Task.Delay(200, cancellationToken);
        Console.WriteLine("查詢完成");
    }

    public async ValueTask DisposeAsync()
    {
        // 非同步釋放連線或清空緩衝區，不阻塞 ThreadPool
        await Task.Delay(10);
        Console.WriteLine("連線已非同步安全釋放");
    }
}
