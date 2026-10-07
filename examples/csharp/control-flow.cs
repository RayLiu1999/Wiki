int[] numbers = { 2, 4, 6 };
int total = 0;

foreach (int number in numbers)
{
    total += number;
}

if (total >= 10)
{
    Console.WriteLine("總和至少是 10");
}
else
{
    Console.WriteLine("總和小於 10");
}
