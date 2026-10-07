int count = 1;
Increment(ref count);
if (int.TryParse("42", out int parsed))
{
    Show(in parsed);
}
Console.WriteLine(count);

static void Increment(ref int value) => value++;
static void Show(in int value) => Console.WriteLine(value);
