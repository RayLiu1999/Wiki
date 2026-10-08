---
title: "Exchange、Binding 與訊息路由"
description: "理解 Direct、Fanout、Topic 與預設 Exchange，避免把 Queue 名稱與 Routing Key 混用。"
articleId: "rabbitmq-routing"
topic: "rabbitmq"
category: "rabbitmq-basics"
order: 2
tags: ["Exchange","Direct","Fanout","Topic","Routing Key","Binding","mandatory","default exchange"]
difficulty: "intermediate"
prerequisites: ["rabbitmq-getting-started"]
relatedArticles: ["rabbitmq-dotnet-integration","rabbitmq-acknowledgements","rabbitmq-retries-idempotency"]
applicableVersions: "RabbitMQ 4.3.6／AMQP 0-9-1／RabbitMQ.Client 7.2.2／.NET 10。"
verifiedWith: "已驗證 Topic 事件路由、Direct 重試與死信路由，以及 mandatory 無路由失敗；Fanout 與預設 Exchange 依官方文件核對。"
lastReviewed: "2026-10-08"
takeaway: "Producer 發布到 Exchange；哪些 Queue 收到訊息由 Binding 與路由規則決定。"
noteDates: []
sources: [{"title":"RabbitMQ：AMQP 0-9-1 Model","url":"https://www.rabbitmq.com/tutorials/amqp-concepts"},{"title":"RabbitMQ：Publishers","url":"https://www.rabbitmq.com/docs/publishers"},{"title":"RabbitMQ：Exchanges","url":"https://www.rabbitmq.com/docs/exchanges"}]
---

## Exchange 選擇路由，Queue 保存工作

AMQP 0-9-1 的發布操作指定 Exchange 與 Routing Key。Routing Key 是路由輸入，不必等於 Queue 名稱。Queue 如何收到訊息，由 Exchange 類型與 Binding 決定。

同一則訊息可以路由到零個、一個或多個 Queue。沒有任何符合的 Binding 時，應用程式需要決定這是允許的無訂閱，還是必須視為發布失敗。

## 三種常見類型

| 類型 | 規則 | 訂單事件的例子 |
| --- | --- | --- |
| Direct | Routing Key 與 Binding Key 精確匹配 | orders.placed.v1 → 指定通知 Queue |
| Fanout | 傳給所有已綁定 Queue，忽略 Routing Key | 同一事件廣播給通知與分析 |
| Topic | 使用以點分段的 pattern 匹配 | orders.*.v1 或 orders.# |

Topic 的 * 匹配一個分段，# 匹配零個或多個分段。因此 orders.*.v1 可匹配 orders.placed.v1；orders.# 也可涵蓋更深的名稱。事件名稱與版本應是雙方明確約定的契約。

## 預設 Exchange 的特例

名稱為空字串的預設 Exchange 是 Direct Exchange。建立 Queue 時會有對應的特殊 Binding，Routing Key 使用 Queue 名稱即可路由到該 Queue。

看到 BasicPublish 使用空字串與 Queue 名稱時，仍然是透過 Exchange 發布。這個特例不表示每個自訂 Exchange 都能直接把 Routing Key 當成 Queue 名稱。

## 本案例的可恢復拓樸

~~~text
devwiki.orders.events（Topic）
  orders.placed.v1 → devwiki.orders.notifications

devwiki.orders.retry（Direct）
  retry → devwiki.orders.retry.500ms
  到期後經 DLX 回到 events / orders.placed.v1

devwiki.orders.failed（Direct）
  orders.failed → devwiki.orders.dead
~~~

第一個 Queue 處理通知；重試 Queue 暫存失敗工作；dead Queue 保存需要人工處理的訊息。DLX 是另一個 Exchange，不是失敗工作最後停留的 Queue。

教學程式用 Queue arguments 固定拓樸。正式維運常用 policy 管理可調整的死信與期限設定；同名 Queue 若用不同的必要屬性重新宣告，可能收到協定錯誤，不能把宣告當成任意修改。

## 驗證沒有路由的情況

Publisher 使用 mandatory=true，並啟用確認追蹤。訊息沒有路由到 Queue 時會被退回，範例的 await 因而失敗。只看 Publisher Confirm 的成功，不能自行推論所有預期訂閱都收到了訊息。

pnpm test:infrastructure 會刻意使用沒有 Binding 的 Routing Key，核對發布失敗；Outbox 的未發布紀錄必須保留供恢復。另要監控退回原因與拓樸變更，避免重試同一份錯誤設定卻永遠無法路由。
