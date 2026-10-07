int original = 1;
int copy = original;
copy = 2;
Console.WriteLine($"{original}, {copy}");

var first = new Counter { Value = 1 };
var second = first;
second.Value = 2;
Console.WriteLine($"{first.Value}, {second.Value}");

class Counter
{
    public int Value { get; set; }
}
