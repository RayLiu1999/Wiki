---
title: "Routing、Endpoint 與路由匹配"
description: "從商品網址理解 Routing 如何選擇端點，以及路由約束和驗證的差別。"
articleId: "aspnet-core-routing"
topic: "aspnet-core"
category: "web-api"
order: 11
tags: ["Routing、Endpoint 與路由匹配", "aspnet-core"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["aspnet-core-http-contracts"]
relatedArticles: ["aspnet-core-middleware", "aspnet-core-model-binding", "kubernetes-services-gateway"]
applicableVersions: "以 C# 14／.NET 10 說明；框架與供應商差異見內文。"
verifiedWith: "已依官方文件核對概念；文中示意片段未宣稱完成外部服務整合或效能量測。"
lastReviewed: "2026-10-08"
takeaway: "從商品網址理解 Routing 如何選擇端點，以及路由約束和驗證的差別。"
noteDates: []
sources: [{"title": "ASP.NET Core Routing", "url": "https://learn.microsoft.com/en-us/aspnet/core/fundamentals/routing?view=aspnetcore-10.0"}, {"title": "Minimal API 路由", "url": "https://learn.microsoft.com/en-us/aspnet/core/fundamentals/minimal-apis/route-handlers?view=aspnetcore-10.0"}]
---

## 本篇的商品背景

買家用 GET /products/1 查商品。Web 應用需先判斷這個方法和網址由哪個處理器負責，再繫結輸入與執行查詢。Routing 負責找 endpoint；商品是否存在與使用者能否查看，屬於後續用例。

## Endpoint 包含哪些資訊

Endpoint 是可執行的請求處理入口，還有路由樣式與 metadata，例如 HTTP 方法、授權需求和名稱。Middleware 可以在路由選擇後讀取 endpoint metadata，再由授權或其他管線行為處理。

## 最小 Web 程序的形狀

以下是 .NET Web 專案的完整入口示意；回應固定商品，未連接 EF Core、Redis 或登入系統，未列為本次已執行的 API 範例。

~~~csharp title="Program.cs（Web 專案示意）"
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();
app.MapGet("/products/{id:int}", (int id) =>
    id == 1 ? Results.Ok(new { id, name = "保溫杯", price = 120m }) : Results.NotFound());
app.Run();
~~~

`{id:int}` 限制匹配能解析為 int 的路徑。`/products/abc` 不符合這個路由，與匹配後發現 id 不在業務範圍是不同情境。不要把 route constraint 當成統一輸入驗證工具。

## 順序與模糊匹配

路由樣式的優先關係、HTTP 方法與 endpoint metadata 共同影響選擇；不要用註冊先後掩蓋兩個端點的模糊定義。Minimal Hosting 會安排部分路由管線，顯式調整 Middleware 時仍需理解驗證、授權和端點執行的位置。

反向產生連結時使用端點名稱與路由資訊，避免各處手動拼接不同網址。建立訂單的 Location 應能查詢該結果；掛上 Gateway 後，外部網址和內部 endpoint 仍是不同層級。
