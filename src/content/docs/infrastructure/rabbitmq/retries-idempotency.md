---
title: "有限重試、死信與冪等處理"
description: "區分可恢復與無法處理的訊息，用確認、退避、死信及資料庫約束避免無限循環。"
articleId: "rabbitmq-retries-idempotency"
topic: "rabbitmq"
category: "rabbitmq-reliability"
order: 5
tags: ["retry","backoff","DLX","DLQ","dead letter","冪等","idempotency","Inbox","poison message"]
difficulty: "intermediate"
prerequisites: ["rabbitmq-acknowledgements"]
relatedArticles: ["architecture-outbox-inbox","redis-concurrency","engineering-cache-messaging-tests"]
applicableVersions: "RabbitMQ 4.3.6／AMQP 0-9-1／RabbitMQ.Client 7.2.2／.NET 10。"
verifiedWith: "已連線 RabbitMQ 4.3.6 與 PostgreSQL 18.6，驗證三次重試、死信、毒訊息、Inbox 回滾與並行去重；未實際寄信。"
lastReviewed: "2026-10-08"
takeaway: "重試需要次數與退避上限；消費成功與去重紀錄必須一起提交，才能安全面對重送。"
noteDates: []
sources: [{"title":"RabbitMQ：Dead Letter Exchanges","url":"https://www.rabbitmq.com/docs/dlx"},{"title":"RabbitMQ：Reliability","url":"https://www.rabbitmq.com/docs/reliability"},{"title":"RabbitMQ：Quorum Queues","url":"https://www.rabbitmq.com/docs/quorum-queues"},{"title":"Microsoft Learn：訂閱與冪等","url":"https://learn.microsoft.com/en-us/dotnet/architecture/microservices/multi-container-microservice-net-applications/subscribe-events"}]
---

## 先區分失敗原因

資料庫暫時無法連線可能值得重試；無法解析的 JSON、未知事件版本或不符合契約的資料，重送同一份內容通常不會成功。政策需要定義可重試錯誤、最大次數與人工處理方式。

本案例以最多 3 次處理示範：初次 x-lab-attempt=0，兩次重試為 1 與 2；第三次仍失敗就進入死信。JSON／契約錯誤直接送死信。這是明確的教學政策，正式需求可選不同退避、總期限與失敗分類。

## 避免立即 requeue 的忙碌循環

~~~text
工作 Queue → Consumer
  成功：提交通知與 Inbox → Ack
  暫時失敗：確認發布到 500ms 重試 Queue → Ack 原訊息
  重試到期：DLX 路由回工作 Queue
  無法處理／達上限：Nack(requeue=false) → DLX → dead Queue
~~~

如果只有 Nack(requeue=true)，故障期間可能持續收到同一份工作，消耗 CPU 與連線。重試 Queue 提供暫存間隔；教學使用固定 500ms，正式環境可按錯誤與嘗試次數設計退避，並考慮抖動。

## 轉送本身也要確認

Consumer 發布重試訊息後，必須等待確認，再 Ack 原訊息。若順序反過來，在兩者之間中斷會失去工作。即使正確等待確認，中斷在發布成功與原訊息 Ack 之間，仍可能留下兩份訊息。

本例的工作與重試 Queue 使用 Quorum Queue，配置 at-least-once dead-lettering 與 reject-publish。這是指定條件下的機制，不能把任意 DLX 配置都稱為不會遺失；目的 Exchange、Binding、Queue 容量與可用性也需驗證。

## 在資料庫保護冪等結果

Inbox 使用 consumer_name＋message_id 的主鍵。新增去重紀錄與通知結果在同一個本地交易中，只有提交成功後才 Ack；若已處理相同 MessageId，就不再建立結果。

通知表另外以 order_id 為主鍵，保護「同一訂單最多一筆模擬通知結果」的業務限制。先查有沒有再插入，會有並行競態；唯一約束與交易提供真正的競爭裁決。

這些條件保護的是同一資料庫中的結果。實際郵件、付款或 HTTP 副作用若不支援相同的冪等契約，不能從 Inbox 自行推論外部效果恰好發生一次。

## 死信需要有人處理

dead Queue 應有積壓與訊息年齡觀測、原因紀錄、修復與重送程序。重送時保留原 MessageId，必要時記錄人工操作與新的嘗試政策；不要直接把全部死信無限送回工作 Queue。

pnpm test:infrastructure 驗證暫時失敗後成功、連續失敗恰好到達上限、毒訊息送死信、相同事件並行處理只有一份結果，以及 Inbox 寫入後業務失敗時整個交易回滾。
