---
title: "Channel 與有界背景工作"
description: "用生產者與消費者模型控制工作流量，理解背壓、完成與取消。"
articleId: "csharp-channels"
topic: "csharp"
category: "practice"
order: 23
tags: ["Channel<T>", "Channel", "背壓", "生產者", "消費者", "ValueTask", "IAsyncEnumerable"]
difficulty: "intermediate"
prerequisites: ["csharp-async-coordination", "csharp-cancellation"]
relatedArticles: ["csharp-thread-safety", "aspnet-core-dependency-injection"]
applicableVersions: "以 .NET 10 / C# 14 核對；個別語法與 API 的最低版本見內文。"
verifiedWith: ".NET SDK 10.0.105 / net10.0 / C# 14；完整 Program.cs 已納入編譯與輸出驗證。"
lastReviewed: "2026-10-07"
takeaway: "有界 Channel 能控制積壓的工作量；滿載時的等待或丟棄策略必須由業務決定。"
noteDates: ["2026-05-21", "2026-05-27"]
sources: [{"title": "Microsoft Learn：System.Threading.Channels", "url": "https://learn.microsoft.com/en-us/dotnet/core/extensions/channels"}]
---

## 先決定可積壓多少工作

Channel 連接生產者與消費者，提供並行安全的寫入與非同步讀取。無界佇列使用方便，但消費速度跟不上時可能持續增加記憶體；有界 Channel 可以讓生產者等待空間，形成背壓。

~~~csharp title="Program.cs"
using System.Threading.Channels;

var channel = Channel.CreateBounded<int>(new BoundedChannelOptions(2)
{
    FullMode = BoundedChannelFullMode.Wait,
    SingleWriter = true,
    SingleReader = true
});
Task consumer = ConsumeAsync(channel.Reader);
for (int i = 1; i <= 3; i++) await channel.Writer.WriteAsync(i);
channel.Writer.TryComplete();
await consumer;

static async Task ConsumeAsync(ChannelReader<int> reader)
{
    await foreach (int item in reader.ReadAllAsync())
        Console.WriteLine(item);
}
~~~

預期輸出：

~~~text
1
2
3
~~~

Channel 在 .NET Core 3.0 以上共享框架中提供；本例用 .NET 10 驗證。WriteAsync 在無空間時非同步等待，ReadAllAsync 在完成且已排空後結束。

## 完成、取消與丟棄

正式流程需在生產者的 finally 完成 writer，失敗時可以把例外交給 TryComplete；WriteAsync 與 ReadAllAsync 也應接收關閉流程的取消 token。若消費者失敗，需通知生產者，避免一直等不到空間。

DropOldest、DropNewest、DropWrite 會失去項目，適合允許丟棄的資料，不能直接套到付款或訂單。SingleReader / SingleWriter 是對實際使用的承諾，不能在多個讀寫者下隨意設成 true。

Channel 只在 process 記憶體中，重啟會失去未處理項目；需要耐久性或跨 Pod 傳遞時，應選擇有對應保證的訊息系統。
