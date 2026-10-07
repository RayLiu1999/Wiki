int result = ApplyDiscount(200, 10);
Console.WriteLine(result);

static int ApplyDiscount(int price, int percent)
{
    return price * (100 - percent) / 100;
}
