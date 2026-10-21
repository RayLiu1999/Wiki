---
title: "14 進入 GKE 與外部資料服務"
description: "把本機模型接到 GCP 身分、Registry、網路、Gateway 與資料端點。"
group: "ecommerce"
order: 14
linkedArticles: ["gke-platform-modes", "gke-workload-identity", "gke-gateway-networking", "gke-data-services", "cloud-service-mapping", "eks-platform-modes", "eks-pod-identity", "eks-load-balancing", "eks-data-services"]
prerequisites: ["ecommerce/configuration"]
sources: [{"title": "GKE modes", "url": "https://docs.cloud.google.com/kubernetes-engine/docs/concepts/choose-cluster-mode"}, {"title": "Cloud SQL with GKE", "url": "https://docs.cloud.google.com/sql/docs/postgres/connect-kubernetes-engine"}]
---

本機 Kubernetes 已理解後，下一步是把程序放到 GKE。共同的 Deployment、Service 和探針仍然存在，雲端則增加 Project、IAM、區域、映像存取、VPC 與外部入口。

## 第一階段的配置

以 Autopilot 學習無狀態 API，資料庫、Redis 和 RabbitMQ 先使用明確的外部伺服器端點。GKE 管理平台，應用團隊負責業務正確性、資源需求、配置與交付。需要更多節點控制時，再深入 Standard 或支援的 ComputeClass 組合。

## 身分與連線

Pod 用專用 ServiceAccount，藉由 Workload Identity Federation for GKE 與 IAM 取得所需雲端權限；啟用機制本身不會自動授予權限。資料庫、Redis 和 Broker 仍有各自的服務認證和網路前提。

Cloud SQL Auth Proxy 可以提供授權與安全連線，不會代替應用的 connection pool。副本、更新額外容量與管理工作必須納入總連接預算。

## 入口與健康

初次部署先用 port-forward 驗證 API，確認映像與程序正常。正式入口再配置 Gateway／HTTPRoute、DNS、TLS 與健康檢查。GKE 的負載平衡器可透過 NEG 轉送到 Pod；Controller 負責配置，不是所有請求經過的代理。

readiness 與雲端負載平衡健康是兩層檢查。如果 API 使用`/health/ready`，要核對 HealthCheckPolicy 與平台支援設置。

## 在 EKS 上的差異

主線以 GKE 為例；在 AWS 上，叢集換成 EKS、Pod 身分換成 Pod Identity、入口換成 AWS Load Balancer Controller 建立的 ALB、資料服務換成 RDS（搭配 RDS Proxy）、ElastiCache 與 Amazon MQ。兩邊的對應與名稱相近但行為不同的地方，見 [GCP 與 AWS 服務對照](/platforms/eks/cloud-service-mapping/)；各元件的細節見 [EKS 主題](/platforms/eks/)。

## 可檢驗的結果

記錄 Project、region、cluster、context 與映像 digest；驗證 Pod 就緒、商品回應、入口路由、權限與相依服務停止時的行為。
