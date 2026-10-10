---
title: "ASP.NET Core 組態選項（Options）：IOptions 三劍客與啟動期驗證"
description: "深入剖析 IOptions、IOptionsSnapshot 與 IOptionsMonitor 生命週期差異、ValidateOnStart 啟動期防禦，以及熱重載陷阱。"
articleId: "aspnet-core-options"
topic: "aspnet-core"
category: "services"
order: 2
tags: ["ASP.NET Core", "Options", "IOptions", "組態驗證", "ValidateOnStart", "熱重載", "ConfigMap"]
articleType: "deep-dive"
prerequisites: ["aspnet-core-dependency-injection"]
relatedArticles: ["dotnet-hosting", "kubernetes-configuration-security"]
applicableVersions: ".NET 8 / .NET 10、C# 12+ / 14"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "Singleton 服務用 IOptions 或 IOptionsMonitor，Scoped 用 IOptionsSnapshot；一律啟用 ValidateOnStart() 阻斷帶病上線。"
sources:
  - title: "Microsoft Learn：ASP.NET Core 中的選項模式"
    url: "https://learn.microsoft.com/zh-tw/aspnet/core/fundamentals/configuration/options"
  - title: "Microsoft Learn：選項驗證"
    url: "https://learn.microsoft.com/zh-tw/aspnet/core/fundamentals/configuration/options#options-validation"
---

## 案發現場

某電商大促前夕，維運團隊在 Kubernetes ConfigMap 誤將金流逾時設定為負值（`-30`），且金流 API 網址打錯了通訊協定；服務正常通過健康檢查並完成發布，直到半夜開賣首筆訂單湧入時，系統在深層邏輯突然噴出 `ArgumentOutOfRangeException` 導致結帳全面癱瘓；另一端，工程師在單例背景服務中注入了 `IOptionsSnapshot`，直接引發 Captive Dependency 啟動崩潰。

這正是對 **Options 模式三大介面的生命週期** 缺乏認識，且未實施 **啟動期驗證（Fail Fast）** 所導致的典型生產悲劇。

## 致命反模式 vs. 正確解法

```text
【Options 三劍客生命週期分工】
IOptions<T>         (Singleton) ──► 啟動時讀取一次，值永久固定，無任何熱重載開銷 (適合基礎設定)
IOptionsSnapshot<T> (Scoped)    ──► 每個 HTTP 請求獨立快照，支援 ConfigMap 熱重載 (禁止在 Singleton 注入)
IOptionsMonitor<T>  (Singleton) ──► 全域單例，隨時讀取最新熱更新數值，支援 OnChange 回呼
```

### 坑一：未啟用啟動驗證，將錯誤延遲到首個請求爆發

若未使用 `ValidateOnStart()`，不合法的組態會潛伏在系統中，直到特定業務路徑被執行時才爆發，錯失部署回滾時機。

### 坑二：在 Singleton 中注入 Scoped 的 IOptionsSnapshot

`IOptionsSnapshot` 被設計為 Scoped。若直接在 Singleton 服務的建構子注入，在啟動驗證開啟時會立即拋出 `InvalidOperationException`。

~~~csharp title="Program.cs"
// ✅ Good：結合 DataAnnotations 與 ValidateOnStart 實踐啟動防禦
using System.ComponentModel.DataAnnotations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

var configuration = new ConfigurationBuilder()
    .AddInMemoryCollection(new Dictionary<string, string?>
    {
        ["Payment:GatewayUrl"] = "https://pay.commerce.com/v1",
        ["Payment:TimeoutSeconds"] = "15"
    })
    .Build();

var services = new ServiceCollection();

// 註冊強型別 Options，並啟用資料註解校驗與啟動期驗證
services.AddOptions<PaymentGatewayOptions>()
    .Bind(configuration.GetSection("Payment"))
    .ValidateDataAnnotations()
    .ValidateOnStart();

var provider = services.BuildServiceProvider();
var options = provider.GetRequiredService<IOptions<PaymentGatewayOptions>>().Value;

Console.WriteLine($"金流端點已就緒: {options.GatewayUrl}");
Console.WriteLine($"逾時秒數合規: {options.TimeoutSeconds}s");

public sealed class PaymentGatewayOptions
{
    [Required(ErrorMessage = "金流網址為必填")]
    [Url(ErrorMessage = "必須為合法的 URL 格式")]
    public string GatewayUrl { get; set; } = string.Empty;

    [Range(1, 60, ErrorMessage = "逾時時間必須介於 1 到 60 秒之間")]
    public int TimeoutSeconds { get; set; }
}
~~~

預期輸出：
```text
金流端點已就緒: https://pay.commerce.com/v1
逾時秒數合規: 15s
```

## 踩坑與避坑指南

* **啟動期防禦核心：`ValidateOnStart()`**：
  在 .NET 8+ / .NET 10 中，對關鍵基礎設施組態一律串接 `.ValidateOnStart()`。若 ConfigMap 數值非法，Pod 在啟動之初會立即拋出 `OptionsValidationException` 自行終止，Kubernetes 部署流程偵測到失敗會自動暫停滾動更新，徹底阻斷錯誤配置流向線上流量。
* **自訂複雜邏輯校驗：`IValidateOptions<T>`**：
  若驗證涉及多欄位聯動（如「當啟用了 Mock 模式時，密鑰長度可豁免」），可實作 `IValidateOptions<T>` 註冊至 DI，在啟動期進行深層語意校驗。
* **避坑原則（什麼時候不要用 IOptionsMonitor 熱重載？）**：
  * **底層不可變資源**：如資料庫 ConnectionString、Redis 連線實體或加密金鑰。動態熱更換連線字串並不會自動銷毀既有的連線池，極易使進行中的長事務與新連線產生狀態撕裂。變更連線基礎設施應遵循標準 K8s Pod 滾動重啟。

## 線上排查指令

檢查生產環境 Options 驗證失敗與啟動崩潰：

```bash
# 1. 檢視 Pod 啟動初期是否拋出 OptionsValidationException
kubectl logs <pod-name> | grep -A 10 "OptionsValidationException"

# 2. 檢驗當前注入之 ConfigMap 內容語法
kubectl get configmap myapp-config -o yaml
```
