---
title: "從 DNS 到商品 API：網路請求路徑"
description: "用一筆商品查詢分清 DNS、TCP、TLS、HTTP、負載平衡與應用認證。"
articleId: "networking-request-path"
topic: "networking"
category: "network-foundations"
order: 1
tags: ["從 DNS 到商品 API：網路請求路徑", "networking"]
difficulty: "intermediate"
learningDepth: "basic"
prerequisites: []
relatedArticles: ["kubernetes-services-gateway", "gke-gateway-networking"]
applicableVersions: "以 Kubernetes 現行核心 API 與 Docker 容器模型說明；GKE 限制另見平台文章。"
verifiedWith: "已核對 Kubernetes／Docker 官方概念；叢集操作與環境驗證狀態見獨立實作指南。"
lastReviewed: "2026-10-08"
takeaway: "用一筆商品查詢分清 DNS、TCP、TLS、HTTP、負載平衡與應用認證。"
noteDates: []
sources: [{"title": "HTTP overview", "url": "https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview"}, {"title": "TLS", "url": "https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Transport_Layer_Security"}, {"title": "GKE Gateway API", "url": "https://docs.cloud.google.com/kubernetes-engine/docs/concepts/gateway-api"}]
---

買家開啟商品頁時，瀏覽器看到的是網址；API 看到的是 HTTP 請求。中間經過名稱解析、連線、加密與路由。把這些步驟拆開，就能更準確解釋「連不上」「憑證錯誤」「404」和「403」各在什麼位置發生。

## 一筆請求經過什麼

<figure class="concept-flow">
<figcaption>商品查詢的主要連線階段</figcaption>
<ol><li>DNS 名稱解析</li><li>建立連線與 TLS</li><li>HTTP 負載平衡器</li><li>商品 API</li><li>Redis／資料庫</li></ol>
</figure>

DNS 將名稱解析為位址；port 區分同一個位址上的服務；TCP 提供可靠的位元組傳輸。HTTPS 在其上使用 TLS，核對憑證與保護傳輸。HTTP 方法、路徑、標頭和狀態碼，才是應用介面的契約。HTTP/3 使用 QUIC／UDP，因此診斷時也要核對實際使用的協定。

TLS 可以在外部負載平衡器終止，再以另一段連線轉送後端。瀏覽器到入口與入口到 Pod 的協定、憑證和健康檢查，需各自核對。

## L4 與 L7 的差別

L4 負載平衡主要依連線資訊轉送；L7 可以理解 HTTP host、path 等資料。例如同一個電商網域，`/products` 指向商品 API，`/orders` 指向訂單 API。路由到正確程序之後，ASP.NET Core 還會做自身的 endpoint matching 與權限檢查。

404 可能來自入口沒有匹配路由，也可能來自 API 找不到商品。403 可能來自應用授權，也可能由入口政策產生。保留請求 ID、HTTP 回應和各層日誌，才能確定責任位置。

## 內部服務也有網路前提

Pod 要連到資料庫，必須具備可達路由、DNS、防火牆允許、服務登入和必要的雲端權限。IAM 授權不會自動建立 VPC 路由；網路連通也不會自動授予資料庫帳號權限。

在 Kubernetes，Service DNS 是內部發現方式；在 GKE，外部 Gateway 背後的 Google Cloud 負載平衡器可能透過 NEG 直接使用 Pod 端點。不能把所有平台都畫成「必定經過 Service 代理」的相同路徑。

## 診斷順序

先確認名稱解析和連線端點，再檢查 TLS 與入口路由，最後核對 API endpoint、使用者權限和下游回應。商品 API 回應慢時，也要拆開 Redis／資料庫等待與程序處理時間，避免只根據瀏覽器總耗時歸因。
