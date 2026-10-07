using var source = new CancellationTokenSource();
source.Cancel();

try
{
    await Task.Delay(1000, source.Token);
}
catch (OperationCanceledException) when (source.IsCancellationRequested)
{
    Console.WriteLine("已取消");
}
