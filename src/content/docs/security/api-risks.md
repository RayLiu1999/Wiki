---
title: "API 安全風險：用電商情境看懂 OWASP API Top 10"
description: "以電商 API 為例說明 OWASP API Security Top 10 的主要風險：看到別人的訂單、改到不該改的欄位、無上限的資源消耗、後台功能沒有權限檢查、搶購流程被自動化濫用，以及伺服器端請求偽造。"
articleId: "security-api-risks"
topic: "security"
category: "api-protection"
order: 2
tags: ["OWASP", "API 安全", "BOLA", "Mass Assignment", "SSRF", "資源消耗"]
articleType: "reference"
difficulty: "beginner"
prerequisites: ["aspnet-core-authentication"]
relatedArticles: ["aspnet-core-rate-limiting", "aspnet-core-model-binding", "security-webhook-signatures"]
applicableVersions: "OWASP API Security Top 10（2023 版）、ASP.NET Core 8～10。"
lastReviewed: "2026-10-21"
takeaway: "API 最常見的漏洞不是加密被破解，而是少了一個檢查：資料是不是你的、這個欄位能不能讓你改、這個功能你有沒有權限、這個請求量合不合理。"
omitSections:
  - section: "運作原理"
    reason: "本篇是風險清單的速查，每一項的成因與防護直接寫在該項目中。"
sources:
  - title: "OWASP API Security Top 10 2023"
    url: "https://owasp.org/API-Security/editions/2023/en/0x11-t10/"
  - title: "OWASP：API3 Broken Object Property Level Authorization"
    url: "https://owasp.org/API-Security/editions/2023/en/0xa3-broken-object-property-level-authorization/"
  - title: "OWASP：API6 Unrestricted Access to Sensitive Business Flows"
    url: "https://owasp.org/API-Security/editions/2023/en/0xa6-unrestricted-access-to-sensitive-business-flows/"
  - title: "OWASP：API7 Server Side Request Forgery"
    url: "https://owasp.org/API-Security/editions/2023/en/0xa7-server-side-request-forgery/"
  - title: "Microsoft Learn：ASP.NET Core 安全性主題"
    url: "https://learn.microsoft.com/aspnet/core/security/"
---

## 這是什麼

**OWASP API Security Top 10** 是整理 API 最常見安全風險的清單。這些風險大多不需要高深的攻擊技巧，往往只是把網址上的數字改掉、在 JSON 裡多加一個欄位、或寫個腳本一直送請求。

下面以電商 API 為例，說明清單中和後端開發最相關的幾項，以及在 ASP.NET Core 中對應的防護方式。

## 常見錯誤與正確寫法

### API1：物件層級授權失效——看到別人的訂單

`GET /orders/1001` 只檢查「有登入」，沒檢查「這張訂單是不是你的」，改成 `/orders/1002` 就看到別人的訂單。這是排名第一的 API 風險。

**防護**：每個用到資源 ID 的端點，都把擁有者當作查詢條件，查不到就回 404。做法見 [驗證與授權](/security/authentication/)。

### API2：身分驗證失效

JWT 沒有驗證簽章或發行者、token 有效期過長、登入端點沒有防止暴力嘗試。

**防護**：完整設定 JWT 的驗證項目、使用短效 token；登入與重設密碼端點加上嚴格的限流，見 [驗證與授權](/security/authentication/)與 [限流](/frameworks/aspnet-core/rate-limiting/)。

### API3：物件屬性層級授權失效——改到不該改的欄位

買家更新個人資料的端點直接把請求綁定到 `Customer` 實體，攻擊者在 JSON 裡多送 `"isVip": true` 或 `"creditLimit": 999999`，就被一起存進去了（大量指派）。反方向也一樣：回應直接序列化整個實體，把內部欄位（成本價、管理備註）傳給了買家。

**防護**：請求與回應都使用專用的 DTO，只包含允許的欄位：

```csharp
// 請求：只有買家可以修改的欄位
public sealed record UpdateProfileRequest(string Nickname, string Phone);

// 回應：只有買家可以看到的欄位
public sealed record ProductResponse(int Id, string Name, decimal Price);
```

不要讓用戶端決定伺服器端的值，例如價格、訂單狀態、擁有者 ID，見 [模型綁定](/frameworks/aspnet-core/model-binding/)。

### API4：無限制的資源消耗

沒有分頁上限的查詢（`?pageSize=1000000`）、沒有大小限制的上傳、昂貴的搜尋沒有限流，都可能讓一個請求耗盡資料庫或記憶體。

**防護**：分頁大小設上限、請求本文設大小上限、昂貴的端點限流，並對外部付費服務（簡訊、Email）的呼叫設定每位使用者的上限。

### API5：功能層級授權失效——後台功能沒有權限檢查

`/admin/products/{id}/price` 只要知道網址，一般買家也能呼叫，因為端點只加了 `[Authorize]`（有登入就好）。

**防護**：後台端點以路由群組統一要求角色或 Policy，並在測試中驗證一般買家呼叫會得到 403：

```csharp
var admin = app.MapGroup("/admin").RequireAuthorization("Merchant");
admin.MapPut("/products/{id:int}/price", UpdatePrice);
```

### API6：敏感業務流程被自動化濫用

搶購、領取優惠券、註冊送點數，這些流程本身沒有漏洞，但被腳本大量執行時，商品被轉賣客掃光、優惠被濫用。

**防護**：這類問題需要業務層的規則：每位買家的購買上限、帳號的可信度、裝置與行為的偵測（例如 CAPTCHA、等候室）。單純的限流只能處理一部分。

### API7：伺服器端請求偽造（SSRF）

「從網址匯入商品圖片」的功能，攻擊者填入 `http://169.254.169.254/...`（雲端的中繼資料服務）或內部服務的位址，讓伺服器替他去存取內部資源。

**防護**：只允許特定網域或已知的圖片來源；拒絕內部與保留的 IP 範圍；在網路層限制應用程式能連出的目的地。

### API8：安全設定錯誤

正式環境開著詳細的錯誤頁面、CORS 允許任何來源、預設帳號密碼沒改、HTTP 沒有轉 HTTPS。

**防護**：正式環境只回應不含內部細節的 Problem Details（見 [HTTP 契約](/frameworks/aspnet-core/http-contracts/)）；CORS 只允許自己的前端網域；設定由 IaC 管理並經過審查。

### API9：API 清單管理不當

舊版本的 API（`/v1/`）沒有下線，仍然使用舊的、較弱的驗證邏輯；測試環境的 API 對外開放。

**防護**：維護所有對外 API 的清單與版本，舊版本設定下線日期，見 [API 版本管理](/frameworks/aspnet-core/api-versioning/)。

### API10：不安全地使用第三方 API

把金流或物流服務回傳的資料當成可信的：直接相信 webhook 說「付款成功」，沒有驗證來源，也沒有向對方確認。

**防護**：驗證 webhook 的簽章，並以第三方的查詢 API 確認實際狀態，見 [Webhook 簽章驗證](/security/webhook-signatures/)。

## 使用邊界

- 清單是起點，不是完整的安全檢查。每次新增端點時，用這十項問自己一次，並在程式碼審查中檢查。
- 授權相關的風險（API1、API3、API5）最適合用自動化測試保護：用不同身分呼叫同一個端點，驗證回應是否正確拒絕。
- 網路層與 WAF 的防護（Cloud Armor、AWS WAF）可以擋住大量明顯的攻擊，但擋不住業務邏輯上的漏洞，例如 BOLA。
