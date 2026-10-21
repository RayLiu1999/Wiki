---
title: "從 DNS 到商品 API：網路請求路徑"
description: "用一筆商品查詢分清 DNS、TCP、TLS、HTTP、負載平衡與應用認證。"
articleId: "networking-request-path"
topic: "containers-networking"
category: "networking"
order: 1
tags:
  - "從 DNS 到商品 API：網路請求路徑"
  - "networking"
difficulty: "advanced"
prerequisites: []
relatedArticles:
  - "kubernetes-services-gateway"
  - "gke-gateway-networking"
applicableVersions: "以 Kubernetes 現行核心 API 與 Docker 容器模型說明；.NET 10。"
lastReviewed: "2026-10-10"
takeaway: "用一筆商品查詢分清 DNS、TCP、TLS、HTTP、負載平衡與應用認證。"
sources:
  - title: "HTTP overview"
    url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview"
  - title: "TLS"
    url: "https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Transport_Layer_Security"
  - title: "GKE Gateway API"
    url: "https://docs.cloud.google.com/kubernetes-engine/docs/concepts/gateway-api"
---

## 案發現場

在電商平台的日常運作中，前後端團隊經常陷入一場經典的「502 羅生門與延遲甩鍋大戰」：

前端工程師拿著監控報表抗議：「使用者在手機 App 點擊商品詳情，請求耗時高達 2.8 秒，甚至偶發回傳 `502 Bad Gateway`！後端 API 效能太差了！」。
後端工程師立刻調出 ASP.NET Core 的應用程式日誌反駁：「我們的 Kestrel 伺服器記錄顯示，該請求的處理時間只有 **4 毫秒**，資料庫查詢 2 毫秒，後端毫無效能問題，肯定是前端網路有問題！」。

雙方各自看著自己的監控，都是對的，但也都是錯的。
問題的核心在於：**缺乏「端到端全鏈路網路請求路徑（Request Path）」的全局視野**。

在一個使用者的點擊請求真正抵達後端 Kestrel 之前，它必須跨越漫長的實體與虛擬網路層次：
1. **Client 端 DNS 遞迴解析**（遭遇運營商 Local DNS 污染或延遲 300ms）。
2. **網際網路 TCP 三向交握** + **TLS 1.3 握手加密**（跨洲際網路往返耗時 400ms）。
3. **雲端邊緣負載平衡器（Cloud Load Balancer / CDN）**。
4. **Kubernetes Ingress / Gateway API** 進行 L7 路由。
5. **K8s 叢集內部 CNI 虛擬網路**（透過 eBPF 或 iptables 進行 Service ClusterIP 到 Pod IP 的 DNAT 轉發）。
6. 最後才抵達 **Kestrel 伺服器**。

更可怕的事故發生在安全層面：後端工程師嘗試讀取客戶端真實 IP 進行限流防刷，直接讀取 `HttpContext.Connection.RemoteIpAddress`，結果發現**全站所有使用者的 IP 全部都是 `10.128.0.5`**（雲端負載平衡器的內部 IP）！限流規則直接把負載平衡器封鎖，導致全站瞬間癱瘓。

---

## 反模式與正確解法

### 1. 網路請求全鏈路旅程拆解

一筆 `GET https://api.shop.com/products/101` 的完整通訊旅程：

```text
[ 1. 手機 App ] 
       │ 1. DNS Lookup 取得 LB Anycast IP
       │ 2. TCP SYN / ACK + TLS 1.3 握手 (TLS Session Ticket / 0-RTT)
       ▼
[ 2. 雲端負載平衡器 (GCP External HTTP(S) LB / AWS ALB) ]
       │ 3. TLS 卸載 (SSL Offloading)
       │ 4. 注入 X-Forwarded-For: <Client_IP>, X-Forwarded-Proto: https
       ▼
[ 3. Kubernetes Gateway API / Ingress Controller ]
       │ 5. L7 路由規則匹配 (Host, Path)
       ▼
[ 4. 叢集網路 CNI (Cilium / Kube-Proxy) ]
       │ 6. Service ClusterIP 轉發至特定 Pod IP (DNAT)
       ▼
[ 5. Kestrel Web 伺服器 (.NET 10) ]
       │ 7. ForwardedHeadersMiddleware 解析真實客戶端 IP
       ▼
[ 6. 業務 Endpoint / Controller (4ms 執行完成) ]
```

---

### 反模式一：直接讀取 RemoteIpAddress 忽視反向代理轉發頭

在反向代理（Reverse Proxy / Load Balancer）後方，若未配置轉發頭中介軟體，`RemoteIpAddress` 永遠是前一級代理的內部 IP。若貿然根據該 IP 實作速率限制（Rate Limiting），單一惡意使用者會導致整個負載平衡器被封鎖，殃及所有無辜用戶。

### 正確解法一：安全配置 ForwardedHeadersOptions 識別真實客戶端

在 ASP.NET Core 中，必須在管線最前端啟用 `ForwardedHeadersMiddleware`，並嚴格限制信任的代理來源網路（`KnownNetworks` / `KnownProxies`），防止攻擊者自行偽造 `X-Forwarded-For` 標頭：

```csharp
// Program.cs: 生產級反向代理請求頭安全配置
var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;

    // 關鍵安全防護：清除預設的本機限制，明確指定信任的雲端負載平衡器 CIDR 網段
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();

    // 例如信任 GCP 內部負載平衡器或 K8s Ingress 所在的私有網段
    options.KnownNetworks.Add(new System.Net.IPNetwork(System.Net.IPAddress.Parse("10.0.0.0"), 8));
});

var app = builder.Build();

// 關鍵：必須在所有其他中介軟體（如驗證、限流）之前調用！
app.UseForwardedHeaders();

app.MapGet("/api/client-ip", (HttpContext context) =>
{
    // 此時取得的 RemoteIpAddress 即為真實終端使用者的公網 IP！
    var realClientIp = context.Connection.RemoteIpAddress?.ToString();
    return Results.Ok(new { ClientIp = realClientIp });
});
```

---

### 反模式二：負載平衡器與後端伺服器的 Keep-Alive 逾時時間差引發 502

這是雲端微服務中最隱蔽、最令人抓狂的 **502 Bad Gateway** 來源：
- 雲端負載平衡器（如 AWS ALB 或 GCP LB）通常會與後端 Kestrel 保持 HTTP Keep-Alive 長連線池。
- **踩坑點**：若 Kestrel 的連線空閒逾時（`KeepAliveTimeout`）設為 60 秒，而負載平衡器的空閒逾時也設為 60 秒（甚至更長）。當連線在第 60 秒時，Kestrel 決定發送 TCP FIN 關閉連線；恰好在同一微秒，負載平衡器剛好把一個使用者的請求丟進這條連線。請求迎面撞上 Kestrel 的連線關閉，負載平衡器立即向使用者回傳 `502 Bad Gateway`！

### 正確解法二：保持 Kestrel KeepAliveTimeout 顯著大於負載平衡器

**鐵律**：**後端伺服器的空閒逾時時間，必須永遠大於前端負載平衡器的空閒逾時時間！**
（例如：負載平衡器設 60 秒，Kestrel 必須配置為 65~75 秒）：

```csharp
// Program.cs: 配置 Kestrel Keep-Alive 超時高於負載平衡器
builder.WebHost.ConfigureKestrel(serverOptions =>
{
    serverOptions.Limits.KeepAliveTimeout = TimeSpan.FromSeconds(75); // 遠大於 LB 的 60 秒
    serverOptions.Limits.RequestHeadersTimeout = TimeSpan.FromSeconds(15);
});
```

---

## 踩坑與避坑指南

### 1. HTTP/2 與 HTTP/3 (QUIC) 升級帶來的首屏加速
- 傳統 HTTP/1.1 受限於瀏覽器單一域名最多 6 條 TCP 連線，容易產生隊頭阻塞（Head-of-Line Blocking）。
- 在雲端負載平衡器（Edge）務必開啟 **HTTP/2 與 HTTP/3**，透過多工傳輸（Multiplexing）消除 TCP 握手延遲，首屏 TTFB（Time To First Byte）通常能減少 300ms 以上。

### 2. MTU 與封包分段（Packet Fragmentation）
- 容器虛擬網路（如 Overlay VXLAN / Geneve）會在原始封包外層再包裝一層 UDP 標頭（通常佔用 50 bytes）。
- **踩坑點**：若容器網卡的 MTU 設為 1500（實體網卡上限），封包加上 Overlay 標頭後會突破 1500 bytes，導致底層強制分段或靜默丟包，引發偶發的極高網路延遲。
- **規則**：CNI 虛擬網卡的 MTU 必須配置為 1450 或更小，為外層封裝預留空間。

---

## 線上排查指令

### 1. 使用 curl -w 深度拆解各網路階段耗時

排查外部請求延遲到底卡在哪個階段的最強大工具：
```bash
curl -w "\
DNS 解析耗時:       %{time_namelookup}s\n\
TCP 連線耗時:       %{time_connect}s\n\
TLS 握手耗時:       %{time_appconnect}s\n\
開始傳輸 (TTFB):   %{time_starttransfer}s\n\
總耗時:             %{time_total}s\n" \
-o /dev/null -s "https://api.shop.com/api/products/101"
```
**診斷指標分析：**
- 若 `time_namelookup` 大於 0.1s：DNS 解析太慢。
- 若 `time_appconnect - time_connect` 大於 0.2s：TLS 握手過慢。
- 若 `time_starttransfer - time_appconnect` 過大：才是後端伺服器或資料庫真正慢！

### 2. 檢測 Kestrel 收到的真實請求頭

```bash
# 在測試環境列印所有傳入 HTTP Header
curl -I -H "X-Forwarded-For: 203.0.113.195" https://api.shop.com/api/client-ip
```

### 3. Prometheus / Grafana 監控指標

```text
# 負載平衡器 502 Bad Gateway 發生率
rate(nginx_ingress_controller_requests{status="502"}[1m]) > 0

# 端到端 p99 網路延遲（由 Ingress 觀測）
histogram_quantile(0.99, sum(rate(nginx_ingress_controller_request_duration_seconds_bucket[5m])) by (le))
```
