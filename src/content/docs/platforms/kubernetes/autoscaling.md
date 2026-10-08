---
title: "HPA、佇列容量與多副本限制"
description: "分清 Pod 擴縮、Node 容量、訊息並行與資料庫連線壓力。"
articleId: "kubernetes-autoscaling"
topic: "kubernetes"
category: "k8s-reliability"
order: 6
tags: ["HPA、佇列容量與多副本限制", "kubernetes"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["kubernetes-probes-resources", "architecture-outbox-inbox"]
relatedArticles: ["data-access-pools-locks", "rabbitmq-retries-idempotency", "data-access-pool-capacity", "data-access-load-validation"]
applicableVersions: "以 Kubernetes 現行核心 API 與 Docker 容器模型說明；GKE 限制另見平台文章。"
verifiedWith: "已核對 Kubernetes／Docker 官方概念；叢集操作與環境驗證狀態見獨立實作指南。"
lastReviewed: "2026-10-09"
takeaway: "分清 Pod 擴縮、Node 容量、訊息並行與資料庫連線壓力。"
noteDates: []
sources: [{"title": "HPA", "url": "https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/"}, {"title": "KEDA concepts", "url": "https://keda.sh/docs/latest/concepts/"}, {"title": "GKE cluster autoscaler", "url": "https://docs.cloud.google.com/kubernetes-engine/docs/concepts/cluster-autoscaler"}]
---

促銷時，增加商品 API 副本可能增加讀取容量；增加通知 Worker 副本卻也可能重複領取 Outbox 或耗盡資料庫連線。擴縮的目標是讓業務結果在負載變化下維持品質，副本數只是其中一個手段。

## HPA 需要哪些訊號

HorizontalPodAutoscaler 根據指標調整工作負載副本。以 CPU utilization 為目標時，需要容器宣告相應 CPU requests，並由資源指標服務提供資料。自訂或外部指標需要相應的指標管道和 adapter，不能只寫一個 Queue 名稱就自動讀取 RabbitMQ。

佇列工作常需要觀察待處理數量、最老訊息年齡、處理時間和成功率。KEDA 可以提供事件驅動整合，但仍需安裝、設定認證並核對支援能力。更多 Consumer 也可能受 Broker、資料庫或外部通知服務限制。

## Pod 與 Node 是不同的容量

HPA 增加 Pod，不代表已有足夠 Node 容量；requests、taints、區域和政策可能讓 Pod Pending。Node 自動擴縮負責基礎容量，兩者時間尺度不同。GKE 模式與 ComputeClass 會影響平台如何管理運算資源。

| 負載瓶頸 | 先檢查 | 增加 Pod 的可能結果 |
| --- | --- | --- |
| CPU 密集 | CPU、延遲與 throttling | 分散工作，也增加基礎消耗 |
| 資料庫等待 | 池等待、交易與資料庫容量 | 可能擴大連線壓力 |
| 外部服務節流 | 下游限額、重試量 | 可能增加被拒絕請求 |
| Queue 堆積 | 工作成本、年齡和 consumer 成功率 | 需有可安全並行的處理契約 |

## 擴 Worker 前的條件

Outbox 發布器需要跨程序的工作領取協定，例如交易內 claim、鎖或帶有租期的 ownership，並處理程序死亡後恢復。Consumer 仍需穩定事件 ID、Inbox 去重與業務結果的唯一約束。不同機制各自處理領取和重送，不能互相代替。

目前實驗未提供多發布器 claim／lease，因此將其 Worker replicas 調成兩個之前，要先完成該設計與競爭驗證。單程序 SemaphoreSlim 也不能協調多 Pod。

## 池與觀察窗口

最大可能連線數，要包含每個 API／Worker 的各個池、rolling update 額外副本、migration 與管理工具。HPA 上限需符合這個總預算。用不同流量階段觀察增加與縮減，確認縮容時正在處理的工作如何收尾，再決定穩定窗口與最大副本數。

## 把資料庫預算接到最大副本數

參考[池容量](/data-access/pool-capacity/)列出程序與每池上限，包括更新時新舊 Pod 和工具；再用[容量驗證](/data-access/load-validation/)核對借池等待、SQL、鎖與故障回源。HPA 能增加應用執行者，資料庫同時處理能力需另外證明。
