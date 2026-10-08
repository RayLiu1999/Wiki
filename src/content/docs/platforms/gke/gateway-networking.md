---
title: "GKE Gateway、TLS 與負載平衡"
description: "理解控制器、HTTPRoute、NEG、健康檢查與真實的流量路徑。"
articleId: "gke-gateway-networking"
topic: "gke"
category: "gke-integration"
order: 3
tags: ["GKE Gateway、TLS 與負載平衡", "gke"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["kubernetes-services-gateway", "gke-platform-modes"]
relatedArticles: ["networking-request-path", "kubernetes-probes-resources"]
applicableVersions: "依 2026-10-08 的 Google Cloud／Kubernetes 官方文件核對；可用功能、地區與費率以實際平台為準。"
verifiedWith: "已核對官方概念與責任範圍；未建立 GCP 資源、執行正式部署或量測雲端成本。"
lastReviewed: "2026-10-08"
takeaway: "理解控制器、HTTPRoute、NEG、健康檢查與真實的流量路徑。"
noteDates: []
sources: [{"title": "GKE Gateway API", "url": "https://docs.cloud.google.com/kubernetes-engine/docs/concepts/gateway-api"}, {"title": "Deploying Gateways", "url": "https://docs.cloud.google.com/kubernetes-engine/docs/how-to/deploying-gateways"}, {"title": "Gateway policies", "url": "https://docs.cloud.google.com/kubernetes-engine/docs/how-to/configure-gateway-resources"}]
---

在本機使用 port-forward 查到商品，不代表網際網路上的買家已經有可用入口。GKE Gateway 會將 Kubernetes 宣告轉換成 Google Cloud 負載平衡資源，還需要網域、憑證、路由和健康後端。

## 控制面與資料流

Gateway 控制器觀察 Gateway、HTTPRoute 與 Service，設定雲端負載平衡器。控制器本身不是每個請求必經的代理程序。GKE 以 NEG 描述可用 Pod 端點，負載平衡器可以直接轉送到這些後端。

<figure class="concept-flow">
<figcaption>GKE Gateway 的主要資料流</figcaption>
<ol><li>瀏覽器</li><li>Google Cloud 負載平衡器</li><li>NEG 中的 Pod 端點</li></ol>
</figure>

Gateway 控制器依 Gateway、HTTPRoute 與 Service 宣告設定負載平衡器，這是控制面；上圖則是實際請求的資料流。

Service 在這裡提供後端選擇和 port 等宣告資訊，不應因此斷言流量必定再經過 ClusterIP 代理。

## 路由與憑證

GatewayClass 的選擇會影響區域／全域、內部／外部等能力及前提。HTTPRoute 的 host/path 決定請求落到哪個 backendRef；TLS listener 要有該實作支援的憑證引用和管理方式。

網域 DNS 指向入口、憑證涵蓋網域、Route 掛接 listener、後端服務可用，是分開的驗證。只看到 Gateway 的 IP，不足以證明 HTTPS 商品頁可以正常使用。

## 兩層健康訊號

Pod readiness 決定是否可作為伺服器端點；Google Cloud 負載平衡器的健康檢查也必須通過。GKE Gateway 不會自動從 readiness 推導所有健康檢查設定。如果 API 的 `GET /` 沒有回應 200，或希望使用其他檢查方式，需要核對並設定 `HealthCheckPolicy`。

例如小型商品 API 使用 `/health/ready`，就要讓雲端健康檢查使用相應 path、port 與支援配置。`no healthy upstream` 可能表示這一層設定不匹配，不一定是 API 沒有啟動。

## 上線與診斷證據

先確認 Pod、Service 端點，再核對 Gateway／HTTPRoute status conditions 和後端健康。最後以真實網域測試 TLS、商品回應與錯誤行為，並觀察 API 日誌。設定更新和雲端資源收斂存在時間差，要看狀態與實際請求，而不是只看 apply 成功。
