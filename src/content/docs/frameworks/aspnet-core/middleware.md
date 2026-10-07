---
title: "Middleware 順序與回應時機"
description: "用進入與返回的管線模型理解例外、短路、Authentication 與 OnStarting。"
articleId: "aspnet-core-middleware"
topic: "aspnet-core"
category: "web-api"
order: 6
tags: ["Middleware", "管線", "短路", "OnStarting", "response header", "UseAuthentication", "UseAuthorization"]
difficulty: "intermediate"
prerequisites: ["csharp-async-await"]
relatedArticles: ["aspnet-core-authentication", "engineering-metrics-tracing"]
applicableVersions: "以 .NET 10 生態系與本文列出的官方文件核對；套件及資料庫供應商的差異見內文。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-07"
takeaway: "Middleware 進入依註冊順序，返回依反向順序；header 必須在 response 開始前設定。"
noteDates: ["2026-07-17"]
sources: [{"title": "Microsoft Learn：Middleware", "url": "https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/?view=aspnetcore-10.0"}, {"title": "Microsoft Learn：HttpResponse.OnStarting", "url": "https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.http.httpresponse.onstarting?view=aspnetcore-10.0"}]
---

## 把管線想成包住下一層

每一層可在 await next 前處理 request，之後處理 response。沒有呼叫 next 就是短路，例如拒絕無效請求或直接返回快取。前面的例外處理可以捕捉後續層擲出的例外，但 response 已開始時通常不能重新改成另一個完整錯誤回應。

常見順序是例外處理、必要的代理 header / HTTPS / routing / CORS、Authentication、Authorization，最後執行 endpoint；實際配置依 hosting 與需求確認。

## 在回應開始前補 header

以下為 WebApplication 的整合片段。需要先配置適用的例外處理及 endpoints，未在本站執行。

~~~csharp title="Program.cs（整合片段）"
app.Use(async (context, next) =>
{
    context.Response.OnStarting(() =>
    {
        context.Response.Headers["X-Request-Id"] = context.TraceIdentifier;
        return Task.CompletedTask;
    });
    await next(context);
});
~~~

OnStarting 註冊的 callback 在 headers 送出前執行，多個 callback 通常按反向註冊順序呼叫。不要在已寫出 body 之後假設仍可改狀態碼或 header。

## 短路需要完成自己的回應

若 Middleware 決定不呼叫 next，就應明確設定狀態與必要內容。非同步背景工作不應在 request 結束後继續持有 HttpContext。

TraceIdentifier 是本地 request 識別，不必等於跨服務 Activity.TraceId。若要接上分散式追蹤，應使用框架與 OpenTelemetry 的傳播機制，並分清兩者用途。
