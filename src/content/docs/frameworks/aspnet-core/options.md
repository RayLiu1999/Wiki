---
title: "Options：設定寫錯時，讓服務在啟動時就失敗"
description: "說明 ASP.NET Core 如何把設定綁定成強型別物件、IOptions／IOptionsSnapshot／IOptionsMonitor 的差別，以及 ValidateOnStart 如何擋下帶著錯誤設定上線。"
articleId: "aspnet-core-options"
topic: "aspnet-core"
category: "services"
order: 2
tags: ["ASP.NET Core", "Options", "IOptionsMonitor", "ValidateOnStart", "組態"]
articleType: "deep-dive"
difficulty: "beginner"
prerequisites: ["aspnet-core-dependency-injection"]
relatedArticles: ["dotnet-hosting", "kubernetes-configuration-security", "aspnet-core-http-client-factory"]
applicableVersions: ".NET 8～10、ASP.NET Core 8～10。"
lastReviewed: "2026-10-21"
takeaway: "設定綁定成強型別類別，並加上 ValidateDataAnnotations 與 ValidateOnStart；Singleton 用 IOptions 或 IOptionsMonitor，不要注入 IOptionsSnapshot。"
sources:
  - title: "Microsoft Learn：ASP.NET Core 中的選項模式"
    url: "https://learn.microsoft.com/aspnet/core/fundamentals/configuration/options"
  - title: "Microsoft Learn：選項驗證"
    url: "https://learn.microsoft.com/dotnet/core/extensions/options#options-validation"
  - title: "Microsoft Learn：選項驗證的編譯時期來源產生"
    url: "https://learn.microsoft.com/dotnet/core/extensions/options-validation-generator"
---

## 這是什麼

付款閘道的網址、逾時秒數、重試次數，這些都放在設定檔或環境變數裡。如果在程式裡到處寫 `configuration["Payment:TimeoutSeconds"]`，打錯一個字就拿到 null，而且要等到真的有人付款時才會發現。

**Options 模式**把一組設定綁定成一個 C# 類別，透過 DI 注入使用。搭配驗證，設定不合法時，服務在啟動時就失敗，而不是上線後才出錯。

## 運作原理

```mermaid
flowchart LR
    Sources["appsettings.json<br/>環境變數<br/>Secret"] --> Config["IConfiguration<br/>（後面的來源覆蓋前面的）"]
    Config -->|"Bind(\"Payment\")"| Options["PaymentOptions 類別"]
    Options --> Validate{"ValidateOnStart<br/>啟動時驗證"}
    Validate -->|通過| Inject["注入到服務"]
    Validate -->|失敗| Fail["啟動失敗，<br/>Pod 不會變成 Ready"]
```

三種注入方式的差別在「設定改了以後，拿到的值會不會變」：

| 介面 | 生命週期 | 設定檔變更後 |
| --- | --- | --- |
| `IOptions<T>` | Singleton | 不變，啟動時讀一次 |
| `IOptionsSnapshot<T>` | Scoped | 下一個請求拿到新值 |
| `IOptionsMonitor<T>` | Singleton | `CurrentValue` 拿到新值，也可以訂閱變更 |

在 Kubernetes 上，設定通常來自環境變數或掛載的檔案。環境變數在 Pod 啟動後不會變；掛載的 ConfigMap 檔案會更新，但要確認應用程式有監看檔案變更。

## 常見錯誤與正確寫法

### 1. 沒有驗證，錯誤設定上線後才爆炸

```csharp
public sealed class PaymentOptions
{
    public const string Section = "Payment";

    [Required, Url]
    public required string BaseUrl { get; init; }

    [Range(1, 30)]
    public int TimeoutSeconds { get; init; } = 10;
}

builder.Services.AddOptions<PaymentOptions>()
    .Bind(builder.Configuration.GetSection(PaymentOptions.Section))
    .ValidateDataAnnotations()  // 檢查 [Required]、[Range] 等標註
    .ValidateOnStart();         // 啟動時就檢查，而不是第一次使用時
```

`ValidateOnStart` 讓錯誤的設定在 Pod 啟動時就讓程序結束，搭配 Kubernetes 的 rolling update，新版本起不來，舊版本就不會被替換。

跨欄位的規則（例如「重試次數乘上逾時不能超過 60 秒」）用 `.Validate(o => ..., "錯誤訊息")` 加上。.NET 8 起也可以用來源產生器（`[OptionsValidator]`）在編譯時產生驗證程式碼，適合 Native AOT。

### 2. Singleton 注入 IOptionsSnapshot

`IOptionsSnapshot<T>` 是 Scoped 服務。Singleton 注入它，就是 [Captive Dependency](/frameworks/aspnet-core/dependency-injection/)，開發環境會直接丟出例外。Singleton 需要即時設定就用 `IOptionsMonitor<T>`：

```csharp
public sealed class PaymentClient(HttpClient http, IOptionsMonitor<PaymentOptions> options)
{
    public async Task<PaymentResult> ChargeAsync(ChargeRequest request, CancellationToken ct)
    {
        var current = options.CurrentValue; // 每次讀取都是最新值
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(TimeSpan.FromSeconds(current.TimeoutSeconds));
        // ...
    }
}
```

### 3. 以為改了設定就會即時生效

有些設定只在啟動時使用一次，例如資料庫連線池大小、Kestrel 的 port。即使用了 `IOptionsMonitor`，改了也不會套用到已經建立的連線池。這類設定的變更應該透過重新部署，而不是熱更新。

## 使用邊界

- 密碼、金鑰不要放在 `appsettings.json`。在雲端使用 Secret Manager 或 Secrets Manager，透過 Kubernetes Secret 或 CSI 掛載成環境變數或檔案，見 [設定與 Secret](/platforms/kubernetes/configuration-security/)。
- 同一個類別需要多組設定（例如兩個不同的付款閘道），用具名選項（Named Options）：`IOptionsMonitor<T>.Get("LinePay")`。
- 設定來源的優先順序（環境變數覆蓋 `appsettings.json` 等），見 [Generic Host](/platforms/dotnet/hosting/)。
