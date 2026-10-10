---
title: "ASP.NET Core 驗證與授權實戰：JWT Bearer 陷阱與 Policy-based 授權"
description: "深入剖析 401 與 403 職責邊界、JWT ClockSkew 時鐘漂移陷阱、垂直越權漏洞防範，以及 Policy-based 授權策略實戰。"
articleId: "aspnet-core-authentication"
topic: "aspnet-core"
category: "services"
order: 5
tags: ["ASP.NET Core", "JWT", "Authentication", "Authorization", "ClockSkew", "RBAC", "資安防護"]
articleType: "deep-dive"
prerequisites: ["aspnet-core-middleware"]
relatedArticles: ["aspnet-core-model-binding", "gke-workload-identity"]
applicableVersions: ".NET 8 / .NET 10、C# 12+ / 14"
verifiedWith: ".NET SDK 10.0.105 實測編譯與結論"
lastReviewed: "2026-10-10"
takeaway: "401 是未出示有效身份，403 是無權操作資源；合理調校 ClockSkew 避免短效 Token 失效延遲；嚴格實施 Policy 授權防範越權。"
sources:
  - title: "Microsoft Learn：ASP.NET Core 中的原則型授權"
    url: "https://learn.microsoft.com/zh-tw/aspnet/core/security/authorization/policies"
  - title: "Microsoft Learn：保護 ASP.NET Core Web API"
    url: "https://learn.microsoft.com/zh-tw/aspnet/core/security/authorization/limitingidentitybyschema"
---

## 案發現場

某微服務系統跨伺服器部署時，使用者剛登入拿到短效 Token，發送下一筆請求卻隨機遭遇 `401 Unauthorized` 登出；排查發現兩台主機存在 2 秒的微小 NTP 時間誤差，而工程師在配置 JWT 時將 `ClockSkew` 粗暴設為零；更嚴重的資安事故在於：訂單退款 API 僅標註了粗粒度的 `[Authorize]`，未限制任何角色或權限宣告，導致普通買家只需竄改請求中的 `orderId`，即可隨意核准退款，爆發嚴重的**物件層級越權存取（BOLA / IDOR）**漏洞。

這正是對 **401（未驗證）與 403（未授權）的邊界混淆**，以及缺乏 **宣告型原則授權（Policy-based Authorization）** 所引發的典型系統危機。

## 致命反模式 vs. 正確解法

```text
【驗證 (AuthN) 與授權 (AuthZ) 雙重防線】
客戶端請求 (帶 Bearer Token) ──► [第一道防線：Authentication]
                                         │ (Token 簽名有效且未過期？)
                                         ├── (否) ──► 🚨 回傳 401 Unauthorized (你是誰？)
                                         └── (是) ──► 建立 ClaimsPrincipal
                                                            │
                                  [第二道防線：Authorization] ◄─┘
                                         │ (滿足 RequireRole("Admin")？)
                                         ├── (否) ──► 🚫 回傳 403 Forbidden (無權操作！)
                                         └── (是) ──► 放行進入業務端點
```

### 坑一：忽視 ClockSkew 預設值（5 分鐘）

`TokenValidationParameters.ClockSkew` 預設高達 300 秒。若簽發了 1 分鐘的短效 Token，該 Token 在過期後長達 5 分鐘內依然能被驗證通過，失去短效防護意義。

### 坑二：僅用 [Authorize] 裸跑，未防範垂直越權

僅檢查是否登入，未校驗 `ClaimsPrincipal` 是否擁有管理員權限或資源歸屬權，造成越權調用。

~~~csharp title="Program.cs"
// ✅ Good：嚴格配置 TokenValidationParameters 與基於宣告的授權驗證
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;

// 1. 配置符合生產安全規範的 Token 驗證參數
var validationParameters = new TokenValidationParameters
{
    ValidateIssuer = true,
    ValidIssuer = "https://auth.commerce.com",
    ValidateAudience = true,
    ValidAudience = "commerce-api",
    ValidateLifetime = true,
    // 關鍵：將時鐘容許漂移壓縮至合理範圍（如 5 秒），消除預設 5 分鐘延遲漏洞
    ClockSkew = TimeSpan.FromSeconds(5)
};

Console.WriteLine($"驗證簽名頒發者: {validationParameters.ValidateIssuer}");
Console.WriteLine($"時鐘漂移縮減為: {validationParameters.ClockSkew.TotalSeconds}s");

// 2. 模擬 ClaimsPrincipal 授權策略校驗
var claims = new[]
{
    new Claim(ClaimTypes.NameIdentifier, "usr_998"),
    new Claim(ClaimTypes.Role, "Admin"),
    new Claim("Scope", "orders:refund")
};
var identity = new ClaimsIdentity(claims, "Bearer");
var principal = new ClaimsPrincipal(identity);

bool canRefund = principal.HasClaim("Scope", "orders:refund") && principal.IsInRole("Admin");
Console.WriteLine($"退款權限查核通過: {canRefund}");
~~~

預期輸出：
```text
驗證簽名頒發者: True
時鐘漂移縮減為: 5s
退款權限查核通過: True
```

## 踩坑與避坑指南

* **401 vs. 403 的語意不可混淆**：
  * **401 Unauthorized**：用戶尚未出示身分證明，或 Token 已過期無效（觸發重新登入或 Refresh Token）。
  * **403 Forbidden**：身分完全合法，但使用者身分「無權」存取此資源（如普通買家嘗試造訪管理後台），此時**不可**跳轉登入頁，應提示無權訪問。
* **JWT Payload 絕對不可存放機密資訊**：
  JWT 只做簽名防竄改（Sign），**並未加密**！任何持有 Token 的客戶端都能透過 Base64 解碼明文讀取 Payload。嚴禁放置密碼雜湊、內部金鑰或敏感情資。
* **避坑原則（什麼時候不要用字串 Role Check？）**：
  * **複雜微服務授權**：嚴禁在各 Controller 隨處硬編碼 `[Authorize(Roles = "Admin,Manager")]`。應透過 `AddAuthorization(opts => opts.AddPolicy("CanRefund", p => p.RequireClaim(...)))` 集中管理授權原則，避免角色異動時牽一髮而動全身。

## 線上排查指令

線上檢查 Token 簽名與認證授權日誌：

```bash
# 1. 啟用 ASP.NET Core 身份驗證中介軟體之 Debug 日誌
export Logging__LogLevel__Microsoft.AspNetCore.Authentication=Debug
export Logging__LogLevel__Microsoft.AspNetCore.Authorization=Debug

# 2. 檢視日誌中是否有 SecurityTokenExpiredException
grep -i "SecurityTokenExpiredException" /var/log/app/*.log | tail -n 20
```
