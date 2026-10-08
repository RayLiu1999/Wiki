---
title: "Ack、Publisher Confirm 與可靠傳遞"
description: "拆開發布與消費的確認邊界，理解持久化、退回、重送、Delivery Tag 與 Prefetch。"
articleId: "rabbitmq-acknowledgements"
topic: "rabbitmq"
category: "rabbitmq-integration"
order: 4
tags: ["Ack","Nack","Publisher Confirms","mandatory","durable","persistent","prefetch","at-least-once"]
difficulty: "intermediate"
prerequisites: ["rabbitmq-dotnet-integration","data-access-transactions"]
relatedArticles: ["rabbitmq-retries-idempotency","architecture-outbox-inbox","rabbitmq-queues-ordering"]
applicableVersions: "RabbitMQ 4.3.6／AMQP 0-9-1／RabbitMQ.Client 7.2.2／.NET 10。"
verifiedWith: "已驗證 Publisher Confirm、無路由失敗、手動 Ack，以及資料庫提交後 Ack 前關閉 Channel 的重送與去重。"
lastReviewed: "2026-10-08"
takeaway: "發布確認與消費確認是兩段獨立責任；穩定 MessageId 與冪等結果補上重送帶來的風險。"
noteDates: []
sources: [{"title":"RabbitMQ：Acknowledgements and Confirms","url":"https://www.rabbitmq.com/docs/confirms"},{"title":"RabbitMQ：Reliability","url":"https://www.rabbitmq.com/docs/reliability"},{"title":"RabbitMQ：Consumer Prefetch","url":"https://www.rabbitmq.com/docs/consumer-prefetch"}]
learningDepth: "deep"
---

Publisher Confirm 確認發布階段，Consumer Ack 確認消費交付階段。訂單已經提交、Broker 已經接受、通知已經完成，是需要分別核對的三件事。

## 分別確認兩段通訊

| 機制 | 由誰送出 | 確認的範圍 |
| --- | --- | --- |
| Publisher Confirm | Broker → Publisher | Broker 已依目的 Queue 的條件承擔訊息 |
| Consumer Ack | Consumer → Broker | Consumer 已完成自己承諾的處理 |
| mandatory return | Broker → Publisher | 發布的訊息沒有路由到任何 Queue |

收到 Publisher Confirm 不表示 Consumer 已處理，更不表示外部郵件已送達。應用程式若需要知道最終結果，要另設狀態查詢或回覆契約。

## 消費結果提交後才 Ack

本案例先在同一個 PostgreSQL 交易寫入 Inbox 與模擬通知，再執行 BasicAckAsync。若交易失敗，不能 Ack；若交易成功但 Ack 因網路中斷沒有到達，broker 可能重送。

autoAck=true 讓 broker 不再等待應用程式確認，可能在處理失敗時失去工作。manual Ack 保留恢復機會，但 Consumer 必須準備收到相同事件。

DeliveryTag 屬於傳遞所在的 Channel，必須在同一個 Channel 確認。multiple=true 還會涵蓋範圍內其他 DeliveryTag，併行工作不能因一則成功而提前確認尚未完成的訊息。

## 正確等待 Publisher Confirm

RabbitMQ.Client 7 的確認追蹤讓 BasicPublishAsync 的 await 等待 confirm，並以例外傳播 nack 或 mandatory 退回。建立發布 Channel 的片段如下：

~~~csharp title="Broker.cs（Publisher Channel）"
var options = new CreateChannelOptions(
    publisherConfirmationsEnabled: true,
    publisherConfirmationTrackingEnabled: true);
var channel = await connection.CreateChannelAsync(options, token);
~~~

後續發布仍需設定 mandatory=true、穩定 MessageId 與適當的訊息持久化。沒有啟用對應追蹤的 await，不能直接當成相同的確認保證。

## 耐久性是多項設定的組合

durable Queue 與 Exchange 保留必要拓樸；Persistent 訊息指定相應的保存需求；Publisher Confirm 讓發布者知道 broker 的接收結果；Quorum Queue 的複本條件則決定節點故障時的可用性與保存。

單一 RabbitMQ 容器，即使使用 Quorum Queue，也沒有多節點高可用性。容器 volume、正常重啟、節點故障與資料中心故障是不同驗證範圍。

## Prefetch 限制未確認的工作

本例每個 Consumer 的 Prefetch 為 1，方便觀察處理與重送。提高 Prefetch 可能增加吞吐量，也會增加未確認工作、記憶體與工作分配差異；不能只看發布速度決定數值。

[隔離故障驗證](/practice/ecommerce/failure-drills/)會模擬「通知交易已提交，接收 Channel 在 Ack 前關閉」。重新消費後，通知表仍只有一筆結果，證明此案例的 Inbox 能處理這個重送窗口。Broker 接收與業務效果之間的其他邊界仍需各自測試。

## 套用到電商情境

消費者把 Inbox 與模擬通知交易提交後才 Ack；若 Ack 前中斷，重送由唯一條件保護結果。耐久 Queue、persistent message、確認與恢復契約需要組合驗證。Confirm 不保證外部郵件成功，也不能消除所有重送。

[閱讀對應的電商章節](/projects/ecommerce/reliable-events/)，把本篇概念接到整個用例。
