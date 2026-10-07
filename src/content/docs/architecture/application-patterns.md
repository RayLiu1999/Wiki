---
title: "Repository、Unit of Work 與 CQRS"
description: "將 Command、Query、Handler、DTO 與 Validator 放在適當位置，避免模式堆疊。"
articleId: "architecture-application-patterns"
topic: "architecture"
category: "application-patterns"
order: 2
tags: ["Repository", "Unit of Work", "Mediator", "CQRS", "Command", "Query", "Handler", "DTO", "Validator"]
difficulty: "intermediate"
prerequisites: ["architecture-domain-modeling"]
relatedArticles: ["data-access-transactions", "data-access-ef-core", "engineering-business-tests", "aspnet-core-model-binding"]
applicableVersions: "以 .NET 10 生態系與本文列出的官方文件核對；套件及資料庫供應商的差異見內文。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-07"
takeaway: "模式用來釐清責任；CQRS 不要求分開資料庫，Mediator 也不會自動提供交易。"
noteDates: ["2026-05-25", "2026-05-28", "2026-06-09", "2026-10-05"]
sources: [{"title": "Microsoft Learn：CQRS", "url": "https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs"}, {"title": "Microsoft Learn：實作 Repository 與 Unit of Work", "url": "https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-implementation"}]
---

## 一個用例的閱讀順序

以「確認訂單」為例：API 接收 DTO，將資料轉成 Command；Validator 檢查輸入契約；Handler 載入 Aggregate，呼叫 Confirm 行為，最後提交 Unit of Work。Domain 在 Confirm 中維持規則，而不是依賴每個呼叫端先做驗證。

| 名稱 | 責任 |
| --- | --- |
| Command | 表達修改意圖，可帶回處理結果 |
| Query | 讀取資料，避免偷偷改商業狀態 |
| Handler | 協調一個用例 |
| DTO | 傳輸契約，不必等於資料表或 Entity |
| Validator | 格式、必要欄位及輸入條件 |
| Repository | 以模型語意存取 Aggregate |
| Unit of Work | 管理一組資料變更的提交邊界 |
| Mediator | 將請求分派給處理者及其 pipeline |

## CQRS 可從同一個資料庫開始

讀取與寫入分開模型與責任，就可以是一種 CQRS。查詢可直接用 EF projection 或 Dapper 取得 DTO，寫入維持 Aggregate 規則；不需要一開始就加 Event Sourcing、訊息佇列或兩套資料庫。

若後來引入獨立 read model，需接受資料延遲並設計同步、重建與故障恢復。Event Sourcing 是另一個決策，不是 CQRS 的必要條件。

## 不要重複包裝卻沒有增加語意

DbContext 已具工作單位與資料集合能力；額外 Repository 應提供 Aggregate 邊界或可測試的業務 port，而不是只是把所有 DbSet 方法重新命名。任意回傳 IQueryable，也可能把 provider、scope 與查詢成本洩漏到上層。

Mediator pipeline 可加入 logging、validation 或 transaction 行為，但必須明確實作與測試；不會因為使用套件就自動具有原子性。外部 HTTP、寄信與資料庫提交不會自然包含在同一個本地交易中。
