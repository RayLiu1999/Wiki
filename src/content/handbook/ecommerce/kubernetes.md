---
title: "12 在本機 Kubernetes 執行商品 API"
description: "用兩個 Pod、Service 與 port-forward 理解期望狀態和流量。"
group: "ecommerce"
order: 12
linkedArticles: ["kubernetes-workloads", "kubernetes-services-gateway", "kubernetes-probes-resources"]
prerequisites: ["ecommerce/containers"]
sources: [{"title": "kind quick start", "url": "https://kind.sigs.k8s.io/docs/user/quick-start/"}, {"title": "Deployments", "url": "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/"}]
---

容器可以穩定啟動後，再把商品 API 放到本機 Kubernetes。目標是理解平台如何維持兩個副本，Pod 重建後 Service 如何繼續找到可用程序。

## 先宣告最小資源

建立專用 Namespace，Deployment 指定商品 API 映像、兩個副本、labels、port 與探針；Service 依相同 labels 選擇 Pod，將服務 port 80 指向容器 8080。

| 觀察 | 能說明什麼 |
| --- | --- |
| Deployment replicas／ready | 期望與可用副本是否一致 |
| Pod 狀態與 events | 排程、拉取映像、啟動和探針問題 |
| Service／EndpointSlice | selector 與可用後端是否匹配 |
| port-forward 與 HTTP 回應 | 本機可否透過所選服務查詢 |

## 副本不共享記憶體

固定回應的小型 API 適合觀察部署。完整系統若保存購物車、冪等資料或工作領取狀態，必須使用共用資料邊界。每個 Pod 的 Singleton 或 lock 都只屬於自己的程序。

本機叢集（例如 kind）的網路、磁碟和本機硬體不代表 GKE 的負載平衡或故障域；學完共同模型後，再進雲端整合。

## 重建和更新

在專用學習叢集中刪除一個 Pod，Deployment 會建立替代。確認新 Pod 取得就緒，再查商品回應。映像更新時觀察 rolling update；舊版本也要能和當時的資料格式合作。

port-forward 選到的 Pod 若被移除，轉送可能中斷，需重新啟動。連續回應來自同一程序，也不能推論 Service 沒有其他端點。
