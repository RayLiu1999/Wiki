// ✅ Good：一路非同步到底（Async all the way），交還執行緒控制權
Console.WriteLine("非同步作業開始");
string data = await FetchDataAsync();
Console.WriteLine($"非同步作業完成: {data}");

static async Task<string> FetchDataAsync()
{
    // await 遇到未完成的作業時，立即釋放當前執行緒給 ThreadPool 去服務其他 HTTP 請求
    await Task.Delay(10);
    return "結果資料";
}
