// ✅ Good：宣告為 readonly struct 並透過 in 傳遞參照，零拷貝且執行期不可竄改
var point = new GeoPoint(10, 20);
ProcessLocation(in point);
Console.WriteLine($"座標計算: {point.X}, {point.Y}");
Console.WriteLine("防禦性複製已避免");

static void ProcessLocation(in GeoPoint location)
{
    // location 透過記憶體指標傳遞，不產生整筆 struct 的值拷貝
    _ = location.X + location.Y;
}

public readonly struct GeoPoint(double x, double y)
{
    public double X { get; } = x;
    public double Y { get; } = y;
}
