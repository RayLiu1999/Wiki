int total = default;
object boxed = 42;
Console.WriteLine(nameof(total));
Console.WriteLine(total);
Console.WriteLine(typeof(int) == boxed.GetType());
Console.WriteLine(sizeof(int));
Console.WriteLine(Echo("泛型保留字串型別"));

static T Echo<T>(T value) => value;
