---
title: "HTTP 彈性策略：下游變慢時，重試怎麼不會把它打得更慘"
description: "說明重試、逾時、斷路器各自解決什麼問題，指數退避與隨機抖動為什麼必要、哪些錯誤不該重試，以及 AddStandardResilienceHandler 的預設管線。"
articleId: "aspnet-core-http-resilience"
topic: "aspnet-core"
category: "services"
order: 10
tags: ["ASP.NET Core", "Polly", "重試", "斷路器", "Microsoft.Extensions.Http.Resilience"]
articleType: "deep-dive"
difficulty: "advanced"
prerequisites: ["aspnet-core-http-client-factory"]
relatedArticles: ["aspnet-core-http-contracts", "architecture-communication-boundaries", "rabbitmq-retries-idempotency"]
applicableVersions: ".NET 8～10、Microsoft.Extensions.Http.Resilience 8.x 以上（Polly v8）。"
lastReviewed: "2026-10-21"
takeaway: "重試要有上限、指數退避與隨機抖動，只重試暫時性錯誤；下游持續失敗時用斷路器快速失敗；非冪等的請求不要自動重試。"
sources:
  - title: "Microsoft Learn：建置具韌性的 HTTP 應用程式"
    url: "https://learn.microsoft.com/dotnet/core/resilience/http-resilience"
  - title: "Microsoft Learn：.NET 中的韌性簡介"
    url: "https://learn.microsoft.com/dotnet/core/resilience/"
  - title: "Polly：Retry 策略"
    url: "https://www.pollydocs.org/strategies/retry.html"
  - title: "Polly：Circuit breaker 策略"
    url: "https://www.pollydocs.org/strategies/circuit-breaker.html"
---

## 這是什麼

呼叫外部服務一定會偶爾失敗：網路抖一下、對方正在部署、負載平衡器剛好換節點。**彈性策略**（resilience）是一組處理這些失敗的機制：

- **逾時**：等太久就放棄，不要無限期佔著資源。
- **重試**：暫時性的失敗，等一下再試一次可能就成功了。
- **斷路器**：對方已經持續失敗，就先不要再打過去，直接失敗，給對方喘息的時間。

用錯的代價很大：下游變慢時，每個上游都立刻重試三次，下游收到的流量變成四倍，原本只是變慢，變成完全掛掉。這叫**重試風暴**。

## 運作原理

`Microsoft.Extensions.Http.Resilience` 以 Polly v8 為基礎，`AddStandardResilienceHandler()` 一次加上一條由外往內的標準管線：

```mermaid
flowchart LR
    Call["呼叫端"] --> Total["整體逾時<br/>所有嘗試加起來的上限"]
    Total --> Retry["重試<br/>指數退避＋隨機抖動"]
    Retry --> CB["斷路器<br/>失敗率過高就暫停呼叫"]
    CB --> Attempt["單次嘗試逾時"]
    Attempt --> Down["下游服務"]
```

**指數退避與隨機抖動。** 每次重試的等待時間加倍（例如 1、2、4 秒），讓下游有時間恢復；再加上隨機抖動，避免成千上萬個用戶端在同一個時間點一起重試。

**斷路器的三種狀態。** 正常時「關閉」，請求照常通過；一段時間內失敗比例超過門檻就「打開」，之後的請求直接失敗、不送出去；過一段時間進入「半開」，放一個請求試探，成功就恢復關閉，失敗就再打開。

## 常見錯誤與正確寫法

### 1. 立刻重試、沒有上限

```csharp
// 錯：失敗就立刻重試，最多 10 次；下游變慢時流量放大十倍
for (var i = 0; i < 10; i++)
{
    try { return await http.GetFromJsonAsync<Quote>(url, ct); }
    catch (HttpRequestException) { }
}
```

用標準管線，並依下游的特性調整：

```csharp
// 套件：Microsoft.Extensions.Http.Resilience
builder.Services.AddHttpClient<ShippingClient>(c => c.BaseAddress = new Uri("https://shipping.example.com/v1/"))
    .AddStandardResilienceHandler(options =>
    {
        options.TotalRequestTimeout.Timeout = TimeSpan.FromSeconds(5);  // 呼叫端最多等 5 秒
        options.AttemptTimeout.Timeout = TimeSpan.FromSeconds(2);       // 單次嘗試最多 2 秒
        options.Retry.MaxRetryAttempts = 2;
    });
```

標準管線預設只重試暫時性的錯誤：網路例外、逾時、HTTP 408、429 與 5xx。

### 2. 對 4xx 也重試

400、401、403、404、422 代表請求本身有問題，重送同樣的內容不會成功，只會浪費資源。自訂重試條件時，不要把這些狀態碼加進去。

429（太多請求）是例外：它代表對方要你慢一點。對方回應的 `Retry-After` 標頭說明要等多久，標準管線的重試會遵守它。

### 3. 對非冪等的請求自動重試

「建立付款」在逾時後重試，可能付款其實已經成功，只是回應沒收到，重試就扣了第二次款。這類請求要嘛不自動重試，要嘛帶上冪等鍵，讓下游能辨認重複的請求，見 [HTTP 契約](/frameworks/aspnet-core/http-contracts/)。

```csharp
builder.Services.AddHttpClient<PaymentClient>()
    .AddStandardResilienceHandler(options =>
    {
        // 只重試 GET；POST 由業務層以冪等鍵處理
        options.Retry.DisableForUnsafeHttpMethods();
    });
```

## 使用邊界

- **重試只能處理暫時性錯誤。** 下游長時間故障時，重試只會延長等待；斷路器和降級（例如回傳快取的舊資料）才是解法。
- 多層服務都各自重試，次數會相乘：A 重試 3 次、B 也重試 3 次，最底層可能收到 9 倍以上的請求。原則上只在最靠近使用者的一層重試。
- **Hedging（對沖請求）** 會同時送出多個請求、取最快的回應，能降低延遲尾端，但會增加下游負載，只適合冪等的讀取操作。
- 訊息處理的重試與死信是另一套機制，見 [重試與冪等](/infrastructure/rabbitmq/retries-idempotency/)。
