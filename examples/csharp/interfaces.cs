INotifier notifier = new ConsoleNotifier();
notifier.Notify("Hello");

interface INotifier
{
    void Notify(string message);
}

class ConsoleNotifier : INotifier
{
    public void Notify(string message)
    {
        Console.WriteLine($"通知：{message}");
    }
}
