---
title: "Model Binding 與 API 輸入邊界"
description: "明確指定 Body、Query、Route、Header、Form 與服務來源，區分資料繫結與業務驗證。"
articleId: "aspnet-core-model-binding"
topic: "aspnet-core"
category: "web-api"
order: 1
tags: ["Model Binding", "ApiController", "FromBody", "FromQuery", "FromRoute", "FromHeader", "FromForm", "FromServices"]
difficulty: "intermediate"
prerequisites: ["csharp-syntax-traps"]
relatedArticles: ["aspnet-core-dependency-injection", "architecture-application-patterns"]
applicableVersions: "以 .NET 10 生態系與本文列出的官方文件核對；套件及資料庫供應商的差異見內文。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-08"
takeaway: "輸入從哪裡來、能不能轉型、是否符合商業規則，是三個不同問題。"
noteDates: ["2026-05-22", "2026-05-28"]
sources: [{"title": "Microsoft Learn：Model Binding", "url": "https://learn.microsoft.com/en-us/aspnet/core/mvc/models/model-binding?view=aspnetcore-10.0"}, {"title": "Microsoft Learn：Controller 型 Web API", "url": "https://learn.microsoft.com/en-us/aspnet/core/web-api/?view=aspnetcore-10.0"}]
learningDepth: "deep"
---

HTTP 中的路徑、查詢字串、標頭和 body，需要轉成端點的輸入模型。Model Binding 處理資料來源與解析，商品存在、數量合法和買家權限則是後續的不同驗證。

## 指定輸入來源

| Attribute | 資料來源 |
| --- | --- |
| `[FromRoute]` | 路由中的 id 等值 |
| `[FromQuery]` | URL query string |
| `[FromHeader]` | HTTP header |
| `[FromBody]` | request body，經 input formatter 處理 |
| `[FromForm]` | 表單或 multipart 資料 |
| `[FromServices]` | DI 容器，不是用戶送來的資料 |

`[ApiController]` 提供來源推斷及模型驗證失敗時的自動 400 等行為。明確指定來源能避免複雜型別與 DI 推斷造成誤解；同一個 action 不應安排多個需要獨立讀取 body 的參數。

## 把外部資料留在邊界

下列為 ASP.NET Core Controller 片段；需在 Web 專案註冊 AddControllers 並 MapControllers，未在本站執行。

~~~csharp title="OrdersController.cs（整合片段）"
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("orders")]
public sealed class OrdersController : ControllerBase
{
    [HttpPost("{id:int}")]
    public IActionResult Update(
        [FromRoute] int id,
        [FromBody] UpdateOrder request,
        [FromQuery] bool dryRun,
        [FromHeader(Name = "X-Request-Id")] string? requestId,
        [FromServices] ILogger<OrdersController> logger)
    {
        logger.LogInformation("Update order {Id}", id);
        return Ok(new { id, request.Quantity, dryRun, requestId });
    }
}
public sealed record UpdateOrder(int Quantity);
~~~

## 繫結成功不等於有效訂單

數字能轉成 int，不代表 Quantity 可以是負數。DTO 描述外部契約，Validator 處理輸入格式與跨欄位條件，領域型別維持不變量。表單上傳要另外考慮檔案大小與讀取策略，不能直接套用 JSON body 的思考方式。

取消、驗證、錯誤回應與授權是 Web 邊界的其他責任；不要把 HttpContext 直接傳進 Domain。

## 套用到電商情境

POST /orders 的 productId 與 quantity 來自 JSONbody；GET /products/{id}來自 route。用戶端送的 buyerId 不能代替登入身分。繫結成功只代表資料可以形成輸入，尚未證明能建立有效訂單。

[閱讀對應的電商章節](/projects/ecommerce/product-api/)，把本篇概念接到整個用例。
