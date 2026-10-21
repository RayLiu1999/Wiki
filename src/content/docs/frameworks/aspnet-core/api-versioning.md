---
title: "API 版本管理：改了回應格式，舊版 App 怎麼辦"
description: "說明哪些變更需要新版本、哪些不需要，以 Asp.Versioning 在網址或標頭中區分版本、回報支援與即將下線的版本，以及舊版本的下線流程。"
articleId: "aspnet-core-api-versioning"
topic: "aspnet-core"
category: "web-api"
order: 14
tags: ["ASP.NET Core", "API 版本", "Asp.Versioning", "相容性", "Sunset"]
articleType: "deep-dive"
difficulty: "advanced"
prerequisites: ["aspnet-core-http-contracts"]
relatedArticles: ["aspnet-core-api-styles-aot", "security-api-risks", "engineering-ci-cd"]
applicableVersions: ".NET 8～10、Asp.Versioning.Http／Asp.Versioning.Mvc 8.x 以上。"
lastReviewed: "2026-10-21"
takeaway: "新增欄位、新增端點不需要新版本；改名、刪除、改變語意才需要。新版本上線後，舊版本要回報即將下線，並在約定的日期後移除。"
sources:
  - title: "Asp.Versioning（ASP.NET API Versioning）"
    url: "https://github.com/dotnet/aspnet-api-versioning"
  - title: "Asp.Versioning Wiki：Minimal APIs"
    url: "https://github.com/dotnet/aspnet-api-versioning/wiki/Minimal-APIs"
  - title: "RFC 8594：The Sunset HTTP Header Field"
    url: "https://www.rfc-editor.org/rfc/rfc8594"
  - title: "Microsoft Learn：Minimal API 中的 OpenAPI 文件"
    url: "https://learn.microsoft.com/aspnet/core/fundamentals/openapi/aspnetcore-openapi"
---

## 這是什麼

電商 App 已經上架，有些買家很久沒有更新。後端把訂單回應的 `total` 欄位改成 `totalAmount`，舊版 App 就讀不到金額了。後端可以隨時部署，但你無法控制用戶端什麼時候更新。

**API 版本管理**讓新舊用戶端可以同時使用各自的版本：新版 App 用 v2 的格式，舊版 App 繼續用 v1，直到 v1 下線。

## 運作原理

```mermaid
flowchart LR
    Old["舊版 App"] -->|"GET /v1/orders/42"| V1["v1 端點<br/>回傳 total"]
    New["新版 App"] -->|"GET /v2/orders/42"| V2["v2 端點<br/>回傳 totalAmount"]
    V1 --> Core["同一套用例與資料"]
    V2 --> Core
    V1 -. "回應標頭：此版本即將下線" .-> Old
```

版本只是 API 的「對外格式」，背後的業務邏輯與資料通常是同一套。v1 和 v2 的端點各自把用例的結果轉成自己的 DTO。

**什麼時候需要新版本**：

| 變更 | 是否會讓舊用戶端出錯 | 需要新版本嗎 |
| --- | --- | --- |
| 新增回應欄位 | 否（用戶端忽略不認識的欄位） | 不需要 |
| 新增端點、新增選填的請求欄位 | 否 | 不需要 |
| 欄位改名、刪除欄位 | 是 | 需要 |
| 改變欄位的意義或型別（例如金額從元改成分） | 是 | 需要 |
| 新增必填的請求欄位 | 是 | 需要 |

能用「只新增」的方式演進，就不必建立新版本；版本越多，要維護與測試的東西就越多。

## 常見錯誤與正確寫法

### 1. 直接修改既有的回應格式

改名或刪除欄位前，先建立新版本，舊版本保留原本的格式。以 `Asp.Versioning.Http` 在網址中區分版本：

```csharp
// 套件：Asp.Versioning.Http
builder.Services.AddApiVersioning(options =>
{
    options.DefaultApiVersion = new ApiVersion(1);
    options.ReportApiVersions = true; // 回應標頭列出支援與已淘汰的版本
});

var orders = app.NewVersionedApi("Orders");

var v1 = orders.MapGroup("/v{version:apiVersion}/orders").HasApiVersion(1.0);
v1.MapGet("/{id:guid}", async (Guid id, OrderQueries q, CancellationToken ct) =>
    await q.GetAsync(id, ct) is { } o ? Results.Ok(new OrderV1(o.Id, o.Total)) : Results.NotFound());

var v2 = orders.MapGroup("/v{version:apiVersion}/orders").HasApiVersion(2.0);
v2.MapGet("/{id:guid}", async (Guid id, OrderQueries q, CancellationToken ct) =>
    await q.GetAsync(id, ct) is { } o ? Results.Ok(new OrderV2(o.Id, o.Total, o.Currency)) : Results.NotFound());
```

版本也可以放在查詢字串或標頭（例如 `api-version`）。網址中的版本最直觀、也最容易在日誌與負載平衡器上分辨，對外的公開 API 通常採用這種方式。

### 2. 舊版本永遠不下線

舊版本留著不管，裡面可能是較舊、較弱的驗證邏輯，也拖累每次修改的成本（每個版本都要測試）。新版本上線時就定好舊版本的下線日期，並讓用戶端知道：

- 將 v1 標記為已淘汰（`HasDeprecatedApiVersion` 或對應的設定），回應標頭會列出 `api-deprecated-versions`。
- 加上 `Sunset` 標頭（RFC 8594）告知下線日期。
- 記錄各版本的呼叫量，確認舊版本的流量降到可以接受的程度再移除。

### 3. 每個版本複製一份完整的程式碼

v1 與 v2 各有一套 Service、Repository，修一個錯要改兩次。版本只存在於最外層的端點與 DTO，用例與領域模型只有一份；必要時在端點中把同一個結果轉成不同的格式。

## 使用邊界

- **內部服務之間**（同一個團隊、同時部署）通常不需要正式的版本管理，以「只新增、不刪除」的方式演進即可。
- 行動 App 的舊版本會存在很久，版本下線的期限要依實際的更新率決定，必要時在 App 中提示更新。
- OpenAPI 文件要依版本分開產生，讓前端與合作夥伴看到各版本正確的格式。
- 舊版本是 API 清單管理的一部分，見 [API 安全風險](/security/api-risks/)。
