List<DigitalProduct> products = [new(1, "電子書"), new(2, "課程")];
IEnumerable<Product> readable = products;
Console.WriteLine(string.Join(", ", GetIds(readable)));
Action<Product> log = product => Console.WriteLine(product.Name);
Action<DigitalProduct> logDigital = log;
logDigital(products[0]);

static IEnumerable<int> GetIds<T>(IEnumerable<T> items) where T : IIdentified
{
    foreach (T item in items) yield return item.Id;
}

public interface IIdentified { int Id { get; } }
public class Product(int id, string name) : IIdentified
{
    public int Id { get; } = id;
    public string Name { get; } = name;
}
public sealed class DigitalProduct(int id, string name) : Product(id, name);
