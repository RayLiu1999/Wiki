---
title: "AOP、橫切行為與呼叫邊界"
description: "比較 Middleware、Filter、Decorator 和代理，安排記錄、驗證與重試的範圍。"
articleId: "architecture-cross-cutting"
topic: "architecture"
category: "object-patterns"
order: 8
tags: ["AOP、橫切行為與呼叫邊界", "architecture"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["architecture-behavior-patterns", "aspnet-core-filters"]
relatedArticles: ["dotnet-reflection", "aspnet-core-http-resilience"]
applicableVersions: "以 C# 14／.NET 10 說明；框架與供應商差異見內文。"
verifiedWith: "已依官方文件核對概念；文中示意片段未宣稱完成外部服務整合或效能量測。"
lastReviewed: "2026-10-08"
takeaway: "比較 Middleware、Filter、Decorator 和代理，安排記錄、驗證與重試的範圍。"
noteDates: []
sources: [{"title": "MVC Filter", "url": "https://learn.microsoft.com/en-us/aspnet/core/mvc/controllers/filters?view=aspnetcore-10.0"}, {"title": "Middleware", "url": "https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/?view=aspnetcore-10.0"}, {"title": "DispatchProxy", "url": "https://learn.microsoft.com/en-us/dotnet/api/system.reflection.dispatchproxy?view=net-10.0"}]
---

## 本篇的共同需求背景

商品與訂單用例都要記錄處理時間；部分外部呼叫需要有限重試。這些共同行為跨越不同用例，本篇用 AOP 的思考方式找適合位置。庫存與付款狀態仍是業務規則。

## 先辨識呼叫發生在哪裡

| 機制 | 能處理的邊界 | 要檢查的條件 |
| --- | --- | --- |
| Middleware | HTTP 請求與回應 | 管線順序、回應是否已開始 |
| Filter | 特定 MVC 或 Minimal API 階段 | 模型、參數、結果與例外範圍 |
| Decorator | 服務契約呼叫 | 內層契約、DI、順序與生命週期 |
| 動態代理／編譯期安排 | 符合工具條件的型別或方法 | 可攔截成員、效能、除錯與 AOT／trimming |

AOP 是分離橫切關切的概念，並不是 .NET DI 自動包住所有方法的保證。Attribute 是 metadata，還需要讀取與執行它的機制。

## 前後行為的時間線

~~~text
開始記錄
  → await 真正用例
  → 成功結果或例外／取消
  → 結束記錄與釋放資源
~~~

非同步攔截要等待真正作業完成；只記錄回傳 Task 的時間會漏掉實際工作。例外不能在記錄後被默默吞掉，取消也要保持來源與結果語意。

## 重試與交易不能只靠套件解決

對商品查詢的重試與對付款的重試有不同後果。交易包覆的範圍、Outbox 保存、外部效果與重送需要用例契約；泛用 retry 或 transaction attribute 不能自動使跨資料庫與 broker 操作原子化。

先用可見的 Middleware、Filter 或 Decorator 表達需要的行為；若要採代理或 weaving，再評估生成代碼、部署限制與診斷方法。完成檢查是能指出攔截位置、執行順序、失敗結果與沒有涵蓋的入口。
