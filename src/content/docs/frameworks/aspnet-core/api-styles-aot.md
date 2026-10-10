---
title: "ASP.NET Core API 風格決策：Controllers vs. Minimal APIs 與 Native AOT"
description: "深入對比 Controllers 與 Minimal APIs 吞吐量差異、Request Delegate Generator 編譯期生成，以及 Native AOT 冷啟動與剪裁相容實戰。"
articleId: "aspnet-core-api-styles-aot"
topic: "aspnet-core"
category: "web-api"
order: 6
tags: ["ASP.NET Core", "Minimal APIs", "Controllers", "Native AOT", "RDG", "Serverless", "冷啟動"]
articleType: "deep-dive"
prerequisites: ["aspnet-core-http-contracts"]
relatedArticles: ["aspnet-core-model-binding", "dotnet-clr-jit"]
applicableVersions: ".NET 8 / .NET 10、C# 12+ / 14"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "極限效能、高吞吐或 Serverless 首選 Minimal APIs 與 Native AOT；大型既有單體可保留 Controllers；AOT 必須搭配 JSON Source Generator。"
sources:
  - title: "Microsoft Learn：最小 API 概觀"
    url: "https://learn.microsoft.com/zh-tw/aspnet/core/fundamentals/minimal-apis"
  - title: "Microsoft Learn：針對原生 AOT 的 ASP.NET Core 支援"
    url: "https://learn.microsoft.com/zh-tw/aspnet/core/fundamentals/native-aot"
---

## 案發現場

某電商秒殺服務搬遷至 Serverless（如 AWS Lambda 或 GCP Cloud Run）時，遭遇嚴重的冷啟動延遲：容器啟動耗時超過 3.5 秒，初始流量大量超時；排查發現，傳統 MVC Controller 在啟動時會耗費大量 CPU 透過反射掃描所有 Assembly、註冊動作描述器與驗證模型；團隊嘗試直接開啟 `PublishAot=true`，上線後大量路由直接噴出 `404` 與反序列化遺失中繼資料崩潰。

根因在於：對 **Controllers（重型執行期反射模型）** 與 **Minimal APIs + Native AOT（編譯期靜態生成模型）** 的架構特性缺乏清晰認知。

## 致命反模式 vs. 正確解法

```text
【API 派發機制對比】
[Controllers]  HTTP 請求 ──► MVC 動作調度器 ──► 執行期動態反射呼叫 Controller Action (需 JIT/中繼資料)
[Minimal APIs] HTTP 請求 ──► RDG 編譯期靜態委派 ──► 直接跳轉靜態方法 (0 反射開銷、100% Native AOT 相容)
```

### 坑一：在 Serverless 冷啟動環境使用全量 MVC

MVC Controller 框架隨附龐大的中繼資料表與過濾器管線，不僅使容器映像檔膨脹至數百 MB，更造成啟動時間大幅拉長。

### 坑二：AOT 模式下使用未經 Source Generator 的動態 JSON

Native AOT 會修剪未靜態引用的程式碼。若使用反射式 JSON 序列化，DTO 屬性會在發布時被 IL 剪裁器刪除。

~~~csharp title="Program.cs"
// ✅ Good：結合 Minimal APIs 路由群組與 Source Generator 強型別序列化
using System.Text.Json;
using System.Text.Json.Serialization;

var product = new ProductDto(Id: 101, Name: "保溫杯", Price: 120.0m);

// 透過編譯期生成之 JsonSerializerContext 進行序列化（零執行期反射、相容 Native AOT）
string json = JsonSerializer.Serialize(product, ProductJsonSerializerContext.Default.ProductDto);

Console.WriteLine($"AOT 相容 JSON 輸出成功: {json.Contains("保溫杯")}");
Console.WriteLine($"DTO 欄位完整: {json.Contains("120")}");

public record ProductDto(int Id, string Name, decimal Price);

// 關鍵：標註 JsonSerializable，讓 Roslyn 在編譯期生成序列化代碼
[JsonSerializable(typeof(ProductDto))]
public partial class ProductJsonSerializerContext : JsonSerializerContext;
~~~

預期輸出：
```text
AOT 相容 JSON 輸出成功: True
DTO 欄位完整: True
```

## 踩坑與避坑指南

* **請求委派產生器（Request Delegate Generator, RDG）**：
  在 .NET 8+ / .NET 10 中，編譯器會自動攔截 `MapGet` / `MapPost` 等 Minimal API 宣告，直接生成靜態的參數綁定程式碼，使 Minimal APIs 比傳統 Controller 省下 15%~25% 的記憶體與呼叫耗時。
* **Minimal APIs 組織原則：`MapGroup`**：
  若擔心 Minimal API 導致 `Program.cs` 臃腫，可使用 `app.MapGroup("/api/orders").MapOrderEndpoints();` 將各領域切分至獨立的靜態擴充方法中，結構比 Controller 更簡潔清晰。
* **避坑原則（什麼時候不要急著切換至 Native AOT？）**：
  * **重度依賴動態 ORM 與未驗證第三方套件**：如果專案使用未適配 AOT 的老舊 NuGet 套件，或業務有大量動態組裝 LINQ 查詢需求，強行開 AOT 會面臨無窮無盡的 `IL2026` 剪裁警告與執行期 MissingMethod 崩潰。一般容器微服務使用標準 JIT + Dynamic PGO 通常已具備頂級吞吐效能。

## 線上排查指令

檢查與驗證 Native AOT 剪裁相容性：

```bash
# 1. 本地執行 Native AOT 發布並檢驗是否有 Trimming 警告
dotnet publish -c Release -r linux-x64 /p:PublishAot=true

# 2. 檢視編譯生成的單一二進位執行檔大小與相依性
ls -lh bin/Release/net10.0/linux-x64/publish/
```
