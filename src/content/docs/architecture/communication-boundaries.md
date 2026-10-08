---
title: "同步呼叫、背景工作與訊息通訊的選擇"
description: "依程序邊界、可遺失程度與回覆需求，選擇 HTTP、Channel、Redis Pub/Sub、Streams 或 RabbitMQ。"
articleId: "architecture-communication-boundaries"
topic: "architecture"
category: "application-patterns"
order: 3
tags: ["HTTP","Channel","Redis Pub/Sub","Redis Streams","RabbitMQ","Dapr","最終一致性","Domain Event","Integration Event","事件契約"]
difficulty: "intermediate"
prerequisites: ["csharp-channels","rabbitmq-getting-started","redis-getting-started"]
relatedArticles: ["architecture-application-patterns","architecture-outbox-inbox","aspnet-core-dapr","rabbitmq-queues-ordering"]
applicableVersions: "以 .NET 10、Redis 8.2.10、RabbitMQ 4.3.6、PostgreSQL 18.6 的教學案例說明。"
verifiedWith: "已核對各通訊機制的官方文件；Redis Streams、Dapr 與多服務部署未納入本次實驗。"
lastReviewed: "2026-10-08"
takeaway: "先決定誰需要立即回覆、工作能否遺失、是否需要重播，再選擇通訊機制。"
noteDates: []
sources: [{"title":"Microsoft Learn：非同步訊息通訊","url":"https://learn.microsoft.com/en-us/dotnet/architecture/microservices/architect-microservice-container-applications/asynchronous-message-based-communication"},{"title":"Microsoft Learn：Channels","url":"https://learn.microsoft.com/en-us/dotnet/core/extensions/channels"},{"title":"Redis：Pub/Sub","url":"https://redis.io/docs/latest/develop/pubsub/"},{"title":"Redis：Streams","url":"https://redis.io/docs/latest/develop/data-types/streams/"},{"title":"RabbitMQ：AMQP 模型","url":"https://www.rabbitmq.com/tutorials/amqp-concepts"}]
---

## 從用例需要的回覆開始

商品查詢需要現在取得資料；訂單成立後的報表可以晚一些完成。若呼叫端需要立即知道結果，HTTP／gRPC 的請求回覆通常容易理解；若工作可稍後處理，訊息流程可以把接收與完成分開。

非同步不表示一定更快，也不會自動降低總工作量。它讓等待與故障邊界改變，接著需要處理積壓、重送、狀態查詢與資料延遲。

## 比較傳遞與保存需求

| 機制 | 主要邊界與用途 | 需要另外設計 |
| --- | --- | --- |
| HTTP／gRPC | 直接請求回覆、查詢目前狀態 | 逾時、重試、副作用冪等與可用性 |
| `Channel<T>` | 單一程序內的工作協調與背壓 | 程序重啟後未完成工作的恢復 |
| Redis Pub/Sub | 對目前在線訂閱者的即時通知 | 斷線時訊息可能遺失，沒有相同的耐久重送契約 |
| Redis Streams | 保存事件紀錄、消費者群組與確認 | 保留政策、pending 恢復、修剪與 Redis 持久化配置 |
| RabbitMQ Queue | 跨程序工作分派與 Exchange 路由 | 確認、冪等、重試、死信與 Queue 耐久設定 |

Redis Pub/Sub 使用 at-most-once 傳遞語意，接收端斷線或處理失敗時，已發布的訊息不會因此補送。Streams 與 RabbitMQ 具備不同的保存與消費模型，需要依具體設定判斷，不能只依「都能發布訂閱」選擇。

## Domain Event 與 Integration Event

Domain Event 表達領域內已發生的事，例如訂單已確認；同一程序的 Handler 可以用它協調領域或應用工作。Integration Event 則是向其他程序公開的契約，需要穩定名稱、版本、識別碼與相容性策略。

本案例以 orders.placed.v1 表示已成立訂單，payload 包含 MessageId、OrderId、ProductId、Quantity、OccurredAt 與 Version。用 past-tense 事件表達已發生結果，與「請執行通知」的工作命令有不同語意。

新增欄位時評估舊 Consumer 如何處理；修改語意或移除欄位時安排版本遷移。不要把整個資料庫 Entity 或內部領域型別直接序列化成外部事件。

## 最終一致性需要可觀察的狀態

訂單交易成功後，背景通知可能尚未完成。產品介面應能表示待處理、成功或失敗，並允許查詢；不能讓 API 回應暗示所有後續效果已經完成。

本例以 orders 與 notifications 兩種結果顯示這段延遲。CQRS 可以在同一資料庫內分開讀寫責任；是否引入 Broker 或獨立讀模型，是後續的需求選擇。事件通訊也不等同 Event Sourcing。

## Dapr 與底層服務各自負責什麼

Dapr 提供 pub/sub、state 等 building blocks，可以透過 component 使用底層訊息或狀態服務。抽象讓應用的呼叫方式一致，仍需理解 component 的傳遞、重試、保存與故障語意。

先用原生 Redis／RabbitMQ 範例建立機制輪廓，再回到既有 Dapr 文章理解抽象的邊界。本次實驗沒有啟動 Dapr；不能把底層服務的驗證直接記作 sidecar 與 component 的整合驗證。
