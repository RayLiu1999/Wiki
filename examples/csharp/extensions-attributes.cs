using System.Reflection;

Console.WriteLine("Ada".Greet());
Console.WriteLine(typeof(Job).GetCustomAttribute<NoteAttribute>()?.Message);

static class GreetingExtensions
{
    public static string Greet(this string name) => $"Hello, {name}";
}

[Note("每日排程")]
sealed class Job { }

[AttributeUsage(AttributeTargets.Class)]
sealed class NoteAttribute : Attribute
{
    public NoteAttribute(string message) => Message = message;
    public string Message { get; }
}
