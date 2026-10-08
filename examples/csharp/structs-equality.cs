var price = new UnitPrice(120m);
var other = new UnitPrice(120m);
Console.WriteLine(price == other);
object boxed = price;
price = price with { Value = 100m };
Console.WriteLine(((UnitPrice)boxed).Value);
Console.WriteLine(price.Value);
Console.WriteLine(default(UnitPrice).Value);

public readonly record struct UnitPrice(decimal Value);
