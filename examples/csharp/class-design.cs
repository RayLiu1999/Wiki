Report report = new OrderReport(42);
Console.WriteLine(report.Describe());

internal abstract class Report
{
    protected Report(string name) => Name = name;
    protected string Name { get; }
    public virtual string Describe() => Name;
}

internal sealed partial class OrderReport : Report
{
    public OrderReport() : this(0) { }
    public OrderReport(int id) : base("訂單") => Id = id;
    private int Id { get; }
}

internal sealed partial class OrderReport
{
    public override string Describe() => $"{Name}：{Id}";
}
