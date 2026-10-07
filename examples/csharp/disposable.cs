using (var resource = new DemoResource())
{
    Console.WriteLine("使用資源");
}

Console.WriteLine("離開區塊");

class DemoResource : IDisposable
{
    public void Dispose()
    {
        Console.WriteLine("已釋放");
    }
}
