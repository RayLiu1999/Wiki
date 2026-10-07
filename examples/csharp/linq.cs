var numbers = new List<int> { 5, 6, 7 };
var query = numbers.Where(number => number >= 6)
                   .Select(number => number * 2);

numbers.Add(8);
var snapshot = query.ToList();
Console.WriteLine(string.Join(", ", snapshot));

numbers.Add(9);
Console.WriteLine(string.Join(", ", query));
