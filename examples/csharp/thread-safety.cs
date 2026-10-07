using System.Collections.Concurrent;

using var gate = new SemaphoreSlim(1, 1);
var values = new ConcurrentDictionary<int, int>();
var queue = new ConcurrentQueue<int>();
var settings = new Lazy<string>(() => "已初始化");
await gate.WaitAsync();
try
{
    values.GetOrAdd(1, static key => key * 10);
    queue.Enqueue(values[1]);
}
finally { gate.Release(); }
if (queue.TryDequeue(out int value)) Console.WriteLine(value);
Console.WriteLine(settings.Value);
