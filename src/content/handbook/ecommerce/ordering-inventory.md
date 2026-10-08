---
title: "05 訂單、庫存與交易"
description: "以剩三個、兩人各買兩個的競爭，設計不可超賣的提交邊界。"
group: "ecommerce"
order: 5
environment: "reading"
verification: "已有本機實驗可觀察部分流程；本章逐項說明其邊界。"
linkedArticles: ["data-access-transactions", "data-access-concurrency", "data-access-pools-locks", "architecture-domain-modeling", "architecture-outbox-inbox", "data-access-concurrent-crud", "data-access-isolation-locking"]
prerequisites: ["ecommerce/cart"]
sources: [{"title": "EF concurrency", "url": "https://learn.microsoft.com/en-us/ef/core/saving/concurrency"}, {"title": "PostgreSQL transaction isolation", "url": "https://www.postgresql.org/docs/current/transaction-iso.html"}]
---

庫存剩 3 個，兩位買家各買 2 個。如果兩邊都先讀取 3，再各自扣 2，就可能超賣。這個需求需要由共用資料邊界仲裁，不能只靠單一 API 程序的 lock。

## 一個用例的邊界

結帳重新驗證商品、價格和數量，在同一資料一致性邊界內建立訂單、保留或扣減庫存，並寫入後續事件。庫存策略先明確選擇：下單時保留、付款時扣減，或下單即扣；取消與保留到期要有相應恢復規則。

本章以「下單時保留」討論：同一份庫存從 3 保留 2 後，另一請求只能看到剩餘可用量 1 並被拒絕。保留到期釋放是獨立業務狀態轉移，不是簡單刪除一筆快取。

## 如何仲裁競爭

可以採用帶條件的資料庫更新、適當的鎖與交易，或版本條件控制；再檢查實際影響筆數。多個商品明細需要一致的鎖定順序與回滾處理，減少死鎖風險。

| 機制 | 解決的範圍 |
| --- | --- |
| 輸入驗證 | 數量格式與合法範圍 |
| 條件更新／資料庫鎖 | 共用庫存競爭 |
| 本地交易 | 訂單、庫存與 Outbox 一起提交或回滾 |
| 請求冪等 | 同一結帳請求重送時重用結果 |
| Consumer 去重 | 後續事件重複交付時保護結果 |

這幾項不能用單一「有交易」概括。

## 例外與重送

用戶端超時不代表交易沒有提交。使用穩定的請求冪等鍵並定義相同鍵不同內容的處理，再提供可查詢結果。回滾時，訂單、保留與 Outbox 應一起恢復；交易提交後，通知失敗不撤銷已成立訂單。

## 目前實驗能看到什麼

現有 API 提交訂單和 Outbox，Consumer 記錄模擬通知；它驗證商品存在與數量，尚未扣庫存、保存完整成交快照或實現 HTTP 請求冪等。可用[事件實驗](/practice/ecommerce/cache-messaging/)觀察交易與通知邊界，庫存競爭屬於本章後續實現目標。

## 資料庫延伸

促銷尖峰的 CRUD、鎖順序、完整交易重試與提交結果不明，另見[資料庫容量專題](/projects/ecommerce/database-capacity/)；需以真實並行測試證明庫存與去重結果。
