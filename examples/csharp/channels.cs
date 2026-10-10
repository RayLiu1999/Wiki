// ✅ Good：有界佇列提供背壓防護，並優雅消費
using System.Threading.Channels;

var options = new BoundedChannelOptions(capacity: 2)
{
    FullMode = BoundedChannelFullMode.Wait, // 滿載時生產者非同步等待（背壓）
    SingleWriter = true,
    SingleReader = true
};
var channel = Channel.CreateBounded<string>(options);

// 啟動消費者 Worker
var consumerTask = Task.Run(async () =>
{
    await foreach (var item in channel.Reader.ReadAllAsync())
    {
        Console.WriteLine($"消費事件: {item}");
    }
});

// 生產者寫入事件
await channel.Writer.WriteAsync("訂單付款完成");
await channel.Writer.WriteAsync("庫存扣減通知");

// 生產完畢，明確告知管線關閉
channel.Writer.Complete();

// 等待所有排隊事件消費完畢
await consumerTask;
Console.WriteLine("所有通道事件處理完畢");
