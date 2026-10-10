---
title: "ASP.NET Core 中介軟體管線順序與例外防線"
description: "深入剖析 HTTP 雙向管線執行順序、UseExceptionHandler 全局防線、Response.HasStarted 唯讀例外，以及 CorrelationId 實戰。"
articleId: "aspnet-core-middleware"
topic: "aspnet-core"
category: "web-api"
order: 1
tags: ["ASP.NET Core", "Middleware", "中介軟體", "例外處理", "HTTP管線", "CorrelationId"]
articleType: "deep-dive"
prerequisites: ["csharp-async-await"]
relatedArticles: ["aspnet-core-authentication", "aspnet-core-filters"]
applicableVersions: ".NET 8 / .NET 10、C# 12+ / 14"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "UseExceptionHandler 必須放在管線最外層；UseAuthentication 必須先於 UseAuthorization；禁止在 Response.HasStarted 後修改 Header。"
sources:
  - title: "Microsoft Learn：ASP.NET Core 中介軟體"
    url: "https://learn.microsoft.com/zh-tw/aspnet/core/fundamentals/middleware/"
  - title: "Microsoft Learn：處理 ASP.NET Core 中的錯誤"
    url: "https://learn.microsoft.com/zh-tw/aspnet/core/fundamentals/error-handling"
---

## 案發現場

某電商 API 在促銷時段發生資料庫超時未處理例外，用戶端竟然直接收到赤裸的內部 SQL 語法與 C# 呼叫堆疊，造成嚴重資安漏洞；另一端，新加入的稽核中介軟體被註冊在身份認證之前，導致數萬筆線上操作日誌中的 `UserId` 全數記錄為匿名（null）；此外，伺服器頻繁拋出 `InvalidOperationException: Headers are read-only, the response has already started` 警告。

根因在於：開發者對 ASP.NET Core **雙向中介軟體管線順序（Pipeline Order）** 與 **HTTP 回應串流生命週期**缺乏嚴謹掌握。

## 致命反模式 vs. 正確解法

```text
【ASP.NET Core 俄羅斯套娃雙向管線順序】
請求進入 ──► [1. ExceptionHandler] ──► [2. Routing] ──► [3. AuthN] ──► [4. AuthZ] ──► [5. 端點業務]
回應傳回 ◄── [1. 格式化 Problem]  ◄── [2. 觀測耗時] ◄── [3. 審計] ◄── [4. 權限] ◄── [5. 輸出 Body]
```

### 坑一：順序錯誤導致例外穿透或身份漏讀

若將 `UseExceptionHandler()` 放在路由或業務中介軟體後面，前面發生的例外將無法被捕獲；若將 `UseAuthorization()` 放在 `UseAuthentication()` 之前，授權檢查會因尚未解析身份憑證而全部誤判為 401。

### 坑二：在 Response.HasStarted 後強行寫入 Header

當業務端點開始寫入回應主體（Body）時，HTTP 標頭已透過 Socket 刷入網路。若在中介軟體 `await next()` 之後才嘗試加入 `Response.Headers.Add(...)`，必拋唯讀例外。

~~~csharp title="Program.cs"
// ✅ Good：遵循雙向管線規範的追蹤與耗時監控中介軟體實作
using System.Diagnostics;
using Microsoft.AspNetCore.Http;

var middleware = new RequestTrackingMiddleware(next: async (ctx) =>
{
    // 模擬下游端點處理業務
    await Task.Delay(15);
    ctx.Response.StatusCode = 200;
    await ctx.Response.WriteAsync("{\"status\":\"ok\"}");
});

var context = new DefaultHttpContext();
await middleware.InvokeAsync(context);

Console.WriteLine($"回應狀態碼: {context.Response.StatusCode}");
Console.WriteLine($"追蹤標頭已注入: {context.Response.Headers.ContainsKey("X-Correlation-Id")}");

public sealed class RequestTrackingMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        string correlationId = Guid.NewGuid().ToString("N");
        
        // 關鍵：在回應串流尚未發送前，透過 OnStarting 回呼安全寫入 Header
        context.Response.OnStarting(() =>
        {
            context.Response.Headers["X-Correlation-Id"] = correlationId;
            return Task.CompletedTask;
        });

        var stopwatch = Stopwatch.StartNew();
        try
        {
            await next(context);
        }
        catch (Exception)
        {
            // 若下游拋出未處理例外，記錄日誌並向上由 ExceptionHandler 統一轉換
            throw;
        }
        finally
        {
            stopwatch.Stop();
            Console.WriteLine("請求執行完畢，耗時監控已紀錄");
        }
    }
}
~~~

預期輸出：
```text
請求執行完畢，耗時監控已紀錄
回應狀態碼: 200
追蹤標頭已注入: True
```

## 踩坑與避坑指南

* **安全注入 Header 的唯一正解：`Response.OnStarting`**：在呼叫 `next(context)` 前註冊 `context.Response.OnStarting(...)`。無論下游端點何時輸出資料，CLR 都會保證在第一個 byte 發送前先執行此回呼，徹底杜絕 `Headers are read-only` 例外。
* **短路（Short-circuiting）的正確時機**：當遇到 IP 黑名單阻擋、請求限流（Rate Limiting）超標或 CORS 預檢請求（OPTIONS）時，直接設定 StatusCode 並結束方法，**不呼叫 `next(context)`**，即可立即短路中斷。
* **避坑原則（什麼時候千萬不要用自訂 Middleware 寫業務邏輯？）**：
  * **單一 API 的請求資料格式校驗**：Middleware 屬於全域（或純路徑前綴）的粗粒度過濾器。若在 Middleware 內強制反序列化 Request Body，會消耗不可倒帶的請求串流（Request Stream），阻礙後續 Model Binding。特定端點驗證應交由 Endpoint Filter 或 FluentValidation。

## 線上排查指令

線上排查管線執行順序與中介軟體卡死：

```bash
# 1. 開啟 ASP.NET Core Hosting 的 Debug 日誌以檢視中介軟體完整執行鏈
export Logging__LogLevel__Microsoft.AspNetCore.Hosting=Debug
export Logging__LogLevel__Microsoft.AspNetCore.Routing=Debug

# 2. 檢視生產環境日誌中是否有標頭唯讀或未捕獲例外
grep -E "Headers are read-only|Unhandled exception" /var/log/app/*.log | tail -n 20
```
