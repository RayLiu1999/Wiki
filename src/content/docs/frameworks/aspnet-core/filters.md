---
title: "MVC Filter、Endpoint Filter 與 Middleware"
description: "依執行位置選擇共同行為，理解 Filter 能看到哪些輸入與結果。"
articleId: "aspnet-core-filters"
topic: "aspnet-core"
category: "web-api"
order: 12
tags: ["MVC Filter、Endpoint Filter 與 Middleware", "aspnet-core"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["aspnet-core-routing", "aspnet-core-model-binding"]
relatedArticles: ["architecture-cross-cutting", "aspnet-core-middleware"]
applicableVersions: "以 C# 14／.NET 10 說明；框架與供應商差異見內文。"
verifiedWith: "已依官方文件核對概念；文中示意片段未宣稱完成外部服務整合或效能量測。"
lastReviewed: "2026-10-08"
takeaway: "依執行位置選擇共同行為，理解 Filter 能看到哪些輸入與結果。"
noteDates: []
sources: [{"title": "MVC Filters", "url": "https://learn.microsoft.com/en-us/aspnet/core/mvc/controllers/filters?view=aspnetcore-10.0"}, {"title": "Minimal API Filters", "url": "https://learn.microsoft.com/en-us/aspnet/core/fundamentals/minimal-apis/min-api-filters?view=aspnetcore-10.0"}]
---

## 本篇的下單背景

建立訂單之前要檢查數量，結束後可能記錄處理時間。本篇比較放置這些行為的位置；`OrderRequest` 是專案可自行定義的輸入 DTO，資料庫交易和庫存規則仍由用例負責。

## 三種位置的能力

| 機制 | 主要位置 | 可以相依的背景 |
| --- | --- | --- |
| Middleware | HTTP 管線，包住下一層 | HttpContext、請求／回應與路由階段資訊 |
| MVC Filter | MVC action invocation pipeline | 特定階段的授權、action 參數、結果或例外 |
| Endpoint Filter | Minimal API handler 前後 | handler 的已繫結參數與結果 |

選擇先看共同行為需要哪些資訊，再看影響範圍。MVC Exception Filter 不會涵蓋所有 Middleware 例外；MVC action filter 與 Minimal API endpoint filter 也不是可以直接互換的 API。

## Endpoint Filter 的示意流程

~~~text
HTTP 請求
  → Routing／身分與授權
  → 參數繫結
  → Endpoint Filter 前段
  → 訂單 handler
  → Endpoint Filter 後段
  → HTTP 結果
~~~

Filter 可以 await next、檢查參數或提前回覆。若提前回覆，handler 不會執行；若需要瞭解具體例外範圍，應針對整個管線核對，而非把「有 Filter」視為完整錯誤處理。

## 回到商業邊界

數量格式可在邊界驗證；庫存足不足需要用資料庫中的實際狀態與並行控制判定。把所有規則搬到 Filter，會讓 Worker 或其他入口繞過規則。將商業驗證保留在可重用的用例／領域，HTTP 機制負責適合自己的共同行為。

需要 AOP 時先比較現有 Middleware、Filter、Decorator 和診斷工具，說明呼叫位置、例外、取消和順序，再評估額外代理框架。
