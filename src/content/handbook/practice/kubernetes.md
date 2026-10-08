---
title: "在 kind 觀察 Deployment 與 Service"
description: "載入本機映像、部署兩個商品 API 副本，觀察就緒、端點和重建。"
group: "practice"
order: 5
environment: "kind"
verification: "提供本機叢集宣告與操作指南；本次未建立 kind 叢集，實際結果需按本篇觀察。"
linkedArticles: ["kubernetes-workloads", "kubernetes-services-gateway", "kubernetes-probes-resources"]
prerequisites: ["practice/containers"]
sources: [{"title": "kind quick start", "url": "https://kind.sigs.k8s.io/docs/user/quick-start/"}, {"title": "kubectl port-forward", "url": "https://kubernetes.io/docs/tasks/access-application-cluster/port-forward-access-application-cluster/"}]
---

本篇延續獨立商品 API，使用 kind 建立專用本機 Kubernetes。需要 Docker、kubectl 與 kind；本站提供資源宣告與跟做步驟，未宣稱已在讀者環境建立叢集。

## 安裝前提與建立叢集

先依 kind 官方 Quick Start 安裝適用作業系統與架構的 kind，並安裝 kubectl。完成前一篇的映像建置，確認`devwiki-product-api:local`存在。下列命令都從 Wiki 根目錄執行：

~~~sh
kind version
kubectl version --client
kind create cluster --name devwiki-learning
kind load docker-image devwiki-product-api:local --name devwiki-learning
kubectl --context kind-devwiki-learning get nodes
~~~

如果同名叢集已存在，確認是自己的練習叢集後，直接載入映像與繼續。後續命令顯式指定`kind-devwiki-learning` context，防止誤操作另一環境。

## 部署期望狀態

~~~sh
kubectl --context kind-devwiki-learning apply -f examples/deployment/kubernetes.yaml
kubectl --context kind-devwiki-learning -n devwiki-learning rollout status deployment/product-api --timeout=120s
kubectl --context kind-devwiki-learning -n devwiki-learning get pods
kubectl --context kind-devwiki-learning -n devwiki-learning get service product-api
kubectl --context kind-devwiki-learning -n devwiki-learning get endpointslices -l kubernetes.io/service-name=product-api
~~~

宣告包含 Namespace、兩副本 Deployment 和 Service。成功時，Deployment 可用副本為 2，兩個 Pod 就緒，Service 有對應端點。Running 只說明程序啟動，仍要看 readiness 與實際請求。

## 從主機查商品

在終端機 A 轉送服務：

~~~sh
kubectl --context kind-devwiki-learning -n devwiki-learning port-forward service/product-api 5081:80
~~~

在終端機 B 查詢：

~~~sh
curl http://127.0.0.1:5081/products/1
curl -i http://127.0.0.1:5081/health/ready
~~~

看到保溫杯、價格 120 與 servedBy，說明選到的後端能夠回應。port-forward 選取後端 Pod，連續回應同一個 servedBy 不是負載平衡測試；所選 Pod 消失時可能需要重新啟動轉送。

## 重建與診斷

從`get pods`複製一個實際 Pod 名稱，替換下方占位文字，僅刪除該學習 Pod：

~~~sh
kubectl --context kind-devwiki-learning -n devwiki-learning delete pod 你的-pod-名稱
kubectl --context kind-devwiki-learning -n devwiki-learning get pods --watch
~~~

Deployment 建立替代副本，觀察新 Pod 就緒後以 Ctrl+C 結束 watch。啟動失敗時，先讀取 events、Pod 描述與日誌：

~~~sh
kubectl --context kind-devwiki-learning -n devwiki-learning get events --sort-by=.metadata.creationTimestamp
kubectl --context kind-devwiki-learning -n devwiki-learning describe deployment product-api
kubectl --context kind-devwiki-learning -n devwiki-learning logs deployment/product-api
~~~

ImagePullBackOff 檢查映像是否已載入和名稱是否匹配；Service 沒有端點檢查 labels、selector 與探針。OOM 或 CPU 壓力則核對資源與程序證據。

## 收尾

停止 port-forward。保留叢集可繼續修改宣告；結束練習時，確認只刪除自己的 kind 叢集：

~~~sh
kind delete cluster --name devwiki-learning
~~~

這個練習不包含 Gateway、資料持久化、Outbox 多程序領取或 GKE 雲端負載平衡。它驗證的學習目標是 Kubernetes 期望狀態與基本服務發現。
