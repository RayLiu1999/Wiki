---
title: "Minimal API、Controller 與 Native AOT"
description: "依需求選 API 組織方式，另外評估 JIT、trimming、反射與觀測相容性。"
articleId: "aspnet-core-api-styles-aot"
topic: "aspnet-core"
category: "web-api"
order: 7
tags: ["Minimal API", "Controller", "JIT", "Native AOT", "trimming", "反射", "來源產生器", "JsonSerializerContext"]
difficulty: "intermediate"
prerequisites: ["dotnet-hosting", "csharp-type-operators"]
relatedArticles: ["aspnet-core-model-binding", "engineering-metrics-tracing"]
applicableVersions: "API 比較以 ASP.NET Core 10 文件核對；AOT 支援表可能隨版本變動。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-07"
takeaway: "API 的組織方式與程式的編譯方式是兩個決策；AOT 相容性需要發布與執行驗證。"
noteDates: ["2026-06-29"]
sources: [{"title": "Microsoft Learn：ASP.NET Core Native AOT", "url": "https://learn.microsoft.com/en-us/aspnet/core/fundamentals/native-aot?view=aspnetcore-10.0"}, {"title": "Microsoft Learn：選擇 Web API 方式", "url": "https://learn.microsoft.com/en-us/aspnet/core/fundamentals/apis?view=aspnetcore-10.0"}]
---

## 先選團隊能維護的 API 邊界

| 方式 | 常見組織方法 | 評估重點 |
| --- | --- | --- |
| Minimal API | route group、endpoint extension、endpoint filter | 可以分模組，不必全寫在 Program.cs |
| Controller Web API | Controller / action、MVC filters 與 conventions | 熟悉的模型驗證與 MVC 擴充點 |

兩者都可以依功能分層，也都可能寫成難維護的大檔案。選擇應考慮框架功能與團隊慣例，而非只比較一個 Hello World 的行數。

## JIT 與 Native AOT

JIT 在執行時編譯 IL；Native AOT 在發布時產生目標平台原生程式。AOT 可能改善啟動與部署大小，但不保證每個工作負載都更快，也不能忽略 build 時間與平台差異。

以 ASP.NET Core 10 官方相容表核對，MVC / Controller 不支援 Native AOT，Minimal APIs 仍有部分支援限制；AOT template 使用 Minimal API、CreateSlimBuilder 與 JSON source generation。這是版本相關的條件，不宜永久記成「所有 .NET API 都支援」。

## 反射與監控一起驗證

動態掃描組件、反射建立型別、動態代理或序列化可能遇到 trimming / AOT 可達性限制。依套件文件選擇來源產生器、明確註冊與 JsonSerializerContext，發布時檢查警告。

實際驗收應對發布後的 AOT artifact 跑 API、序列化與關鍵行為測試，再確認 runtime metrics、trace exporter 及 profiler 的支援。不能由 JIT 下測試通過，直接推論 AOT 正常。本篇沒有建立或發布 AOT 專案。
