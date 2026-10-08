Task<int> quote = LoadQuoteAsync();
Console.WriteLine("已取得作業");
try
{
    Console.WriteLine(await quote);
}
catch (InvalidOperationException error)
{
    Console.WriteLine(error.Message);
}

static async Task<int> LoadQuoteAsync()
{
    await Task.Yield();
    throw new InvalidOperationException("報價暫時不可用");
}
