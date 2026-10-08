---
title: "Kubernetes 的期望狀態與工作負載"
description: "理解控制器、Pod、Deployment、Job、Namespace 與程序副本。"
articleId: "kubernetes-workloads"
topic: "kubernetes"
category: "k8s-workloads"
order: 1
tags: ["Kubernetes 的期望狀態與工作負載", "kubernetes"]
difficulty: "intermediate"
learningDepth: "basic"
prerequisites: ["containers-image-runtime"]
relatedArticles: ["kubernetes-probes-resources", "kubernetes-autoscaling"]
applicableVersions: "以 Kubernetes 現行核心 API 與 Docker 容器模型說明；GKE 限制另見平台文章。"
verifiedWith: "已核對 Kubernetes／Docker 官方概念；叢集操作與環境驗證狀態見獨立實作指南。"
lastReviewed: "2026-10-08"
takeaway: "理解控制器、Pod、Deployment、Job、Namespace 與程序副本。"
noteDates: []
sources: [{"title": "Kubernetes overview", "url": "https://kubernetes.io/docs/concepts/overview/"}, {"title": "Deployment", "url": "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/"}, {"title": "Pods", "url": "https://kubernetes.io/docs/concepts/workloads/pods/"}]
---

把商品 API 容器放上 Kubernetes，重點不是背 YAML 欄位，而是理解「我宣告想要兩個副本，平台如何持續維持它」。API Server 保存期望狀態，控制器比較實際狀態並調整，排程器決定 Pod 使用哪個 Node，Node 上的元件啟動容器。

## Pod 是部署單位

Pod 包含一個或多個共享網路與部分生命週期的容器。常見商品 API 一個 Pod 一個主程序；需要 Cloud SQL Auth Proxy 時，也可能以 sidecar 共同部署。Pod 可以重建，新的 Pod 不必擁有相同 IP。

| 資源 | 適合的責任 |
| --- | --- |
| Deployment | 持續運作的無狀態 API 或已設計並行安全的 Worker |
| Job | 可完成的一次性工作，例如相容的 migration |
| CronJob | 依排程建立 Job，仍需處理重複與逾時 |
| StatefulSet | 需要穩定身分或儲存關聯的工作負載 |
| Namespace | 資源命名與政策範圍，不是完整的隔離保證 |

## Deployment 如何更新

Deployment 管理 ReplicaSet，ReplicaSet 維持 Pod 數量。映像變更會建立新版本，rolling update 逐步增加新副本、減少舊副本。`maxSurge` 決定可額外建立的數量，`maxUnavailable` 限制更新期間允許不可用的數量；探針會影響新副本何時被視為就緒。

看到 Pod `Running` 只能說明容器程序啟動，不代表可以安全接單。還要確認 readiness、Service 端點、外部健康檢查及實際請求。

## 副本數與業務正確性

兩個 API Pod 的記憶體互不共享。程序內 `lock` 和 Singleton 無法一起保護庫存；購物車和冪等資料也不能僅存在某個 Pod 的字典。共用狀態必須由資料庫、Redis 或其他有明確契約的服務管理。

目前快取與訊息實驗的 Worker 同時執行 Outbox 發布與消費，而且未提供跨程序 claim／lease。直接增加此 Worker 副本，不是已驗證的可靠擴縮策略。應先處理工作領取與競爭，再部署多副本。

## 從最小範例開始

[本機 Kubernetes 指南](/practice/ecommerce/kubernetes/)使用獨立商品查詢 API 觀察兩個 Pod、Service 和 port-forward。它讓你驗證期望狀態與路由，後續再逐步接資料、訊息和雲端入口。
