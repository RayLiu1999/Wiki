---
title: "06 模擬付款與狀態轉移"
description: "處理付款未知結果、重複回呼與訂單一致性，建立可測試的假付款流程。"
group: "ecommerce"
order: 6
environment: "reading"
verification: "電商設計案例；本章描述規則與方案，尚未提供完整業務實作。"
linkedArticles: ["aspnet-core-http-client-factory", "aspnet-core-http-resilience", "data-access-transactions", "architecture-communication-boundaries", "engineering-business-tests"]
prerequisites: ["ecommerce/ordering-inventory"]
sources: [{"title": "Microsoft modern web application architecture", "url": "https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures"}]
---

買家對一筆訂單發起模擬付款，付款服務可能先完成、回應卻在網路上丟失，或回呼被重複送來。訂單狀態不能只跟著每次 HTTP 回應隨意修改。

## 狀態與唯一條件

定義待付款、已付款、付款失敗、取消等合法轉換，保存付款嘗試與外部交易識別。同一已完成付款重複回呼，應返回已經處理的結果，不再重複更新訂單、庫存或發布新業務事件。

付款未知時保留「待確認」語意，透過可查詢的交易 ID 向模擬提供者確認。超時後立即當失敗並再扣一次，會造成重複付款風險。

## 資料與外部呼叫的邊界

資料庫交易不能直接保證外部付款一起提交。先記錄本地意圖與穩定業務 ID，執行有清楚冪等契約的付款請求，再用狀態更新與 Outbox 提交確認結果。失敗時需要查詢、補償與對帳，而不是假設能跨網路回滾所有步驟。

HttpClientFactory 管理 handler 與連線；resilience 策略管理逾時與特定重試。能否重試付款仍由業務契約決定，不能把商品 GET 的重試政策直接套到扣款 POST。

## 假付款如何幫助學習

模擬提供者應能穩定製造成功、明確拒絕、暫時失敗、結果未知與重複回呼。測試應核對最終狀態、事件數量與唯一業務結果，而不是只驗證某個方法呼叫次數。

這裡只討論假付款設計，尚未接入真實支付或提供模擬付款項目。輸入銀行卡資料、真實金流合規與商家結算不在本階段範圍。

## 驗證案例

相同付款請求重送返回相同交易結果；重複回呼不會產生兩筆付款完成事件；取消與付款併發時只能進行合法狀態轉換；系統恢復後可以透過交易識別完成對帳。
