---
title: "Generic Host、Startup 與 Minimal Hosting"
description: "理解 Program.cs 的組裝責任，校準 .NET 6 範本改變與既有 hosting 模型的支援。"
articleId: "dotnet-hosting"
topic: "dotnet"
category: "runtime-models"
order: 2
tags: ["IHostBuilder", "Generic Host", "Startup", "Program.cs", "Minimal Hosting", "WebApplication", "BackgroundService"]
difficulty: "intermediate"
prerequisites: ["aspnet-core-dependency-injection"]
relatedArticles: ["aspnet-core-middleware", "aspnet-core-api-styles-aot", "dotnet-sdk-packages"]
applicableVersions: "Minimal Hosting 預設範本自 .NET 6 起；Generic Host 與 Startup 型設定仍可使用。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-07"
takeaway: ".NET 6 改變預設範本，不表示 Startup 與 Generic Host 被移除。"
noteDates: ["2026-05-20", "2026-05-21"]
sources: [{"title": "Microsoft Learn：.NET 5 到 .NET 6 移轉", "url": "https://learn.microsoft.com/en-us/aspnet/core/migration/50-to-60?view=aspnetcore-10.0"}, {"title": "Microsoft Learn：Generic Host", "url": "https://learn.microsoft.com/en-us/dotnet/core/extensions/generic-host"}]
---

## Host 管什麼

Generic Host 整合 DI、configuration、logging、hosted services 與啟停生命週期。IHostBuilder 是建立 Host 的一種模式；背景 worker 與 Web 應用程式都能利用 hosting 基礎。

早期 ASP.NET Core 常在 Program 使用 Host.CreateDefaultBuilder，再以 Startup 分開 ConfigureServices 與 Configure。.NET 6 的預設 Web 範本改採 WebApplication.CreateBuilder，讓註冊、組裝與 endpoint 設定可直接放在 Program.cs。

## Minimal Hosting 不等於只能用 Minimal API

以下為 WebApplication 設定片段，可搭配 Controller。範例需要對應的 Web 專案，未在本站建置。

~~~csharp title="Program.cs（整合片段）"
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();
var app = builder.Build();
app.MapControllers();
app.Run();
~~~

Minimal Hosting 是啟動組裝方式；Minimal API 是 endpoint 宣告方式。使用較新的 Program.cs，不代表一定不用 Controller；沿用 Startup 也不是不再受支援。

## Program 是組裝點

Program 決定 configuration、服務註冊、middleware 與應用程式啟動。功能變多時，可把註冊依功能整理成 extension method，把商業規則放回 Domain / Application，不必把全部實作塞在單一檔案。

BackgroundService 要遵守停止 token；需要 Scoped 服務時建立自己的 scope。程式結束、scope 釋放與資源所有權也由 hosting 模型一起管理，避免 fire-and-forget 工作超出生命週期。
