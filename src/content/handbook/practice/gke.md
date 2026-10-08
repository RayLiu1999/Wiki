---
title: "部署到既有 GKE 學習環境"
description: "確認雲端前提，建置可拉取映像，再驗證 Pod、HTTP 和選用 Gateway。"
group: "practice"
order: 6
environment: "gke"
verification: "已核對官方配置概念；未建立 GCP 資源或執行 GKE 端到端部署。"
linkedArticles: ["gke-platform-modes", "gke-workload-identity", "gke-gateway-networking", "gke-data-services", "engineering-ci-cd"]
prerequisites: ["practice/kubernetes"]
sources: [{"title": "Connect to GKE", "url": "https://docs.cloud.google.com/kubernetes-engine/docs/how-to/cluster-access-for-kubectl"}, {"title": "Artifact Registry push", "url": "https://docs.cloud.google.com/artifact-registry/docs/docker/pushing-and-pulling"}, {"title": "Deploy Gateways", "url": "https://docs.cloud.google.com/kubernetes-engine/docs/how-to/deploying-gateways"}, {"title": "Gateway health policies", "url": "https://docs.cloud.google.com/kubernetes-engine/docs/how-to/configure-gateway-resources"}]
---

本篇將同一個固定商品 API 放到既有 GKE 學習叢集。它沒有整合訂單、資料庫或訊息；先驗證映像、程序和入口，再依[外部資料整合](/platforms/gke/data-services/)設計完整後端。

## 必要前提

你需要自己的 GCP Project 與計費關聯、已啟用的 GKE／Artifact Registry 服務、既有叢集和 Docker repository。還需可操作這些資源的權限、gcloud、GKE kubectl 認證 plugin、kubectl 與能建置 linux/amd64 映像的 Docker buildx。

叢集可先採 Autopilot，依[官方叢集建立文件](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/creating-an-autopilot-cluster)完成區域與網路配置；本篇從已有資源開始，不執行建立叢集。學習環境的雲端資源與外部入口會按實際使用計費。

## 填入自己的資源資訊

以下是 shell 變數模板，先替換所有占位值。region 對應學習叢集 location，repository 也需在你指定的區域已存在：

~~~sh
LEARNING_PROJECT='你的-project-id'
LEARNING_REGION='你的-region'
LEARNING_CLUSTER='你的-cluster-name'
LEARNING_REPOSITORY='你的-docker-repository'
LEARNING_IMAGE="${LEARNING_REGION}-docker.pkg.dev/${LEARNING_PROJECT}/${LEARNING_REPOSITORY}/product-api:learning"
LEARNING_CONTEXT="gke_${LEARNING_PROJECT}_${LEARNING_REGION}_${LEARNING_CLUSTER}"
~~~

明確核對目標 Project 與帳號，連接叢集並列出 context。gcloud 取得憑證後，確認輸出中的 context 名稱與變數一致；如果平台給出不同名稱，以實際學習叢集為準。

~~~sh
gcloud auth list
gcloud container clusters get-credentials "$LEARNING_CLUSTER" --region "$LEARNING_REGION" --project "$LEARNING_PROJECT"
kubectl config get-contexts
kubectl --context "$LEARNING_CONTEXT" get nodes
~~~

## 建置和推送映像

在 Wiki 根目錄執行，指定 linux/amd64，避免把本機 ARM 映像誤用於不同架構的節點。Registry 寫入與節點拉取權限都需要各自確認。

~~~sh
gcloud auth configure-docker "${LEARNING_REGION}-docker.pkg.dev"
docker buildx build --platform linux/amd64 --file examples/deployment/Dockerfile --tag "$LEARNING_IMAGE" --push examples/deployment
~~~

本練習使用 learning tag 方便觀察；可追溯交付應記錄並部署實際 digest，參照[CI/CD](/engineering/ci-cd/)。

## 渲染學習宣告並驗證

替換本地映像名稱，寫入臨時 manifest，再應用到明確 context：

~~~sh
LEARNING_MANIFEST="$(mktemp)"
sed "s|devwiki-product-api:local|${LEARNING_IMAGE}|g" examples/deployment/kubernetes.yaml > "$LEARNING_MANIFEST"
kubectl --context "$LEARNING_CONTEXT" apply -f "$LEARNING_MANIFEST"
kubectl --context "$LEARNING_CONTEXT" -n devwiki-learning rollout status deployment/product-api --timeout=300s
kubectl --context "$LEARNING_CONTEXT" -n devwiki-learning get pods
kubectl --context "$LEARNING_CONTEXT" -n devwiki-learning port-forward service/product-api 5081:80
~~~

Autopilot 可能根據政策調整 requests，觀察實際 Pod 配置與 events。另一個終端機 curl `http://127.0.0.1:5081/products/1`，確認商品 200 回應。成功說明 API 部署與轉送可用，還不是公開 HTTPS 入口。

## 選用的 GKE HTTP 入口

需要已啟用 Gateway API、支援`gke-l7-global-external-managed`的叢集與對應網路／雲端權限。先查 GatewayClass，再應用教學入口；這個步驟會建立雲端負載平衡相關資源。

~~~sh
kubectl --context "$LEARNING_CONTEXT" get gatewayclasses
kubectl --context "$LEARNING_CONTEXT" apply -f examples/deployment/gateway.yaml
kubectl --context "$LEARNING_CONTEXT" -n devwiki-learning get gateway product-gateway
kubectl --context "$LEARNING_CONTEXT" -n devwiki-learning describe httproute product-route
kubectl --context "$LEARNING_CONTEXT" -n devwiki-learning describe healthcheckpolicy product-health
~~~

宣告包括 Gateway、HTTPRoute 與 HealthCheckPolicy。雲端健康檢查直接探測 Pod 的 8080 埠和 `/health/ready`；這個埠對應容器監聽位置，Service 的對外埠則為 80。等待入口地址與狀態收斂，再以實際地址查詢 `http://入口-IP/products/1`。出現 503 時核對 NEG 後端與雲端健康檢查，不只看 Pod readiness。

這是無使用者資料的 HTTP 教學入口。網域、DNS、HTTPS 憑證與正式流量政策需依[GKE Gateway 文章](/platforms/gke/gateway-networking/)另行配置，範例沒有預設虛構網域或憑證。

## 未來接業務服務的檢查

| 要加入的能力 | 先驗證什麼 |
| --- | --- |
| Cloud SQL | 網路、工作負載 IAM、資料庫登入與總池預算 |
| Redis | 認證、端點、故障回源和容量 |
| RabbitMQ | TLS／vhost、Confirm／Ack、穩定事件 ID |
| 多副本 Worker | claim／lease、停止訊號與重送結果 |

## 清理本次學習資源

停止 port-forward。如有啟用入口，先刪除該入口資源，並確認控制器清理對應負載平衡，再刪除學習 Namespace 中的 API：

~~~sh
kubectl --context "$LEARNING_CONTEXT" delete -f examples/deployment/gateway.yaml --ignore-not-found
kubectl --context "$LEARNING_CONTEXT" delete namespace devwiki-learning
rm "$LEARNING_MANIFEST"
~~~

這些命令不刪除既有叢集、Registry 或其他資料服務。按自己的資源清單決定保留與清理，並檢查實際雲端資源和計費記錄。本站沒有執行這些雲端操作或宣稱完成 GKE 驗證。
