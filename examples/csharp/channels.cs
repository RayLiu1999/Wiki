using System.Threading.Channels;

var channel = Channel.CreateBounded<int>(new BoundedChannelOptions(2)
{
    FullMode = BoundedChannelFullMode.Wait,
    SingleWriter = true,
    SingleReader = true
});
Task consumer = ConsumeAsync(channel.Reader);
for (int i = 1; i <= 3; i++) await channel.Writer.WriteAsync(i);
channel.Writer.TryComplete();
await consumer;

static async Task ConsumeAsync(ChannelReader<int> reader)
{
    await foreach (int item in reader.ReadAllAsync())
        Console.WriteLine(item);
}
