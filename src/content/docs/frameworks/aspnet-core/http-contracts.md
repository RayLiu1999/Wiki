---
title: "ASP.NET Core HTTP API 契約設計：RFC 7807 與 REST 語意實戰"
description: "直擊 Fake 200 反模式、RFC 7807 ProblemDetails 標準錯誤結構、TypedResults 契約導向設計與冪等性標頭規範。"
articleId: "aspnet-core-http-contracts"
topic: "aspnet-core"
category: "web-api"
order: 4
tags: ["ASP.NET Core", "HTTP契約", "REST", "ProblemDetails", "RFC 7807", "TypedResults", "API設計"]
articleType: "reference"
prerequisites: ["aspnet-core-model-binding"]
relatedArticles: ["aspnet-core-api-styles-aot", "architecture-communication-boundaries"]
applicableVersions: ".NET 8 / .NET 10、C# 12+ / 14"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "嚴禁 Fake 200 回傳業務錯誤；全面採用 RFC 7807 ProblemDetails 規範回傳錯誤；以標準 HTTP 狀態碼對齊監控與重試。"
sources:
  - title: "IETF RFC 7807：Problem Details for HTTP APIs"
    url: "https://datatracker.ietf.org/doc/html/rfc7807"
  - title: "Microsoft Learn：ASP.NET Core Web API 中的 ProblemDetails"
    url: "https://learn.microsoft.com/zh-tw/aspnet/core/web-api/handle-errors#problem-details"
---

## 案發現場

某中台系統的 API 一律回傳 `200 OK`，並在 JSON 內嵌入 `{"code": -1024, "msg": "商品庫存不足"}`。這導致前端無法依賴 HTTP 標準狀態判斷失敗，API Gateway 與負載平衡器將所有失敗請求誤判為「服務極其健康」，熔斷與告警機制完全失效；另一端，另一個微服務將所有業務校驗失敗全數粗暴回傳 `500 Internal Server Error`，造成維運監控警報在促銷當晚狂響數千次，工程團隊疲於奔命。

這正是違反 **HTTP 語意標準** 與缺乏 **統一錯誤契約（RFC 7807）** 的典型後端架構反模式。

## 致命反模式 vs. 正確解法

```text
【RFC 7807 標準錯誤規格與狀態碼分工】
4xx (用戶端過失) ──► 400 Bad Request / 422 Unprocessable ──► 包含特定欄位錯誤清單
                 ──► 401 Unauthorized / 403 Forbidden    ──► 身份或權限不足
                 ──► 409 Conflict                         ──► 狀態衝突 (如併發超賣)
5xx (伺服器過失) ──► 500 Internal Error / 503 Overload   ──► 遮蔽堆疊，僅附 traceId
```

### 坑一：Fake 200 偽裝成功

將錯誤偽裝為 200 會破壞瀏覽器快取、CDN 快取、OpenTelemetry 分散式追蹤與重試中介層的標準行為。

### 坑二：非標準、各服務自製的零散錯誤結構

不同團隊各自定義 `error_code`、`err_msg` 或 `result`，使 API 用戶端必須為每個服務寫一套解析邏輯。

~~~csharp title="Program.cs"
// ✅ Good：運用 .NET 原生 ProblemDetails 與 TypedResults 產出標準契約
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

// 1. 建立標準 RFC 7807 驗證失敗契約
var validationErrors = new Dictionary<string, string[]>
{
    ["Quantity"] = ["庫存不足，剩餘數量僅 2 件"]
};

var problem = new HttpValidationProblemDetails(validationErrors)
{
    Type = "https://api.devwiki.com/errors/insufficient-stock",
    Title = "業務規則校驗失敗",
    Status = StatusCodes.Status422UnprocessableEntity,
    Detail = "請求所欲購買之數量超過目前商品現有庫存。",
    Instance = "/api/v1/orders/create"
};

Console.WriteLine($"狀態碼合規: {problem.Status == 422}");
Console.WriteLine($"標準 Type 識別: {problem.Type}");
Console.WriteLine($"包含具體欄位錯誤: {problem.Errors.ContainsKey("Quantity")}");
~~~

預期輸出：
```text
狀態碼合規: True
標準 Type 識別: https://api.devwiki.com/errors/insufficient-stock
包含具體欄位錯誤: True
```

## 踩坑與避坑指南

* **啟用 ASP.NET Core 全局 ProblemDetails**：
  在啟動檔呼叫 `builder.Services.AddProblemDetails()`。框架會自動將未捕捉例外轉譯為符合 RFC 7807 的標準 JSON 回應（`application/problem+json`）。
* **冪等性設計（Idempotency-Key）**：
  涉及下單、扣款等關鍵 POST 端點，應在合約中要求 Header 帶上 `Idempotency-Key: <UUID>`。若遇網路超時重送，後端可依據 Key 判定重複請求直接返回上次成功結果，避免重複扣款。
* **避坑原則（什麼時候千萬不要在 ProblemDetails 洩漏細節？）**：
  * **生產環境的 500 內部伺服器錯誤**：`Detail` 屬性嚴禁包含資料庫連線字串、未脫敏使用者個資或內部 C# Exception StackTrace。應僅保留唯一的 `RequestId` 或 `TraceId`，供客戶端回報客服，詳細堆疊留在私有日誌系統（如 Seq、ELK）。

## 線上排查指令

檢查生產 API 回傳契約與 HTTP 標頭：

```bash
# 1. 使用 curl 檢視狀態碼與 RFC 7807 內容型別
curl -i -X POST https://api.myshop.com/orders -H "Content-Type: application/json" -d "{}"

# 2. 檢驗回傳標頭是否包含 application/problem+json
# HTTP/1.1 422 Unprocessable Entity
# Content-Type: application/problem+json; charset=utf-8
```
