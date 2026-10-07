using System.Globalization;

decimal unitPrice = 198m;
int quantity = 3;
decimal total = unitPrice * quantity;

Console.WriteLine(total.ToString("0.00", CultureInfo.InvariantCulture));
