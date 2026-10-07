---
title: "Authentication Scheme 與授權 Policy"
description: "區分身分建立、存取判斷與匿名端點，理解 NoResult 與 Fail 的不同。"
articleId: "aspnet-core-authentication"
topic: "aspnet-core"
category: "services"
order: 5
tags: ["Authentication Scheme", "Authorization Policy", "AllowAnonymous", "IsAuthenticated", "AuthenticateResult.NoResult", "AuthenticateResult.Fail", "401", "403"]
difficulty: "intermediate"
prerequisites: ["aspnet-core-middleware", "csharp-extensions-attributes"]
relatedArticles: ["aspnet-core-model-binding", "engineering-metrics-tracing"]
applicableVersions: "以 .NET 10 生態系與本文列出的官方文件核對；套件及資料庫供應商的差異見內文。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-07"
takeaway: "驗證建立身分，授權判斷能否存取；沒憑證與憑證無效是不同結果。"
noteDates: ["2026-05-21", "2026-05-28", "2026-06-04", "2026-10-05"]
sources: [{"title": "Microsoft Learn：Authentication", "url": "https://learn.microsoft.com/en-us/aspnet/core/security/authentication/?view=aspnetcore-10.0"}, {"title": "Microsoft Learn：Policy 授權", "url": "https://learn.microsoft.com/en-us/aspnet/core/security/authorization/policies?view=aspnetcore-10.0"}, {"title": "Microsoft Learn：AuthenticateResult", "url": "https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.authentication.authenticateresult?view=aspnetcore-10.0"}]
---

## 身分與權限分開

Authentication Scheme 把名稱、handler 與選項連起來。handler 根據 cookie、token 或其他憑證建立 ClaimsPrincipal；Authorization Policy 再根據身分與 requirements 判斷是否可存取。

IsAuthenticated 通常取決於 ClaimsIdentity 是否具有 authentication type，不代表 token 來源可靠、也不代表具備管理員權限。必須由受信任的驗證流程建立身分。

## NoResult、Fail 與 Success

| 結果 | 適用情境 | 不代表什麼 |
| --- | --- | --- |
| `NoResult()` | 本 scheme 沒有找到可處理的憑證 | 不會自動准許受保護端點 |
| `Fail(...)` | 找到憑證但驗證失敗 | 不等於 handler 自己立即寫出 response |
| `Success(ticket)` | 驗證成功，提供身分 ticket | 仍需經過授權判斷 |

在多 scheme 情境，其他 scheme 也可能參與結果；最終回應依 policy、challenge / forbid 與 handler 行為決定。API 常見未登入 401、已登入但權限不足 403，不能只用一次 Fail 直接推論所有配置。

## 明確宣告授權需求

以下為已配置驗證 scheme 的 Web 專案片段，並非完整驗證實作。

~~~csharp title="Policy 註冊（整合片段）"
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("CanReadOrders", policy =>
        policy.RequireAuthenticatedUser().RequireClaim("permission", "orders.read"));
});

app.UseAuthentication();
app.UseAuthorization();
app.MapGet("/orders", () => Results.Ok()).RequireAuthorization("CanReadOrders");
app.MapGet("/health", () => Results.Ok()).AllowAnonymous();
~~~

Controller 可使用 `[Authorize(Policy = "CanReadOrders")]`、`[AllowAnonymous]`。AllowAnonymous 略過該端點的授權要求；不是讓所有請求都變成已驗證。

把商業資料的所有權檢查放進適當的 policy 或應用程式流程；光有一個已登入使用者，不能推論他能讀取路由中的每個 id。
