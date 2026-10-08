---
title: "09 Outbox、Inbox 與重送"
description: "逐步確認資料庫提交、發布確認、通知結果與消費確認的邊界。"
group: "ecommerce"
order: 9
environment: "reading"
verification: "已有本機實驗可觀察部分流程；本章逐項說明其邊界。"
linkedArticles: ["architecture-outbox-inbox", "rabbitmq-acknowledgements", "rabbitmq-retries-idempotency", "rabbitmq-queues-ordering", "data-access-transactions"]
prerequisites: ["ecommerce/notifications"]
sources: [{"title": "Transactional outbox", "url": "https://learn.microsoft.com/en-us/azure/architecture/databases/guide/transactional-outbox-cosmos"}, {"title": "RabbitMQ confirms", "url": "https://www.rabbitmq.com/docs/confirms"}]
---

API 如果先寫訂單、再直接發布訊息，中間程序中斷就會留下「有訂單卻沒有事件」。反過來先發布再寫訂單，則可能讓 Consumer 處理根本沒有提交的訂單。

## 在資料庫先建立交付意圖

同一交易保存訂單和 Outbox 事件。提交成功後，獨立發布器讀取未發布工作，向 RabbitMQ 發布並等待 Confirm，再標記 published_at。任何步驟失敗都要保留足以恢復的狀態。

Confirm 後、標記前中斷，下一次會重送。Outbox 並沒有消除重複，只把「已提交的業務事件最終能繼續交付」變成可恢復流程。

## Consumer 如何保護結果

每次重送保留原本 MessageId。Consumer 使用固定邏輯名稱與 MessageId 建立 Inbox 唯一條件，把 Inbox 和模擬通知放進同一個交易。交易成功後再 Ack；重複交付讀到已有結果時可以結束處理。

通知另以 order_id 保護業務唯一結果，使兩個不同事件 ID 也不能無意建立同一份模擬通知。唯一約束需要對應真實業務定義，不能無限擴展成所有通知都只准一筆。

## 重試、死信與順序

暫時錯誤有限重試，已確認重試副本後再 Ack 原交付；毒訊息直接隔離。死信需要記錄原因與人工處理規則，重新投遞也保留穩定識別與審計。

多個 Consumer 與重試可能改變完成順序。依賴事件先後時，需要版本或合法狀態轉移，不應只假設 Queue 依序投遞就一定依序完成。

## 目前驗證範圍

隔離測試覆蓋訂單與 Outbox 回滾、Confirm 後狀態窗口、Inbox 與通知回滾、Ack 前斷線重送、並行重複事件與有限重試。發布器尚未實現多程序 claim／lease，因此這份實驗不能直接當作多 Pod 發布器方案。[故障與恢復指南](/practice/ecommerce/failure-drills/)說明證據與範圍。
