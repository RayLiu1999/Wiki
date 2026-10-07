#nullable enable

Func<int, int> doubleValue = value => value * 2;
Console.WriteLine(doubleValue(3));

var sensor = new Sensor();
sensor.Changed += value => Console.WriteLine($"溫度：{value}");
sensor.Update(26);

class Sensor
{
    public event Action<int>? Changed;

    public void Update(int value)
    {
        Changed?.Invoke(value);
    }
}
