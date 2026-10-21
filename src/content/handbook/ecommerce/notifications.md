---
title: "08 背景通知與 RabbitMQ"
description: "讓訂單提交和通知完成分開，理解事件、路由與背景程序。"
group: "ecommerce"
order: 8
linkedArticles: ["rabbitmq-getting-started", "rabbitmq-routing", "rabbitmq-dotnet-integration", "rabbitmq-acknowledgements", "dotnet-background-services"]
prerequisites: ["ecommerce/ordering-inventory"]
sources: [{"title": "RabbitMQ publishers", "url": "https://www.rabbitmq.com/docs/publishers"}, {"title": "RabbitMQ consumers", "url": "https://www.rabbitmq.com/docs/consumers"}]
---

買家下單後，HTTP 回應不應因為通知服務慢而一直等待。API 先完成訂單提交，再把「訂單已建立」交給背景流程。前台必須清楚顯示訂單建立與通知完成是不同階段。

## 事件與工作

`OrderPlaced` 表示訂單已建立，不能代表已付款。事件攜帶穩定識別、訂單 ID 與必要資料，訂閱者依契約處理自己的用途。Exchange 根據 routing key 與 binding 把訊息送到 queue；Consumer 從 queue 取得待辦工作。

本章的通知是模擬的：Consumer 只把「已通知」記錄寫進資料庫。接真實郵件時還需外部服務的冪等、結果查詢和對帳，不能用本地 Inbox 保證外部郵件永遠只寄一次。

## 等待與成功的階段

Publisher Confirm 說明 Broker 接受發布；Consumer Ack 說明消費者確認這次交付處理完成。兩者不表示同一件事。通知用例應在結果交易提交後才 Ack；提前 Ack 後程序失敗，可能失去待處理工作。

## 背景程序生命週期

Worker 需要管理連接、scope、取消與停止。暫時失敗可以有限重試；未知格式和持續失敗需要隔離及診斷。重試副本確認後再 Ack 原訊息，仍可能在未知結果時重複交付，所以去重不可省略。

## 怎麼確認做對了

先停住 Worker 再下單：訂單查得到，但通知狀態還沒完成。Worker 啟動後，同一張訂單的通知狀態變成完成。這說明下單和通知確實是兩個獨立的階段。
