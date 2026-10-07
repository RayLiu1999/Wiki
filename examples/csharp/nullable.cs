#nullable enable

string? nickname = null;
string displayName = nickname ?? "訪客";
int? length = nickname?.Length;

Console.WriteLine(displayName);
Console.WriteLine(length?.ToString() ?? "沒有長度");
