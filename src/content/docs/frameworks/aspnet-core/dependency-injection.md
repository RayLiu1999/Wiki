---
title: "ASP.NET Core 相依性注入（DI）：生命週期陷阱與 Captive Dependency 防禦"
description: "深入剖析 Transient/Scoped/Singleton 三大生命週期、Captive Dependency 捕捉性依賴災難、根容器記憶體洩漏與 ValidateScopes 防護。"
articleId: "aspnet-core-dependency-injection"
topic: "aspnet-core"
category: "services"
order: 1
tags: ["ASP.NET Core", "DI", "相依性注入", "生命週期", "CaptiveDependency", "ValidateScopes", "記憶體洩漏"]
articleType: "deep-dive"
prerequisites: ["csharp-syntax-traps"]
relatedArticles: ["aspnet-core-options", "aspnet-core-http-client-factory"]
applicableVersions: ".NET 8 / .NET 10、C# 12+ / 14"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "長生命週期嚴禁直接注入短生命週期服務；CI 與啟動期務必開啟 ValidateScopes 與 ValidateOnBuild 阻斷 Captive Dependency。"
sources:
  - title: "Microsoft Learn：ASP.NET Core 中的相依性插入"
    url: "https://learn.microsoft.com/zh-tw/aspnet/core/fundamentals/dependency-injection"
  - title: "Microsoft Learn：.NET 相依性插入指導方針"
    url: "https://learn.microsoft.com/zh-tw/dotnet/core/extensions/dependency-injection-guidelines"
---

## 案發現場

某電商後端突發詭異事故：不同買家結帳時竟然查到了別人的購物車內容，且資料庫連線頻繁報錯 `A second operation was started on this context instance before a previous operation completed`；隨著服務運行，記憶體中的 DbContext 與實體物件持續暴增，最終被 Linux cgroup OOMKilled 重啟。

問題根源：工程師將預設為 Scoped 的 `OrderDbContext` 直接注入進了一個 Singleton 單例緩存服務。這觸發了致命的**捕捉性依賴（Captive Dependency）**，導致所有使用者的並行請求全數共用同一個 DbContext 實體，引發嚴重的資料競爭與記憶體洩漏。

## 致命反模式 vs. 正確解法

```text
【Captive Dependency 捕捉性依賴災難】
Singleton 服務 (行程存活期) ──[錯誤注入]──► Scoped 服務 (本應隨 HTTP 請求結束銷毀)
                                            │
                                            ▼
                           Scoped 實體被強行續命，永久駐留記憶體！
                           全站跨請求共用同一個實體 ──► 💥 資料競爭與 OOM
```

### 坑一：Singleton 直接依賴 Scoped 服務

Singleton 實體在應用程式生命週期內僅建立一次，一旦在建構子注入 Scoped 服務，該 Scoped 實體將被長久捕捉，失去依請求隔離的保護。

### 坑二：在根容器（Root Provider）解析 Scoped 服務

若未透過 `CreateScope()`，直接在 `app.Services.GetRequiredService<TScoped>()` 解析，該實體會掛在根容器底下，直到應用程式關閉前永遠不會被 GC 回收。

~~~csharp title="Program.cs"
// ✅ Good：啟用啟動期範圍驗證並透過 IServiceScopeFactory 安全呼叫
using Microsoft.Extensions.DependencyInjection;

var services = new ServiceCollection();

// 註冊不同生命週期之服務
services.AddScoped<IOrderService, OrderService>();
services.AddSingleton<OrderBatchProcessor>();

// 關鍵：構建 ServiceProvider 時強制開啟範圍驗證（ValidateScopes）
var serviceProvider = services.BuildServiceProvider(new ServiceProviderOptions
{
    ValidateScopes = true,
    ValidateOnBuild = true
});

// 在單例服務中正確透過 IServiceScopeFactory 建立短暫生命週期
var processor = serviceProvider.GetRequiredService<OrderBatchProcessor>();
await processor.ProcessOrderAsync();

public interface IOrderService { void Execute(); }
public class OrderService : IOrderService { public void Execute() => Console.WriteLine("訂單邏輯在獨立 Scope 內安全執行"); }

public sealed class OrderBatchProcessor(IServiceScopeFactory scopeFactory)
{
    public async Task ProcessOrderAsync()
    {
        // 每次處理業務時手動開啟 Scope，用完即自動釋放資源
        using var scope = scopeFactory.CreateScope();
        var orderService = scope.ServiceProvider.GetRequiredService<IOrderService>();
        orderService.Execute();
        await Task.CompletedTask;
    }
}
~~~

預期輸出：
```text
訂單邏輯在獨立 Scope 內安全執行
```

## 踩坑與避坑指南

* **啟動期防禦：`ValidateScopes` 與 `ValidateOnBuild`**：
  在 `Program.cs` 設定 `builder.Host.UseDefaultServiceProvider((_, opts) => { opts.ValidateScopes = true; opts.ValidateOnBuild = true; });`。只要有任何 Singleton 嘗試依賴 Scoped，程式在啟動或首個請求時便會立即拋出 `InvalidOperationException` 阻斷發布，防患於未然。
* **`IDisposable` 資源釋放權歸屬**：
  由 DI 容器解析建立的實體，在 Scope 結束（`scope.Dispose()`）時會由容器自動依反向順序呼叫其 `Dispose()`。若是自行 `new` 出來的實體，容器概不負責，必須由呼叫端手動釋放。
* **避坑原則（什麼時候千萬不要使用 Transient？）**：
  * **內含連線集區或大型狀態的重量級元件**：例如 `HttpClient`、`ConnectionMultiplexer` 或資料庫連接字串快取。若誤設為 Transient，高併發下每秒產生成千上萬個實體，會迅速打爆 Socket 資源並觸發嚴重的 GC 停頓。

## 線上排查指令

線上檢查 DI 洩漏與 Captive Dependency：

```bash
# 1. 抓取 CoreDump 並分析堆積上留存的 Scoped 服務實體計數
dotnet-dump analyze dump.dmp
> dumpheap -stat -type OrderDbContext

# 2. 檢視根容器（Root ServiceProvider）引用的存活鏈
> gcroot <address_of_scoped_instance>
```
