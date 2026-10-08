---
title: ".NET 發布、消費與 Worker 生命週期"
description: "使用 RabbitMQ.Client 7 非同步 API，管理長連線、獨立 Channel、訊息記憶體與正常關閉。"
articleId: "rabbitmq-dotnet-integration"
topic: "rabbitmq"
category: "rabbitmq-integration"
order: 3
tags: ["RabbitMQ.Client","IConnection","IChannel","AsyncEventingBasicConsumer","Worker","BackgroundService","CancellationToken"]
difficulty: "intermediate"
prerequisites: ["rabbitmq-routing","dotnet-hosting","aspnet-core-dependency-injection"]
relatedArticles: ["rabbitmq-acknowledgements","rabbitmq-retries-idempotency","engineering-cache-messaging-tests"]
applicableVersions: "RabbitMQ 4.3.6／AMQP 0-9-1／RabbitMQ.Client 7.2.2／.NET 10。"
verifiedWith: "已以 SDK 10.0.105、RabbitMQ.Client 7.2.2 編譯執行範例，並驗證獨立 API／Worker 與三次有界重試。"
lastReviewed: "2026-10-08"
takeaway: "Connection 長時間重用，Channel 依工作分配；停止程序時讓未確認工作可以重送。"
noteDates: []
sources: [{"title":"RabbitMQ：.NET API Guide","url":"https://www.rabbitmq.com/client-libraries/dotnet-api-guide"},{"title":"RabbitMQ：可靠發布 C# 教學","url":"https://www.rabbitmq.com/tutorials/tutorial-seven-dotnet"},{"title":"Microsoft Learn：Worker services","url":"https://learn.microsoft.com/en-us/dotnet/core/extensions/workers"}]
---

## 使用與套件版本相符的 API

本案例使用 RabbitMQ.Client 7.2.2 的 IConnection、IChannel 與非同步方法。舊版教學常見 IModel、CreateModel 與同步呼叫，不能直接混入目前程式後宣稱已驗證。

ConnectionFactory 由環境設定取得帳號、port 與 devwiki vhost。Connection 是長時間網路連線；Channel 在同一個連線上提供邏輯通訊。頻繁為每則訊息建立 Connection 會增加握手與資源成本。

## 先跑最小發布與接收

以下片段取自 RabbitMqDemo/Program.cs。外層建立連線、唯一拓樸、讀取用 Channel 與 15 秒期限；ConfirmedPublisher 內部使用另一個 Channel。

~~~csharp title="RabbitMqDemo/Program.cs（已納入完整範例）"
await using var publisher = await ConfirmedPublisher.CreateAsync(connection, topology, token);
var message = new OrderPlaced(Guid.NewGuid(), Guid.NewGuid(), 1, 2, DateTimeOffset.UtcNow);
await publisher.PublishAsync(message, token: token);
Console.WriteLine("發布確認: broker 已接收");

BasicGetResult? delivery;
while ((delivery = await channel.BasicGetAsync(topology.WorkQueue, autoAck: false, token)) is null)
    await Task.Delay(50, token);
OrderPlaced received = LabJson.ReadEvent(delivery.Body.Span);
Console.WriteLine("消費內容: 商品 " + received.ProductId + "，數量 " + received.Quantity);
await channel.BasicAckAsync(delivery.DeliveryTag, multiple: false, token);
Console.WriteLine("消費確認: 已完成處理");
~~~

執行 pnpm lab:up 與 pnpm lab:rabbit，預期輸出：

~~~text
發布確認: broker 已接收
消費內容: 商品 1，數量 2
消費確認: 已完成處理
~~~

BasicGet 是為了讓最小範例容易看見一則訊息的生命週期。持續運作的 OrderWorker 使用 BasicConsumeAsync 與 AsyncEventingBasicConsumer，由 broker 推送工作。

## Channel 的並行與所有權

不要讓多個發布者任意同時操作同一個 Channel。本案例的 ConfirmedPublisher 使用 SemaphoreSlim 序列化發布，Consumer 接收與重試發布也使用不同 Channel。

每個 Consumer 依工作需求建立 DI scope，特別是使用 scoped DbContext 時；把 DbContext 當成共享單例會產生生命週期與並行問題。本案例使用 NpgsqlDataSource 共享連線池，每個交易取得自己的 connection。

## 訊息 body 的有效期間

RabbitMQ.Client 7 以 `ReadOnlyMemory<byte>` 提供 body，其使用期間受 callback 邊界限制。若要保留到 callback 之外，先複製或完成反序列化。本案例在 callback 開頭 ToArray，再解析版本、MessageId 與 payload。

MessageId 是去重識別碼，DeliveryTag 是目前 Channel 上的確認識別碼，兩者不能互換。若解析失敗，依政策送死信，而不是記錄後仍 Ack 成功。

## 取消、恢復與正常關閉

停止時取消背景迴圈，停止接收新工作，等待進行中的處理，再釋放 Channel 與 Connection。已完成資料庫交易但來不及 Ack 的訊息可能重送，因此正常關閉與冪等處理必須一起設計。

Automatic Recovery 協助連線中斷後恢復，仍需處理初次連線失敗、未確認發布與應用程式狀態。OrderWorker 在重試發布失敗時保留原訊息，讓程序停止並關閉 Channel 後由 broker 重新投遞。它是可執行的主控台 Worker；正式服務可整合 Generic Host／BackgroundService 與部署平台的停止訊號。
