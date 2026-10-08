await using (var session = new DemoSession())
{
    Console.WriteLine("處理訂單");
}
Console.WriteLine("離開工作範圍");

public sealed class DemoSession : IAsyncDisposable
{
    public async ValueTask DisposeAsync()
    {
        await Task.Yield();
        Console.WriteLine("非同步清理完成");
    }
}
