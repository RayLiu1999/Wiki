---
title: "IHttpClientFactory 與 Handler 管線"
description: "以命名 client 管理設定和連線，理解 Handler 的重用、scope 與追蹤。"
articleId: "aspnet-core-http-client-factory"
topic: "aspnet-core"
category: "services"
order: 3
tags: ["IHttpClientFactory", "AddHttpClient", "HttpClient", "命名 client", "HttpMessageHandler", "DelegatingHandler", "連線池"]
difficulty: "intermediate"
prerequisites: ["aspnet-core-dependency-injection", "csharp-disposable"]
relatedArticles: ["aspnet-core-http-resilience", "engineering-metrics-tracing"]
applicableVersions: "以 .NET 10 生態系與本文列出的官方文件核對；套件及資料庫供應商的差異見內文。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-07"
takeaway: "工廠重用的是 Handler 與連線資源；client 的生命週期與 request scope 不必相同。"
noteDates: ["2026-05-28", "2026-07-01"]
sources: [{"title": "Microsoft Learn：IHttpClientFactory", "url": "https://learn.microsoft.com/en-us/dotnet/core/extensions/httpclient-factory"}, {"title": "Microsoft Learn：HttpClient 指南", "url": "https://learn.microsoft.com/en-us/dotnet/fundamentals/networking/http/httpclient-guidelines"}]
---

## 避免每次請求都重建底層連線

IHttpClientFactory 建立新的 HttpClient 包裝，並管理可重用的 HttpMessageHandler；底層 handler 管理連線。可依用途註冊命名 client、typed client，再統一設定 BaseAddress、timeout 與 handler。

下列為 Web 專案的註冊與使用片段；example.com 是示意網址。

~~~csharp title="Program.cs（整合片段）"
builder.Services.AddHttpClient("catalog", client =>
{
    client.BaseAddress = new Uri("https://example.com/");
    client.Timeout = TimeSpan.FromSeconds(10);
});

// 服務方法中，factory 由 DI 注入：
using HttpClient client = factory.CreateClient("catalog");
using HttpResponseMessage response = await client.GetAsync(
    "items/42", cancellationToken);
response.EnsureSuccessStatusCode();
~~~

釋放由工廠建立的 client 通常不會直接釋放仍被重用的 handler。另一種合理方式是長期 HttpClient 搭配 SocketsHttpHandler 的 PooledConnectionLifetime；需要依 DNS 更新與環境選擇。

## Handler 的 scope 與安全記錄

DelegatingHandler 可以在送出前後處理記錄、追蹤或認證。factory 的 handler scope 與 HTTP request scope 不同，且 handler 可能重用；不要把某次 request 的使用者、HttpContext 或 token 保存在 handler 欄位供之後請求使用。

Singleton 不宜長期捕捉短命的 typed client，否則可能失去預期的 handler 輪替。命名 client 可在需要時透過 factory 取得；記錄時只保留診斷必要資訊，避免輸出 body、Authorization 或秘密 query。

## 連線與錯誤處理分工

工廠不會讓非 2xx 回應自動變成例外，也不會保證安全重試。狀態碼、response 釋放、取消、串流與重試條件仍由呼叫流程決定；HTTP trace 通常可由 .NET 與 OpenTelemetry instrumentation 接上。
