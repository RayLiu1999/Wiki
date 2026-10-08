---
title: "訊息佇列與 RabbitMQ 入門"
description: "用訂單背景通知理解訊息代理、工作佇列與發布訂閱，分清接收與完成。"
articleId: "rabbitmq-getting-started"
topic: "rabbitmq"
category: "rabbitmq-basics"
order: 1
tags: ["RabbitMQ","message broker","Producer","Exchange","Queue","Binding","Consumer","工作佇列","pub/sub"]
difficulty: "beginner"
prerequisites: ["csharp-channels"]
relatedArticles: ["rabbitmq-routing","architecture-communication-boundaries","aspnet-core-dapr"]
applicableVersions: "RabbitMQ 4.3.6／AMQP 0-9-1／RabbitMQ.Client 7.2.2／.NET 10。"
verifiedWith: "已以 RabbitMQ 4.3.6 單節點容器執行 .NET 發布、確認與手動消費範例；未驗證多節點高可用性。"
lastReviewed: "2026-10-08"
takeaway: "把工作交給佇列後，發布、排隊與完成是不同階段；API 的回應契約要說清楚已完成哪一步。"
noteDates: []
sources: [{"title":"RabbitMQ：AMQP 0-9-1 Model","url":"https://www.rabbitmq.com/tutorials/amqp-concepts"},{"title":"RabbitMQ：Tutorials","url":"https://www.rabbitmq.com/tutorials"},{"title":"RabbitMQ：Reliability","url":"https://www.rabbitmq.com/docs/reliability"}]
learningDepth: "basic"
---

訂單成立後，通知可以晚一點完成。RabbitMQ 以外部訊息邊界連接發布與消費，讓 HTTP 提交、排隊與背景結果成為不同的階段。

## 從訂單成立後的工作開始

API 成立訂單後，還需要通知使用者或產生報表。若每次請求都等待所有後續操作，回應時間與外部服務的可用性就會綁在一起。訊息佇列可以讓 API 發布工作，再由其他程序處理。

RabbitMQ 是訊息代理（message broker）。它接收發布者的訊息，依規則路由到佇列，再傳給消費者。引入這個邊界後，需要明確定義可接受的處理延遲、重試、積壓與狀態查詢。

## 看懂一則訊息的路徑

~~~text
Producer → Exchange → Binding 規則 → Queue → Consumer
~~~

Producer 是產生訊息的程式；Exchange 依規則選擇目標；Binding 描述 Exchange 與 Queue 的關係；Queue 保留等待傳遞的訊息；Consumer 接收並執行工作。

本系列使用 AMQP 0-9-1 與 RabbitMQ.Client 7.2.2。RabbitMQ 也支援其他協定，本文的 Exchange、確認與 API 範例應依此協定理解。

## 工作分派與發布訂閱

| 拓樸 | 一則訊息通常交給誰 | 適合什麼用途 |
| --- | --- | --- |
| 多個 Consumer 共用一個 Queue | 分派給其中一個 Consumer；失敗可能重送 | 增加背景工作的處理容量 |
| Exchange 路由到多個 Queue | 每個符合 Binding 的 Queue 各有自己的副本 | 通知、分析等不同訂閱用途 |

同一個 Queue 的兩個 Consumer 不是兩份獨立訂閱。若通知與分析都需要每一則訂單事件，應各自有 Queue，而不是一起競爭同一份工作。

## 程序內 Channel 與外部 Broker

`Channel<T>` 在一個程序的記憶體中協調工作；程序重新啟動後，尚未完成的項目會遺失。RabbitMQ 提供外部佇列與相關耐久機制，但仍需正確設定持久化、確認與應用程式恢復。

資料庫已提交，也不代表訂單事件已送到 Broker；Broker 已確認，也不代表通知已完成。後續 Outbox 文章會處理資料庫與發布之間的故障窗口。

## 本機觀察與回應契約

[快取與訊息實作指南](/practice/ecommerce/cache-messaging/)示範發布、消費與管理頁觀察，並提供各工具前提。這裡先核對 HTTP 和背景結果的契約。

範例 API 的 POST /orders 表示訂單與 Outbox 已寫入。GET /orders/{id} 的 notificationRecorded 表示本機模擬通知結果是否存在，並不表示外部郵件送達。真實產品也應以這種方式區分已接受、已成立與已完成背景效果。

## 套用到電商情境

一個通知 Queue 分配給多個 Consumer，是競爭工作；通知與分析都要收到事件則需各自 Queue。API 回應 201 只表示已定義的建立階段完成，狀態查詢提供後續結果。本機通知是資料庫記錄，尚未實際寄信。

[閱讀對應的電商章節](/projects/ecommerce/notifications/)，把本篇概念接到整個用例。
