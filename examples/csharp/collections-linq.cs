// ✅ Good：具體化快取查詢、預給容量與 ReadOnlySpan 零配置解析
var source = new[] { 10, 20, 30, 40 };

// 1. 具體化（Materialize）：避免多次列舉重跑
var materialized = source.Where(x => x > 15).ToArray();
Console.WriteLine($"符合筆數: {materialized.Length}");
Console.WriteLine($"首筆數據: {materialized[0]}");

// 2. 集合預估容量：避免 4 -> 8 -> 16 反覆擴容拷貝
var resultList = new List<int>(capacity: materialized.Length);
resultList.AddRange(materialized);

// 3. ReadOnlySpan 零拷貝解析字串（不產生額外堆積物件）
string rawHeader = "ORDER-20261010-999";
ReadOnlySpan<char> span = rawHeader.AsSpan();
ReadOnlySpan<char> orderDate = span.Slice(6, 8); // 僅切片指標，0 堆積配置
Console.WriteLine($"解析日期: {orderDate.ToString()}");
