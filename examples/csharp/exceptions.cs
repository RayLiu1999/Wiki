try
{
    int count = int.Parse("oops");
    Console.WriteLine(count);
}
catch (FormatException)
{
    Console.WriteLine("請輸入有效整數");
}
