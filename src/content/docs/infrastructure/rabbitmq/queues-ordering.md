---
title: "佇列類型、順序與併行控制"
description: "比較 Classic、Quorum 與 Stream，拆開入列、傳遞及完成順序，設計有界的消費容量。"
articleId: "rabbitmq-queues-ordering"
topic: "rabbitmq"
category: "rabbitmq-reliability"
order: 6
tags: ["Classic Queue","Quorum Queue","Stream","FIFO","prefetch","competing consumers","順序","背壓","delivery limit"]
difficulty: "intermediate"
prerequisites: ["rabbitmq-retries-idempotency","csharp-channels"]
relatedArticles: ["engineering-metrics-tracing","engineering-cache-messaging-tests","architecture-communication-boundaries"]
applicableVersions: "RabbitMQ 4.3.6／AMQP 0-9-1／RabbitMQ.Client 7.2.2／.NET 10。"
verifiedWith: "已驗證單節點 Quorum Queue 的耐久工作重啟恢復；多消費者順序、多節點故障切換與 Streams 僅依官方文件說明。"
lastReviewed: "2026-10-08"
takeaway: "佇列的入列順序不代表多個 Consumer 的完成順序；容量、重送與每個業務實體的順序要一起設計。"
noteDates: []
sources: [{"title":"RabbitMQ：Queues","url":"https://www.rabbitmq.com/docs/queues"},{"title":"RabbitMQ：Quorum Queues","url":"https://www.rabbitmq.com/docs/quorum-queues"},{"title":"RabbitMQ：Streams","url":"https://www.rabbitmq.com/docs/streams"},{"title":"RabbitMQ：Consumer Prefetch","url":"https://www.rabbitmq.com/docs/consumer-prefetch"}]
---

## 依保存與讀取需求選擇

| 類型 | 主要特性 | 選擇時的問題 |
| --- | --- | --- |
| Classic Queue | 常見工作 Queue 語意；目前版本不提供舊式 mirrored queue | 是否接受單節點保存與其故障範圍？ |
| Quorum Queue | 以複寫與共識提供可靠工作佇列 | 是否部署足夠複本？如何承擔磁碟與複寫成本？ |
| Stream | 依保留政策保存可重讀的訊息紀錄 | 是否需要重播、多個讀者與 offset 管理？ |

本案例使用 Quorum Queue，方便展示確認與 at-least-once dead-lettering。只啟動一個節點可以驗證 API 與一般重啟，無法驗證失去節點後仍保持多數副本可用。

RabbitMQ 4.0 起移除 Classic Queue mirroring；舊教學中的 mirrored classic 設定需要依實際版本重新評估。

## 三種順序不能混為一談

入列順序是訊息進入 Queue 的順序；傳遞順序是 broker 分派給 Consumer 的順序；完成順序是各個 Consumer 完成業務效果的順序。

兩個 Consumer 即使先收到 A 再收到 B，B 的處理可能先完成。重送、重新入列、優先權或不同發布者，也會改變實際觀察結果。不能因為 Queue 支援 FIFO，就假設所有訂單狀態會依同一全域順序提交。

## 需要每個實體有順序時

若同一訂單有成立、取消與退款事件，應定義事件版本、有效狀態轉移與過期事件處理。可以按實體 ID 分派固定工作流，或使用單一活動消費者降低並行，但仍需處理故障後重送。

應用程式可以在權威儲存檢查版本與不變量；不要讓一則遲到的舊事件把新狀態覆寫回去。全域串行會限制吞吐量，只在業務確實需要時採用。

## 背壓與容量是端到端的

有界 Channel 控制本地待處理項目，Prefetch 控制 Consumer 尚未確認的訊息，Queue 長度與磁碟則控制 broker 可保存的積壓。這些限制共同決定故障期間會發生等待、拒絕或丟棄。

處理速度落後時，觀察 ready、unacked、最舊訊息年齡、處理延遲與 Consumer 數量。增加 Consumer 前，確認資料庫連線、下游容量與每個實體的順序要求；增加程序不一定能提高整體容量。

## 依版本理解投遞限制

Quorum Queue 具有毒訊息與投遞次數相關機制，行為與預設值需要對照部署版本。重新發布到重試 Queue 與 broker 原訊息的重新投遞，是不同的計數來源。

本例自行保存 x-lab-attempt 來限制應用程式最多 3 次處理，不把 broker 的 delivery limit 當作相同的業務重試政策。若 header 不符合契約，也應有明確的失敗處理，避免錯誤資料使 Consumer 停在未確認狀態。
