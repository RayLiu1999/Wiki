---
title: "Service、Gateway 與流量路由"
description: "從不固定的 Pod IP 走到穩定服務入口，分清 Service 與 HTTP 路由。"
articleId: "kubernetes-services-gateway"
topic: "kubernetes"
category: "k8s-workloads"
order: 2
tags: ["Service、Gateway 與流量路由", "kubernetes"]
difficulty: "intermediate"
learningDepth: "basic"
prerequisites: ["kubernetes-workloads", "networking-request-path"]
relatedArticles: []
applicableVersions: "以 Kubernetes 現行核心 API 與 Docker 容器模型說明；GKE 限制另見平台文章。"
verifiedWith: "已核對 Kubernetes／Docker 官方概念；叢集操作與環境驗證狀態見獨立實作指南。"
lastReviewed: "2026-10-08"
takeaway: "從不固定的 Pod IP 走到穩定服務入口，分清 Service 與 HTTP 路由。"
noteDates: []
sources: [{"title": "Services", "url": "https://kubernetes.io/docs/concepts/services-networking/service/"}, {"title": "Ingress", "url": "https://kubernetes.io/docs/concepts/services-networking/ingress/"}, {"title": "Gateway API", "url": "https://gateway-api.sigs.k8s.io/concepts/api-overview/"}]
---

商品 API 的 Pod 會隨更新和故障改變。呼叫端需要穩定的服務名稱，而不應把某個 Pod IP 寫死在連線設定。Service 提供服務發現與端點選擇，Gateway API 則描述進入叢集時的路由責任。

## Service 如何找到 Pod

Service 的 selector 匹配 Pod labels，平台以 EndpointSlice 管理符合條件的端點。Service 的 `port` 是呼叫端使用的 port，`targetPort` 是後端容器監聽位置。selector 不匹配或 readiness 未通過，都可能讓服務沒有可用端點。

| 類型 | 常見用途 |
| --- | --- |
| ClusterIP | 叢集內穩定服務入口 |
| NodePort | 在 Node port 暴露服務的機制 |
| LoadBalancer | 請平台整合外部負載平衡，能力依供應商而定 |
| Headless Service | 讓呼叫端發現個別端點，常見於特定有狀態協定 |

Service 不會替 API 補上登入，也不會讓程序記憶體自動共享。把 Worker 設成 Deployment，也不表示它需要 Service。

## Gateway API 的責任分工

GatewayClass 描述控制器實作；Gateway 描述 listener 與入口；HTTPRoute 描述 HTTP host/path 匹配和 backendRef。平台管理者可以負責入口，應用團隊管理自己的路由，但實際跨 Namespace 授權和支援功能要依 API 與控制器核對。

Kubernetes 的 Ingress API 仍可使用，其功能已凍結；新路線可先理解 Gateway API。Ingress 或 Gateway 資源需要相應控制器，建立 YAML 不會憑空產生處理流量的程序或雲端負載平衡器。

## 電商流量如何拆分

買家查詢 `/products` 和建立 `/orders` 可以先進同一個模組化 API，不必一開始就拆微服務。需要獨立部署時，再讓 HTTPRoute 選擇不同服務。TLS 憑證、入口健康檢查、API readiness 與應用授權，各有自己的設定。

GKE 的實作使用 Google Cloud 負載平衡器與 NEG；Service 仍用於宣告後端，但資料流可能直接到 Pod。這和典型 Service 虛擬 IP 的叢集內路徑不同，詳見 [GKE Gateway](/platforms/gke/gateway-networking/)。

## 連不上時檢查什麼

從 selector、Pod labels、容器監聽 port、ready endpoints 開始。接著檢查 Gateway／Route 的狀態條件、憑證和雲端後端健康。Route 顯示接受，並不等於每一個後端都健康。
