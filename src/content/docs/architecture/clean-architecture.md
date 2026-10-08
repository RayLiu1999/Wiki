---
title: "Clean Architecture、模組與相依方向"
description: "從建立訂單說明領域、用例、基礎設施與入口的責任，以及分層的成本。"
articleId: "architecture-clean-architecture"
topic: "architecture"
category: "domain-design"
order: 7
tags: ["Clean Architecture、模組與相依方向", "architecture"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["architecture-domain-modeling", "architecture-application-patterns"]
relatedArticles: ["architecture-outbox-inbox", "engineering-business-tests"]
applicableVersions: "以 C# 14／.NET 10 說明；框架與供應商差異見內文。"
verifiedWith: "已依官方文件核對概念；文中示意片段未宣稱完成外部服務整合或效能量測。"
lastReviewed: "2026-10-08"
takeaway: "從建立訂單說明領域、用例、基礎設施與入口的責任，以及分層的成本。"
noteDates: []
sources: [{"title": "常見 Web 架構", "url": "https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures"}, {"title": "Domain Model", "url": "https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/net-core-microservice-domain-model"}]
---

## 本篇的訂單背景

買家送出下單請求，用例檢查規則、保存訂單並安排通知。核心規則應容易驗證，HTTP、資料庫與 broker 是外部合作方式。本篇說明責任安排，現有實驗的小型 Common 專案不是已完整重構的 Clean Architecture 範本。

## 一次用例的責任

| 部分 | 責任 | 訂單例子 |
| --- | --- | --- |
| Domain | 商業狀態與不變量 | 金額、訂單狀態與有效明細 |
| Application | 協調一次用例 | 載入資料、執行規則、提交與結果 |
| Infrastructure | 對外技術實作 | EF Core／Npgsql、Redis、RabbitMQ |
| API／Worker | 輸入與執行入口 | HTTP 驗證、訊息契約與呼叫用例 |

編譯相依向核心契約安排；執行時由組裝點注入外部實作。呼叫順序和編譯相依箭頭不是同一件事，圖中需要分開標示。

## 契約放在哪裡

核心或用例定義它需要的能力，例如保存一次訂單用例；基礎設施實作該契約。接口不應暴露底層 client 細節讓核心重新相依 Redis 或 SQL provider。

Repository、Unit of Work 和 DbContext 已有各自能力。若新包裝只複製每個 ORM 方法，卻沒有表達用例語意或隔離有效邊界，會增加維護成本。

## 模組化單體與部署

商品、訂單、付款可以先有清楚模組，再維持一個後端部署。API 和 Worker 是不同執行角色，不要求每個 Entity 都成為微服務。資料一致性邊界、團隊責任與部署需求才是後續拆分依據。

拆成服務後，原本本地交易可能變成跨邊界協調；事件、恢復與觀測需要一起增加。Clean Architecture 不會自動提供分散式交易、庫存一致性或故障切換。

完成檢查：能從下單追到商業規則和提交，改換資料存取方式時指出哪些核心契約需要保持，並說明分層帶來的收益與成本。
