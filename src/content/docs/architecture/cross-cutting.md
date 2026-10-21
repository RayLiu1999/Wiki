---
title: "AOP、橫切行為與呼叫邊界"
description: "比較 Middleware、Filter、Decorator 和代理，安排記錄、驗證與重試的範圍。"
articleId: "architecture-cross-cutting"
topic: "architecture"
category: "object-patterns"
order: 8
tags:
  - "AOP、橫切行為與呼叫邊界"
  - "architecture"
difficulty: "advanced"
prerequisites:
  - "architecture-behavior-patterns"
  - "aspnet-core-filters"
relatedArticles:
  - "dotnet-reflection"
  - "aspnet-core-http-resilience"
applicableVersions: "以 C# 14／.NET 10 說明；框架與供應商差異見內文。"
lastReviewed: "2026-10-10"
takeaway: "比較 Middleware、Filter、Decorator 和代理，安排記錄、驗證與重試的範圍。"
sources:
  - title: "MVC Filter"
    url: "https://learn.microsoft.com/en-us/aspnet/core/mvc/controllers/filters?view=aspnetcore-10.0"
  - title: "Middleware"
    url: "https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/?view=aspnetcore-10.0"
  - title: "DispatchProxy"
    url: "https://learn.microsoft.com/en-us/dotnet/api/system.reflection.dispatchproxy?view=net-10.0"
---

## 案發現場

在維護大型商務系統時，最常見的代碼異味是「橫切關注點糾纏（Code Tangling）」：

打開一個原本單純的「下單處理方法」，真正的業務核心代碼（建立訂單物件、扣庫存）只有 5 行，但整個方法卻高達 60 行：
- 前 10 行在檢查使用者身分權限與 JWT Claim。
- 接著 5 行在啟動 `Stopwatch` 與寫入進入日誌。
- 接著 10 行手動驗證欄位是否為空（若空則回傳 Bad Request）。
- 接著包裹 `try-catch`，手動開啟 `BeginTransactionAsync`。
- 發生錯誤時手動呼叫 `RollbackAsync` 並將例外寫入日誌。
- 最後手動記錄離開日誌與執行耗時。

更嚴重的災難發生在**橫切呼叫邊界的錯置**：
工程師為了統一行為，在 ASP.NET Core **Middleware** 內部嘗試利用反射讀取 Controller 上的自訂 Attribute 進行業務權限校驗。然而，Middleware 在執行時，ASP.NET Core 的路由端點尚未被解析完成（甚至端點根本不存在），這導致在高併發下每個 HTTP 請求反覆解析路由元數據，吞吐量大跌 40%；或者在 Filter 內部攔截了例外，回傳了 JSON，結果最外層的資料庫交易中介軟體根本不知道發生了錯誤，默默將半完成的資料提交了上去！

---

## 反模式與正確解法

### 1. 橫切邊界分層架構圖

橫切關注點（Cross-Cutting Concerns）必須依據**技術層次與作用範圍**精確落入對應的邊界，切忌越界處理：

```text
HTTP Request 
   │
   ▼
[ 1. ASP.NET Core Middleware ]      ──> 傳輸協定層：全域例外處理 (RFC 7807)、TraceId 關聯、Gzip、CORS
   │
   ▼
[ 2. Endpoint / Action Filters ]    ──> API 協定層：ModelState 驗證、API 格式標準化、端點授權
   │
   ▼
[ 3. MediatR Pipeline Behaviors ]  ──> 應用程式用例層：業務資料驗證 (FluentValidation)、用例計時、工作單元交易
   │
   ▼
[ 4. Core Business Logic ]         ──> 領域核心層：純商業不變量計算（完全不受任何橫切代碼污染）
```

---

### 反模式一：在業務層手動包裹重複的橫切邏輯

在每個 Service 方法內部反覆複製貼上日誌、計時與交易代碼。一旦要修改日誌格式或調整分散式追蹤標記，必須修改數百個檔案。

### 正確解法一：利用 MediatR Pipeline Behavior 實現用例層 AOP

在 Application 層，使用管道行為（Pipeline Behaviors）以俄羅斯娃娃（洋蔥式）結構包裹每一個 Command / Query 用例：

```csharp
// 正確解法：用例層日誌與效能計時管道行為
public class LoggingBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    private readonly ILogger<LoggingBehavior<TRequest, TResponse>> _logger;

    public LoggingBehavior(ILogger<LoggingBehavior<TRequest, TResponse>> logger)
    {
        _logger = logger;
    }

    public async Task<TResponse> Handle(
        TRequest request, 
        RequestHandlerDelegate<TResponse> next, 
        CancellationToken ct)
    {
        var requestName = typeof(TRequest).Name;
        _logger.LogInformation("開始執行用例: {RequestName}", requestName);

        var stopwatch = Stopwatch.StartNew();
        try
        {
            var response = await next(); // 呼叫下一個管道或實際 Handler
            stopwatch.Stop();

            if (stopwatch.ElapsedMilliseconds > 500)
            {
                _logger.LogWarning("用例 {RequestName} 執行耗時過長: {Elapsed}ms", 
                    requestName, stopwatch.ElapsedMilliseconds);
            }

            return response;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "用例 {RequestName} 執行失敗！", requestName);
            throw; // 必須重新拋出，讓外層交易或例外中介軟體感知！
        }
    }
}
```

搭配自動化驗證管道（FluentValidation）：
```csharp
// 自動化業務校驗管道：在進入用例核心前攔截不合法輸入
public class ValidationBehavior<TRequest, TResponse> : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    private readonly IEnumerable<IValidator<TRequest>> _validators;

    public ValidationBehavior(IEnumerable<IValidator<TRequest>> validators)
    {
        _validators = validators;
    }

    public async Task<TResponse> Handle(
        TRequest request, 
        RequestHandlerDelegate<TResponse> next, 
        CancellationToken ct)
    {
        if (_validators.Any())
        {
            var context = new ValidationContext<TRequest>(request);
            var validationResults = await Task.WhenAll(
                _validators.Select(v => v.ValidateAsync(context, ct)));

            var failures = validationResults
                .SelectMany(r => r.Errors)
                .Where(f => f != null)
                .ToList();

            if (failures.Count != 0)
            {
                throw new ValidationException(failures); // 統一拋出，由 HTTP 層轉為 400 Bad Request
            }
        }

        return await next();
    }
}
```

---

### 反模式二：在 Filter 中默默吞掉例外並回傳 JSON

在 Action Filter 中用 `try-catch` 包裹並回傳 `new JsonResult(...)`。
這會導致內層的例外被過早中斷，外層若存在交易管線，將完全無法得知執行失敗，進而錯誤地執行了 Commit！

### 正確解法二：例外一律向上冒泡，由全域 Exception Handler 統一轉換

使用 ASP.NET Core 8/10 原生推薦的 `IExceptionHandler`，在最外層將未處理例外統一轉換為符合 RFC 7807 標準的 `ProblemDetails`：

```csharp
// Program.cs: 生產級標準全域例外處理器
public class GlobalExceptionHandler : IExceptionHandler
{
    private readonly IProblemDetailsService _problemDetailsService;
    private readonly ILogger<GlobalExceptionHandler> _logger;

    public GlobalExceptionHandler(IProblemDetailsService problemDetailsService, ILogger<GlobalExceptionHandler> logger)
    {
        _problemDetailsService = problemDetailsService;
        _logger = logger;
    }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext httpContext, 
        Exception exception, 
        CancellationToken cancellationToken)
    {
        _logger.LogError(exception, "未處理例外攔截: {Message}", exception.Message);

        var statusCode = exception switch
        {
            ValidationException => StatusCodes.Status400BadRequest,
            KeyNotFoundException => StatusCodes.Status404NotFound,
            UnauthorizedAccessException => StatusCodes.Status401Unauthorized,
            _ => StatusCodes.Status500InternalServerError
        };

        return await _problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails =
            {
                Status = statusCode,
                Title = exception.GetType().Name,
                Detail = exception.Message,
                Instance = httpContext.Request.Path
            }
        });
    }
}
```

---

## 踩坑與避坑指南

### 1. 裝飾者（Decorator）與 DispatchProxy 在 Native AOT 下的邊界
- 在傳統 .NET Framework 或反射環境中，許多團隊使用 `Castle.DynamicProxy` 或 `DispatchProxy` 建立執行期動態代理。
- **踩坑點**：在 .NET 8 / 10 引入 **Native AOT** 編譯（如建置極致輕量的 Docker 映像檔）時，執行期動態代碼生成（`Reflection.Emit`）被完全禁用，任何基於動態代理的 AOP 框架將直接崩潰。
- **規則**：現代 .NET 架構優先採用**原始碼產生器（Source Generators）**或強型別的 Decorator（利用 DI 容器工廠手動或透過 Scrutor 註冊），達成 100% AOT 相容性。

### 2. 管道短路（Short-circuiting）行為差異
- **Middleware 短路**：若在 Middleware 中直接呼叫 `context.Response.WriteAsync()` 且不呼叫 `next(context)`，請求會立即折返，**完全不會**進入 MVC 管線或 Controller。
- **Filter 短路**：在 ActionFilter 中設定 `context.Result = new BadRequestResult()`，只會跳過 Action 的執行，但外層的 Middleware 依然會在折返時被執行。

---

## 線上排查指令

### 1. 檢驗管線執行順序日誌

在 `appsettings.json` 開啟微服務的管線追蹤：
```json
{
  "Logging": {
    "LogLevel": {
      "Ecommerce.Application.Common.Behaviors": "Debug",
      "Microsoft.AspNetCore.Hosting.Diagnostics": "Information"
    }
  }
}
```
確認請求進入時日誌輸出順序是否嚴格遵循：
`LoggingBehavior ➔ ValidationBehavior ➔ TransactionBehavior ➔ Handler`。

### 2. 檢測 AOP 管道自身帶來的微秒級延遲

使用 `dotnet-trace` 檢視 Pipeline 耗時佔比：
```bash
dotnet-trace collect --name Ecommerce.Api --profile cpu-sampling
```
在 Speedscope 或 PerfView 中確認橫切行為（如反射或驗證）是否佔用了超過 5% 的 CPU 時間。

### 3. Prometheus / Grafana 監控指標

```text
# 橫切校驗攔截的 400 錯誤比例
sum(rate(http_requests_total{status="400"}[1m])) 
/ 
sum(rate(http_requests_total[1m]))

# 慢用例（執行超過 500ms）計數告警
application_slow_requests_total > 5
```
