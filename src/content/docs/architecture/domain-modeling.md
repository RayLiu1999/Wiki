---
title: "DDD 模型與分層責任"
description: "用 Entity、Value Object 與 Aggregate 保護商業規則，分清 Domain、Application、Infrastructure 與 API。"
articleId: "architecture-domain-modeling"
topic: "architecture"
category: "domain-design"
order: 1
tags: ["DDD", "Entity", "Value Object", "Aggregate Root", "Domain", "Application", "Infrastructure", "Web API", "不變量"]
difficulty: "intermediate"
prerequisites: ["csharp-records-invariants", "csharp-interfaces"]
relatedArticles: ["architecture-application-patterns", "engineering-business-tests", "data-access-ef-core"]
applicableVersions: "以 .NET 10 生態系與本文列出的官方文件核對；套件及資料庫供應商的差異見內文。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-07"
takeaway: "先找需要保持一致的商業規則，再決定模型與邊界；資料表不會自動等於 Aggregate。"
noteDates: ["2026-05-22", "2026-05-28", "2026-06-01", "2026-06-03"]
sources: [{"title": "Microsoft Learn：DDD 導向服務", "url": "https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/ddd-oriented-microservice"}, {"title": "Microsoft Learn：領域模型驗證", "url": "https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/domain-model-layer-validations"}]
---

## 模型表達什麼

Entity 透過身分維持連續性，例如同一張訂單可以改配送地址。Value Object 由值決定意義，例如含幣別的金額；通常設計為不可變。Aggregate 把需要一起維持不變量的物件放在一致性邊界內，由 Aggregate Root 控制外部修改入口。

例如「已取消訂單不能付款」應由訂單行為守住，不必讓每個 Controller、排程與 Handler 各寫一次檢查。把數量、金額等限制封裝成有效型別，也能減少重複防禦。

## 各層的工作

| 層 | 主要職責 | 不應承擔的細節 |
| --- | --- | --- |
| Domain | 領域語言、狀態轉移與不變量 | HttpContext、SQL、HTTP client |
| Application | 編排 use case、載入模型、呼叫行為、提交工作 | 重複散落的領域規則 |
| Infrastructure | EF / Dapper、外部服務與持久化實作 | 決定核心商業政策 |
| Web API | HTTP 契約、輸入、驗證身分與回應 | 直接改寫領域內部狀態 |

一種常見依賴安排是 Application 依賴 Domain 與抽象 port，Infrastructure 實作 port，Web API 在 composition root 組裝服務。這是組織選擇，不要求每個小專案都建立四個 assembly。

## Aggregate 不等於整個物件圖

讓所有相關資料都放進同一 Aggregate，可能增加載入成本、鎖競爭與修改衝突。應以「同一次操作必須一致」的規則找邊界；跨 Aggregate 或跨服務的一致性，要另外設計交易、事件或補償。

DDD 也不必然要求微服務。先把通用語言、Bounded Context 與商業規則說清楚；單純 CRUD 可用較簡單的設計。ORM 對應需要配合模型，但不應把領域方法變成只有 public setter 的資料袋。
