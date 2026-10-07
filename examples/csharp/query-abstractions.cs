using System.Runtime.CompilerServices;

using var cancellation = new CancellationTokenSource();
await foreach (int value in ReadAsync(cancellation.Token))
{
    Console.WriteLine(value);
}

static async IAsyncEnumerable<int> ReadAsync(
    [EnumeratorCancellation] CancellationToken token = default)
{
    for (int i = 1; i <= 3; i++)
    {
        await Task.Delay(1, token);
        yield return i;
    }
}
