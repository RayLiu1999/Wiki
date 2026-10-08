---
title: "02 商品 API 與 HTTP 契約"
description: "把商品查詢、價格更新和錯誤回應寫成清楚的端點契約。"
group: "ecommerce"
order: 2
environment: "reading"
verification: "已有本機實驗可觀察部分流程；本章逐項說明其邊界。"
linkedArticles: ["aspnet-core-http-contracts", "aspnet-core-routing", "aspnet-core-model-binding", "aspnet-core-filters", "data-access-concurrency", "data-access-csharp-connections", "data-access-mysql-dotnet", "data-access-postgresql-dotnet"]
prerequisites: ["ecommerce/catalog"]
sources: [{"title": "Microsoft modern web application architecture", "url": "https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures"}]
---

買家要查商品 1，店家要把價格改成 120 元。用戶端需要知道網址、方法、資料格式與失敗含義；API 需要區分路由、模型綁定、驗證、授權與實際用例。

## 端點代表哪個動作

| 端點 | 成功含義 | 需要處理的失敗 |
| --- | --- | --- |
| GET /products/1 | 返回可公開查詢的商品資料 | 不存在、下游不可用 |
| PUT /products/1/price | 價格更新已提交 | 格式錯誤、負價格、不存在、權限或版本衝突 |
| POST /orders | 訂單與對應 Outbox 已提交 | 商品或數量不合法、交易失敗 |

HTTP 201 回應建立訂單，只說明建立階段完成。它不保證付款或通知已經完成。Location 指向可查詢的資源，讓呼叫端看到後續狀態。

## 一筆請求的順序

路由選中 endpoint，Model Binding 取得輸入，驗證和授權核對可否執行，Application 協調資料操作，最後回應既定契約。Middleware 處理跨請求流程，Filter 處理相應端點框架的行為，庫存和價格規則仍由業務層維護。

將金額解析為 decimal，核對小數位、範圍與商品存在。對外錯誤回應應可預期，避免把資料庫例外或機密連線字串直接返回用戶端。

## 更新也有競爭

兩位管理者同時改價時，可以要求預期版本，使用條件更新辨識衝突。用戶端要重新讀取後做明確選擇；直接無限重試可能覆蓋他人的變更。

目前實驗的價格更新具有版本遞增與快取失效，沒有完整管理者授權或用戶端預期版本契約。本章把這些列為後續需求。

## 實際觀察

[快取與訊息指南](/practice/ecommerce/cache-messaging/)會啟動商品 API，展示 GET、PUT 與回應中的 source／version，再建立訂單。想先深入各段責任，可接著讀 Routing、Model Binding、Filter 與 HTTP 契約。

## 資料庫延伸

C# 如何連接 MySQL／PostgreSQL、借還連線及管理 deadline，延伸至[資料庫容量專題](/projects/ecommerce/database-capacity/)與[設定驗證指南](/practice/ecommerce/database-validation/)。
