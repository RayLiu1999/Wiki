var tags = new List<string> { "C#", "PWA" };
var counts = new Dictionary<string, int> { ["C#"] = 3 };

tags.Add("Wiki");
Console.WriteLine(string.Join(", ", tags));

if (counts.TryGetValue("C#", out int count))
{
    Console.WriteLine(count);
}
