---
title: "Outbox、Inbox 與最終一致性"
description: "用本地交易保存待發布事件與消費結果，分析資料庫提交、Broker 確認及 Ack 之間的故障窗口。"
articleId: "architecture-outbox-inbox"
topic: "architecture"
category: "application-patterns"
order: 4
tags: ["Transactional Outbox","Inbox","冪等","Integration Event","PostgreSQL","transaction","MessageId","最終一致性"]
difficulty: "intermediate"
prerequisites: ["data-access-transactions","rabbitmq-acknowledgements","architecture-communication-boundaries"]
relatedArticles: ["rabbitmq-retries-idempotency","engineering-cache-messaging-tests","redis-cache-aside"]
applicableVersions: "以 .NET 10、Redis 8.2.10、RabbitMQ 4.3.6、PostgreSQL 18.6 的教學案例說明。"
verifiedWith: "已以 PostgreSQL 18.6 與 RabbitMQ 4.3.6 驗證 Outbox／Inbox 交易回滾、重送去重、Broker 重啟與獨立 API／Worker；結果為資料庫模擬通知。"
lastReviewed: "2026-10-08"
takeaway: "本地交易保護資料與意圖，Outbox 與 Inbox 協助恢復；跨邊界仍可能重送，因此結果必須冪等。"
noteDates: []
sources: [{"title":"Microsoft Learn：非同步訊息與 Outbox","url":"https://learn.microsoft.com/en-us/dotnet/architecture/microservices/architect-microservice-container-applications/asynchronous-message-based-communication"},{"title":"Microsoft Learn：訂閱與冪等","url":"https://learn.microsoft.com/en-us/dotnet/architecture/microservices/multi-container-microservice-net-applications/subscribe-events"},{"title":"PostgreSQL：Constraints","url":"https://www.postgresql.org/docs/18/ddl-constraints.html"},{"title":"RabbitMQ：Reliability","url":"https://www.rabbitmq.com/docs/reliability"}]
learningDepth: "deep"
---

訂單和事件要一起留下可恢復的交付意圖；消費者則要在重送後保護結果。Outbox 與 Inbox 分別靠本地交易維持各自邊界，中間的發布和確認仍可能重複。

## 資料庫與發布之間的窗口

先提交訂單再發布，若程序在兩步之間中斷，會留下沒有事件的訂單。先發布再提交，Consumer 可能處理一筆最後回滾的訂單。本地資料庫 transaction 不會自然涵蓋 Broker 發布。

Outbox 把「需要發布這個事件」的意圖與訂單一起保存。背景發布器讀取待發布紀錄，送到 Broker，確認後才記錄 published_at。程序重新啟動時仍能找到尚未完成的工作。

## 在同一個交易建立訂單與事件

下列片段取自 OrderStore.CreateOrderAsync。外層已建立 message、connection 與 transaction；payload 使用版本 1 契約，trace_parent 保存目前追蹤 context。Npgsql 使用參數，避免以字串拼接建立 SQL。

~~~csharp title="OrderStore.cs（同一交易）"
await using var order = new NpgsqlCommand(
    "INSERT INTO orders (id, product_id, quantity, created_at) VALUES ($1, $2, $3, $4)", connection, transaction);
order.Parameters.AddWithValue(message.OrderId);
order.Parameters.AddWithValue(message.ProductId);
order.Parameters.AddWithValue(message.Quantity);
order.Parameters.AddWithValue(message.OccurredAt);
await order.ExecuteNonQueryAsync(token);

await using var outbox = new NpgsqlCommand(
    "INSERT INTO outbox_messages (message_id, order_id, payload, occurred_at, trace_parent) VALUES ($1, $2, $3, $4, $5)",
    connection, transaction);
outbox.Parameters.AddWithValue(message.MessageId);
outbox.Parameters.AddWithValue(message.OrderId);
outbox.Parameters.AddWithValue(NpgsqlDbType.Jsonb, JsonSerializer.Serialize(message, JsonDefaults.Options));
outbox.Parameters.AddWithValue(message.OccurredAt);
outbox.Parameters.Add(new NpgsqlParameter { NpgsqlDbType = NpgsqlDbType.Text, Value = (object?)Activity.Current?.Id ?? DBNull.Value });
await outbox.ExecuteNonQueryAsync(token);
await transaction.CommitAsync(token);
~~~

若 Outbox 寫入因唯一約束失敗，外層 transaction 被釋放並回滾，剛新增的訂單也不會留下。schema 的 comment、主鍵、外鍵與正數件數限制都在實驗初始化 SQL 中維護。

## Confirm 後再記錄，仍可能重送

發布器使用同一個 MessageId 重試。Broker 已接收，但 published_at 尚未提交時程序中斷，下次發布器仍會送出相同事件。這是可預期的重複窗口，不是可以透過一個本地交易完全消除的問題。

本案例用單一發布器與每次最多 20 筆的批次。多個發布器可評估資料庫 claim／lease 或 SKIP LOCKED 等協調，但需要限制持鎖時間與處理逾時；不能在沒有驗證的情況下宣稱擴充後不會重複發布。

## Inbox 與結果一起提交

Consumer 收到訊息後，用穩定邏輯名稱 notifications-v1 與 MessageId 新增 Inbox；同一交易建立 notifications 結果，再 Ack。

~~~csharp title="OrderStore.cs（消費交易）"
await using var inbox = new NpgsqlCommand(
    "INSERT INTO inbox_messages (consumer_name, message_id) VALUES ('notifications-v1', $1) ON CONFLICT DO NOTHING",
    connection, transaction);
inbox.Parameters.AddWithValue(message.MessageId);
if (await inbox.ExecuteNonQueryAsync(token) == 0)
{
    await transaction.CommitAsync(token);
    return false;
}

await using var notification = new NpgsqlCommand(
    "INSERT INTO notifications (order_id, message_id) VALUES ($1, $2) ON CONFLICT (order_id) DO NOTHING",
    connection, transaction);
notification.Parameters.AddWithValue(message.OrderId);
notification.Parameters.AddWithValue(message.MessageId);
await notification.ExecuteNonQueryAsync(token);
await transaction.CommitAsync(token);
~~~

主鍵保護同一 Consumer 的事件去重，通知表的 order_id 主鍵保護同一訂單最多一筆模擬結果。若處理失敗，Inbox 也一起回滾，下一次仍可執行。只先記錄去重再做效果，會讓失敗的工作被誤認為完成。

## 說清楚保證與生命週期

本案例的 API 與 Worker 是不同程序，共用一個教學資料庫。Inbox 與通知結果在該資料庫具有原子性；它沒有實際寄信，也沒有把其他服務的資料庫納入交易。

若真實效果是付款或郵件，需使用供應商的冪等鍵、可查詢結果或自己的外送工作流程。Redis 去重 Key 可能過期或被淘汰，不能取代此處的持久化契約。

清理已發布 Outbox 與 Inbox 時，保留期間要涵蓋重試、訊息保存與人工重送窗口。過早移除去重紀錄，會讓很晚的重送再次執行業務效果。

## 用故障測試核對邊界

[隔離故障驗證](/practice/ecommerce/failure-drills/)會核對 Outbox 寫入失敗時訂單回滾、Consumer 效果失敗時 Inbox 回滾、並行重複事件只有一份通知結果，以及提交後 Ack 前中斷的重送。也會在 RabbitMQ 重新啟動後確認已保存的工作能繼續處理。

## 套用到電商情境

本篇的 API 提交訂單加 Outbox，發布器等待 Confirm 後記錄，Consumer 提交 Inbox 加模擬通知再 Ack。結果只保存於資料庫，沒有外部郵件。遷移多 Pod 前還需跨程序 claim／lease，穩定事件 ID 與 Consumer 去重不能代替工作領取協定。

[閱讀對應的電商章節](/projects/ecommerce/reliable-events/)，把本篇概念接到整個用例。
