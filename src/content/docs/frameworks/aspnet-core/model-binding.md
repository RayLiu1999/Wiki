---
title: "ASP.NET Core 模型繫結與驗證：非同步串流與安全防線"
description: "深入剖析 Request.Body 串流讀取機制、同步阻塞 ThreadPool 災難、RequestSizeLimit 大小防禦，以及 DataAnnotations 與 FluentValidation 邊界。"
articleId: "aspnet-core-model-binding"
topic: "aspnet-core"
category: "web-api"
order: 3
tags: ["ASP.NET Core", "Model Binding", "模型繫結", "資料驗證", "System.Text.Json", "串流處理"]
articleType: "deep-dive"
prerequisites: ["aspnet-core-routing"]
relatedArticles: ["aspnet-core-http-contracts", "aspnet-core-dependency-injection"]
applicableVersions: ".NET 8 / .NET 10、C# 12+ / 14"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "自訂讀取 Request.Body 必須一路非同步串流處理；大型承載資料務必限制 MaxRequestBodySize；驗證邏輯與資料庫存取嚴格脫鉤。"
sources:
  - title: "Microsoft Learn：ASP.NET Core 中的模型繫結"
    url: "https://learn.microsoft.com/zh-tw/aspnet/core/mvc/models/model-binding"
  - title: "Microsoft Learn：ASP.NET Core 中的模型驗證"
    url: "https://learn.microsoft.com/zh-tw/aspnet/core/mvc/models/validation"
---

## 案發現場

某電商批次建立訂單端點在促銷時突然被惡意客戶端灌入 80MB 的深層巢狀 JSON，微服務直接在 Heap 配置巨量暫存字串，觸發連續 Gen 2 GC 停頓甚至整站 OOM 崩潰；另一起事故中，工程師為了記錄 Request Payload，在自訂 ModelBinder 內使用了 `new StreamReader(Request.Body).ReadToEnd()` 同步讀取串流，瞬間引發高併發下的 ThreadPool 飢餓與全站 504 逾時。

根因在於：對 ASP.NET Core **HTTP 請求本文（Request Body）的單向串流本質**缺乏防護，且未設定承載上限。

## 致命反模式 vs. 正確解法

```text
【Request Body 處理模式對比】
[❌ Bad]  Request.Body ──► 同步 ReadToEnd() ──► 佔據整塊記憶體 (80MB 暫存字串) ──► 💥 OOM & 卡死執行緒
[✅ Good] Request.Body ──► 非同步串流解碼 ────► 小片段 Buffer (邊讀邊還原成 DTO) ──► 零大物件、即時防禦
```

### 坑一：同步阻塞讀取不可倒帶的 Request.Body

`Request.Body` 預設是**單向轉發串流（Forward-only）**。若使用同步 API 讀取，會直接凍結當前執行緒池執行緒；若讀完後未設定 `EnableBuffering()`，後續控制器將無法再次讀取。

### 坑二：缺乏請求大小上限防禦

未限制 `MaxRequestBodySize` 時，攻擊者可藉由緩慢上傳巨型 JSON 耗盡伺服器記憶體與連線資源。

~~~csharp title="Program.cs"
// ✅ Good：非同步串流還原序列化與強型別資料註解驗證
using System.ComponentModel.DataAnnotations;
using System.Text;
using System.Text.Json;

// 1. 模擬由 Request.Body 串流非同步讀取並反序列化
string jsonPayload = "{\"sku\":\"PROD-1001\",\"quantity\":3,\"unitPrice\":199.99}";
using var stream = new MemoryStream(Encoding.UTF8.GetBytes(jsonPayload));

var orderDto = await JsonSerializer.DeserializeAsync<CreateOrderItemDto>(stream);
Console.WriteLine($"反序列化成功: {orderDto?.Sku}");

// 2. 執行模型資料完整性驗證
var validationResults = new List<ValidationResult>();
var context = new ValidationContext(orderDto!);
bool isValid = Validator.TryValidateObject(orderDto!, context, validationResults, validateAllProperties: true);

Console.WriteLine($"模型驗證合規: {isValid}");
Console.WriteLine($"驗證錯誤數: {validationResults.Count}");

public sealed class CreateOrderItemDto
{
    [Required(ErrorMessage = "商品編號為必填")]
    [StringLength(20, MinimumLength = 3, ErrorMessage = "SKU 長度需介於 3~20")]
    public string Sku { get; set; } = string.Empty;

    [Range(1, 100, ErrorMessage = "單次購買數量必須介於 1~100")]
    public int Quantity { get; set; }

    [Range(0.01, 100000.0, ErrorMessage = "單價金額超出合理範圍")]
    public decimal UnitPrice { get; set; }
}
~~~

預期輸出：
```text
反序列化成功: PROD-1001
模型驗證合規: True
驗證錯誤數: 0
```

## 踩坑與避坑指南

* **多次讀取 Request.Body 的唯一解法：`EnableBuffering`**：
  若在審計日誌中非得提前讀取 Request Body，必須在中介軟體最前端呼叫 `context.Request.EnableBuffering()`，並在讀取完畢後呼叫 `context.Request.Body.Position = 0;` 將串流指標歸零。
* **嚴格配置請求大小上限**：
  在 Controller 或 Minimal API 端點標註 `[RequestSizeLimit(5_000_000)]`，或全域限制 Kestrel 的 `MaxRequestBodySize`，超標時直接在 Socket 層級回應 `413 Payload Too Large`，禁止其進入記憶體。
* **避坑原則（什麼時候不要在 ModelBinder 中連線資料庫？）**：
  * **檢查庫存或商品有效性**：ModelBinder 的單一職責是「從 HTTP 協議提取資料並組裝物件」。若在 Binder 內查資料庫，一旦驗證失敗將無法享有統一的 ProblemDetails 錯誤回報機制，並造成不必要的資料庫連線佔用。業務檢查應留給 Handler / Service。

## 線上排查指令

線上排查 Kestrel 請求傳輸與大型封包：

```bash
# 1. 監控 Kestrel 連線數、請求佇列長度與目前接收位元組速率
dotnet-counters monitor Microsoft.AspNetCore.Server.Kestrel --counters current-connections,request-queue-length

# 2. 檢視日誌中是否有 413 Payload Too Large 或反序列化逾時
grep -i "BadHttpRequestException" /var/log/app/*.log | tail -n 20
```
