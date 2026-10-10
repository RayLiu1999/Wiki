---
title: "ASP.NET Core 篩選器體系：ActionFilter vs. Endpoint Filter 實戰"
description: "深入剖析 MVC 篩選器管線、Minimal APIs 通用 Endpoint Filter、短路中斷機制，以及與 Middleware 的職責邊界劃分。"
articleId: "aspnet-core-filters"
topic: "aspnet-core"
category: "web-api"
order: 5
tags: ["ASP.NET Core", "Filters", "篩選器", "EndpointFilter", "ActionFilter", "AOP", "橫切關注點"]
articleType: "deep-dive"
prerequisites: ["aspnet-core-middleware", "aspnet-core-routing"]
relatedArticles: ["aspnet-core-api-styles-aot", "architecture-cross-cutting"]
applicableVersions: ".NET 8 / .NET 10、C# 12+ / 14"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "現代架構首選 IEndpointFilter 兼顧 Minimal API 與 Controller；全域例外交給 Middleware，端點驗證與短路交由 Filter。"
sources:
  - title: "Microsoft Learn：ASP.NET Core 中的篩選條件"
    url: "https://learn.microsoft.com/zh-tw/aspnet/core/mvc/controllers/filters"
  - title: "Microsoft Learn：Minimal API 中的端點篩選條件"
    url: "https://learn.microsoft.com/zh-tw/aspnet/core/fundamentals/minimal-apis/min-api-filters"
---

## 案發現場

某電商系統從傳統 MVC Controller 逐步遷移至 Minimal APIs。團隊為了落實「下單防重複點擊校驗」，沿用了過往熟悉的 `IActionFilter`；然而上線後發現，新改寫的 Minimal APIs 結帳端點完全沒有觸發該過濾器，短時間內被同一個用戶重複提交了 3 筆重複訂單；另一起事故中，工程師試圖用 `IExceptionFilter` 充當全域例外防護，不料中介軟體層發生的連線中斷例外完全穿透，造成伺服器白畫面。

根因在於：對 ASP.NET Core **不同 API 風格下的過濾器架構** 與 **Filter vs. Middleware 職責分工** 存在認知偏差。

## 致命反模式 vs. 正確解法

```text
【請求管線中 Filter 的定位】
Middleware 管線 ──► [選定 Endpoint] ──► [Endpoint Filter (前置校驗)]
                                                │ (校驗不通過？)
                                                ├── (是) ──► 短路回傳 400 Bad Request
                                                └── (否) ──► 執行 Action / Minimal API Handler
                                                                     │
                                        [Endpoint Filter (後置處理)] ◄──┘
```

### 坑一：在 Minimal APIs 中期望 ActionFilter 生效

`IActionFilter` 是 MVC Controller 的專屬子系統。Minimal APIs 繞過了整個 MVC 動作調度器，因此 ActionFilter 根本不會被執行！必須採用通用的 `IEndpointFilter`。

### 坑二：企圖用 ExceptionFilter 取代全域例外中介軟體

`IExceptionFilter` 只管 Action 內部發生的例外。Routing、驗證中介軟體或 Result 序列化時發生的崩潰，ExceptionFilter 毫無感知。

~~~csharp title="Program.cs"
// ✅ Good：實作跨 Minimal API 與 Controller 通用的 IEndpointFilter
using Microsoft.AspNetCore.Http;

var filter = new OrderValidationEndpointFilter();

// 1. 模擬前置驗證短路情境（例如訂單金額非法）
var invalidContext = new MockEndpointFilterInvocationContext(arguments: [0m]);
var shortCircuitResult = await filter.InvokeAsync(invalidContext, _ => ValueTask.FromResult<object?>("通過"));

Console.WriteLine($"短路中斷成功: {shortCircuitResult is IResult}");

// 2. 模擬正常通過情境
var validContext = new MockEndpointFilterInvocationContext(arguments: [99.5m]);
var successResult = await filter.InvokeAsync(validContext, _ => ValueTask.FromResult<object?>("訂單成立"));

Console.WriteLine($"正常執行通過: {successResult?.ToString() == "訂單成立"}");

public sealed class OrderValidationEndpointFilter : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        decimal amount = context.GetArgument<decimal>(0);
        if (amount <= 0)
        {
            // 關鍵：直接回傳 TypedResults 達成安全短路，不執行後續業務 Handler
            return TypedResults.BadRequest("訂單金額必須大於零");
        }

        return await next(context);
    }
}

public sealed class MockEndpointFilterInvocationContext(IList<object?> arguments) : EndpointFilterInvocationContext
{
    private readonly IList<object?> _arguments = arguments;
    public override HttpContext HttpContext => new DefaultHttpContext();
    public override IList<object?> Arguments => _arguments;
    public override T GetArgument<T>(int index) => (T)_arguments[index]!;
}
~~~

預期輸出：
```text
短路中斷成功: True
正常執行通過: True
```

## 踩坑與避坑指南

* **現代架構統一套件：`IEndpointFilter`**：.NET 7+ / .NET 10 引進的 `IEndpointFilter` 可同時掛載於 Minimal API 端點與路由群組（`routeGroup.AddEndpointFilter(...)`），能存取原始參數集合與 `HttpContext`，是現代微服務首選 AOP 攔截器。
* **短路（Short-circuiting）的優雅處理**：在 Filter 前置邏輯中若發現未授權或驗證未通過，直接 `return TypedResults.Problem(...)` 或 `TypedResults.Forbid()`，框架將立即中斷並輸出結果，杜絕向下調用業務 Handler。
* **避坑原則（什麼時候千萬不要用 Filter？）**：
  * **非 HTTP 端點通用的全局關注點**：例如全域例外記錄、分散式追蹤標頭（TraceParent / W3C TraceContext）提取或全站跨來源資源共享（CORS），必須放在 Middleware，以保證非 MVC 端點（如靜態檔案、健康檢查探針、Prometheus Metrics）也能獲得防護。

## 線上排查指令

檢查端點過濾器管線執行：

```bash
# 1. 啟用 ASP.NET Core 端點過濾器呼叫日誌
export Logging__LogLevel__Microsoft.AspNetCore.Http.Internal=Debug

# 2. 檢驗 ActionFilter 與模型驗證日誌
grep -i "Executing endpoint filter" /var/log/app/*.log | tail -n 20
```
