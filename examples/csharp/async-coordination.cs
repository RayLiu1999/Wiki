using var cancellation = new CancellationTokenSource();
Task<int>[] tasks = Enumerable.Range(1, 3)
    .Select(id => ReadAsync(id, cancellation.Token)).ToArray();
int[] results = await Task.WhenAll(tasks);
Console.WriteLine(string.Join(", ", results));
Console.WriteLine(await GetCachedAsync());

static async Task<int> ReadAsync(int id, CancellationToken token)
{
    await Task.Delay(1, token);
    return id * 10;
}
static ValueTask<int> GetCachedAsync() => ValueTask.FromResult(99);
