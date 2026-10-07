Console.WriteLine("開始");
string message = await ReadMessageAsync();
Console.WriteLine(message);

static async Task<string> ReadMessageAsync()
{
    await Task.Delay(10);
    return "完成";
}
