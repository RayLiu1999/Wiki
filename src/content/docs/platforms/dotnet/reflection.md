---
title: "Reflection、Metadata 與部署限制"
description: "區分宣告資訊與執行行為，評估動態掃描、快取及 trimming／AOT 相容性。"
articleId: "dotnet-reflection"
topic: "dotnet"
category: "runtime-performance"
order: 8
tags: ["Reflection、Metadata 與部署限制", "dotnet"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["csharp-syntax-traps", "dotnet-clr-jit"]
relatedArticles: ["architecture-cross-cutting", "aspnet-core-api-styles-aot"]
applicableVersions: "以 C# 14／.NET 10 說明；框架與供應商差異見內文。"
verifiedWith: "已依官方文件核對概念；文中示意片段未宣稱完成外部服務整合或效能量測。"
lastReviewed: "2026-10-08"
takeaway: "區分宣告資訊與執行行為，評估動態掃描、快取及 trimming／AOT 相容性。"
noteDates: []
sources: [{"title": "Reflection", "url": "https://learn.microsoft.com/en-us/dotnet/fundamentals/reflection/reflection"}, {"title": "Trimming 相容性", "url": "https://learn.microsoft.com/en-us/dotnet/core/deploying/trimming/prepare-libraries-for-trimming"}, {"title": "Native AOT", "url": "https://learn.microsoft.com/en-us/dotnet/core/deploying/native-aot/"}]
---

## 本篇的設定背景

系統想從 Attribute 找通知處理器，或根據型別建立序列化與註冊規則。Reflection 讓程式讀取 metadata，實際要做什麼仍由讀取它的程式決定。Attribute 本身不會自動寄信或執行排程。

## 機制與邊界

Type、Assembly、PropertyInfo、MethodInfo 等 API 描述型別與成員；動態建立與呼叫又是後續的執行能力。公開契約、存取限制、例外與型別轉換需要各自處理。

一次啟動掃描與每次商品查詢反覆掃描有不同成本。可以先整理需要的 metadata 或委派，再重用；快取也需要適當上限與生命週期。不能只把 Reflection 全部稱為慢，而不指出頻率和工作量。

## 在電商案例中選擇

| 需求 | 可比較的方案 |
| --- | --- |
| 固定通知方式 | 明確註冊 interface 與實作 |
| 根據已知規則選擇行為 | Strategy 或表格映射 |
| 動態發現擴充型別 | Reflection 掃描、驗證與組裝 |
| 建置時可決定的資料 | Source Generator 或靜態程式碼 |

選擇要考慮擴充模式、可診斷性、錯誤發現時機，以及部署平台。

## Trimming 與 AOT

移除未使用程式碼時，僅靠動態名稱才能找到的成員可能需要額外描述。Native AOT 對動態程式和部分 reflection 使用有條件；應核對具體 API、序列化和套件，而非宣佈所有 reflection 都不可用。

本篇不提供新的代理框架或效能資料。完成條件是：指出程式需要哪些 metadata、何時讀取、如何處理缺漏，以及建置和部署時如何驗證。
