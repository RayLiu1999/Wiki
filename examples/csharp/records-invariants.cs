List<string> tags = new() { "C#" };
var original = new Note("原始筆記", tags);
var copy = original with { Title = "副本" };
copy.Tags.Add("DDD");
Console.WriteLine(original.Title);
Console.WriteLine(string.Join(", ", original.Tags));
var quantity = new PositiveQuantity(2);
Console.WriteLine(quantity.Value);

record Note(string Title, List<string> Tags);

sealed record PositiveQuantity
{
    public PositiveQuantity(int value)
    {
        if (value < 1) throw new ArgumentOutOfRangeException(nameof(value));
        Value = value;
    }
    public int Value { get; }
}
