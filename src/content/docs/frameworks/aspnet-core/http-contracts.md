---
title: "HTTP、JSON 與電商 API 契約"
description: "用商品查詢與建立訂單分清方法、狀態碼、輸入驗證及重複請求。"
articleId: "aspnet-core-http-contracts"
topic: "aspnet-core"
category: "web-api"
order: 10
tags: ["HTTP、JSON 與電商 API 契約", "aspnet-core"]
difficulty: "intermediate"
learningDepth: "basic"
prerequisites: ["csharp-classes"]
relatedArticles: ["aspnet-core-model-binding", "architecture-outbox-inbox"]
applicableVersions: "以 C# 14／.NET 10 說明；框架與供應商差異見內文。"
verifiedWith: "已依官方文件核對概念；文中示意片段未宣稱完成外部服務整合或效能量測。"
lastReviewed: "2026-10-08"
takeaway: "用商品查詢與建立訂單分清方法、狀態碼、輸入驗證及重複請求。"
noteDates: []
sources: [{"title": "HTTP Semantics", "url": "https://www.rfc-editor.org/rfc/rfc9110.html"}, {"title": "ASP.NET Core 錯誤處理", "url": "https://learn.microsoft.com/en-us/aspnet/core/fundamentals/error-handling?view=aspnetcore-10.0"}]
---

## 一筆請求的背景

買家查詢商品，店主修改價格，買家送出訂單。API 是提供這些能力的 HTTP 程序，資料庫保存交易資料；網站頁面只是說明，沒有代替你送出這些請求。本篇先讀懂介面，跟做另見實作指南。

## 方法與回應各自承諾什麼

| 行為 | 介面例子 | 回應的完成範圍 |
| --- | --- | --- |
| 查商品 | GET /products/1 | 找到資料回 200；找不到回 404 |
| 改單價 | PUT /products/1/price | 提交成功可回 204；輸入不合法回 400 |
| 建立訂單 | POST /orders | 訂單與 Outbox 提交回 201，Location 指向查詢位置 |
| 查背景結果 | GET /orders/{orderId} | 回覆訂單與模擬通知的目前狀態 |

201 不是已付款、已寄信或已完成整筆購買。成功、失敗與重複請求的處理必須成為用例契約，HTTP 狀態碼再表達這個結果。GET 不應隱藏會扣庫存的業務操作。

## JSON 輸入與模型邊界

本機實驗的建立訂單輸入形狀：

~~~json
{"productId":1,"quantity":2}
~~~

JSON 是傳輸格式；DTO 定義欄位，Model Binding 建立 .NET 參數，驗證與用例決定是否合法。現有實驗沒有 buyerId、庫存或付款流程，不能從這兩個欄位推論完整購買驗證。

## 冪等、錯誤與版本

用戶端逾時後，伺服器可能已提交；再次 POST 需要穩定的請求冪等鍵及結果查詢設計，才能辨認同一筆下單。現有範例每次建立新識別碼，沒有提供下單 API 冪等，這與 Consumer 的 Inbox 去重不同。

錯誤格式需提供可行動的欄位與代碼，避免洩漏連線字串或內部例外。JSON 新增欄位、必填條件與事件版本要考慮新舊用戶端並存；可以先使用小 DTO，避免把 EF Entity 的全部可寫欄位直接交出去。

完成檢查：讀到任何回應時，都能說明「已完成哪一步、接下來如何查詢，以及失敗時能否重試」。
