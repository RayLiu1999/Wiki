---
title: "Strategy、Decorator 與行為組合"
description: "分清替換一個規則和包住既有服務，用運費及商品快取說明組合。"
articleId: "architecture-behavior-patterns"
topic: "architecture"
category: "object-patterns"
order: 6
tags: ["Strategy、Decorator 與行為組合", "architecture"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["csharp-syntax-traps", "aspnet-core-dependency-injection"]
relatedArticles: ["redis-cache-aside", "architecture-cross-cutting"]
applicableVersions: "以 C# 14／.NET 10 說明；框架與供應商差異見內文。"
verifiedWith: "已依官方文件核對概念；文中示意片段未宣稱完成外部服務整合或效能量測。"
lastReviewed: "2026-10-08"
takeaway: "分清替換一個規則和包住既有服務，用運費及商品快取說明組合。"
noteDates: []
sources: [{"title": "DI 指南", "url": "https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection-guidelines"}, {"title": "Cache-Aside", "url": "https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside"}, {"title": "設計相依方向", "url": "https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures"}]
---

## 本篇的需求背景

後續電商可能有不同運費規則；商品讀取也可以增加快取和記錄。運費是擴充情境，現有實驗沒有運費計算。Strategy 表達可選演算法，Decorator 在原有契約外增加行為。

## Strategy 找出變動點

若所有規則接收相同輸入、提供相同語意的結果，可以由用例依條件選策略。例如 `IShippingCost` 是自訂運費契約，實作接受重量、地區與金額時，要清楚定義單位、限制與錯誤結果。

若不同付款流程需要完全不同輸入和狀態，硬塞進一個通用策略反而遮住差異。抽象應讓用例更清楚，而非只把 switch 拆到很多檔案。

## Decorator 保留契約

~~~text
買家查商品
  → 記錄查詢時間的裝飾器
  → 快取裝飾器
  → 資料庫商品讀取器
~~~

`IProductReader` 可以是應用的查詢契約；`CachedProductReader` 是自行實作的裝飾器，並非 StackExchange.Redis 內建。它查快取、回源和設定 TTL，仍需要處理取消、損壞資料和降級。

裝飾器順序改變觀測範圍。例如外層記錄包含快取命中，內層資料庫記錄只包含回源。錯誤、交易、重試與快取的順序也會影響效果，不能只靠註冊順序猜測。

## 組裝與生命週期

DI 在 composition root 選擇並組裝行為。Decorator 持有內層服務時，生命週期和資源所有權需要相容；Singleton 包住 Scoped 的 DbContext 不會因為用了模式就變安全。

同一個業務操作的重試還需要冪等契約。將付款 retry 包成 Decorator，不會自動避免重複扣款；需要用例和供應商支援穩定識別及結果查詢。

完成檢查：能指出替換的是什麼、增加的是什麼、呼叫順序，以及哪些規則仍必須由用例處理。
