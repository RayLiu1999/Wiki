---
title: "GCP 基礎與 GKE 模式選擇"
description: "從 Project、IAM、VPC 和 Registry 走到 Autopilot、Standard 與管理責任。"
articleId: "gke-platform-modes"
topic: "gke"
category: "gke-platform"
order: 1
tags: ["GCP 基礎與 GKE 模式選擇", "gke"]
difficulty: "intermediate"
learningDepth: "basic"
prerequisites: ["kubernetes-workloads"]
relatedArticles: []
applicableVersions: "依 2026-10-08 的 Google Cloud／Kubernetes 官方文件核對；可用功能、地區與費率以實際平台為準。"
verifiedWith: "已核對官方概念與責任範圍；未建立 GCP 資源、執行正式部署或量測雲端成本。"
lastReviewed: "2026-10-08"
takeaway: "從 Project、IAM、VPC 和 Registry 走到 Autopilot、Standard 與管理責任。"
noteDates: []
sources: [{"title": "GKE modes", "url": "https://docs.cloud.google.com/kubernetes-engine/docs/concepts/choose-cluster-mode"}, {"title": "Autopilot workloads in Standard", "url": "https://docs.cloud.google.com/kubernetes-engine/docs/concepts/about-autopilot-mode-standard-clusters"}, {"title": "Release channels", "url": "https://docs.cloud.google.com/kubernetes-engine/docs/concepts/release-channels"}]
---

Kubernetes 定義工作負載與控制模型，GKE 則在 Google Cloud 提供託管的 Kubernetes 平台。學習 GKE 前，要能說明資源放在哪個 Project、哪個區域、使用哪個網路，以及誰具備建立和使用資源的權限。

## 一個環境包含哪些資源

Project 是服務啟用、資源與 IAM 政策的重要範圍；Billing account 提供計費關聯。Region／zone 影響位置、可用性與延遲，VPC／subnet 影響網路和 IP 配置。Artifact Registry 保存應用映像，GKE 執行 Pod；資料庫、機密、日誌與負載平衡器另有生命週期和費用。

不能把「刪除 Deployment」當作「已清掉整個電商環境」。叢集、IP、負載平衡器、磁碟、Registry 和資料服務，需按資源清單確認。

## 模式如何選擇

| 模式 | 管理範圍 | 學習用途 |
| --- | --- | --- |
| Autopilot cluster | Google 管理 Node 基礎設施與多項預設政策 | 先聚焦應用、資源需求、設定與交付 |
| Standard cluster | 使用者有較多 Node pool 與基礎配置控制 | 深入節點容量、排程、特定硬體和政策 |
| Standard 的 Autopilot workload | 在支援條件下由 ComputeClass 指定受管理運算 | 在同一叢集搭配不同管理方式 |

Autopilot 並不是免去資源設定、應用安全或成本管理。需要核對工作負載限制、可用 ComputeClass 與資源 requests。Standard 也不表示所有基礎能力都必須手動實作；兩者都是 GKE，但管理責任的範圍不同。

## 電商第一階段

先以 Autopilot 承載無狀態 API，再加入具備停止與並行契約的 Worker。PostgreSQL、Redis 和 RabbitMQ 先使用明確的外部端點，讓學習焦點放在映像、權限、網路、健康與部署。自行管理 Broker 或資料庫叢集放入深入路線。

版本用 release channel 與維護政策管理，並核對平台支援時間。更新前要測試 API 行為、相依元件與 Kubernetes API 的相容性；不應把某次教學截圖的版本當成永久標準。

## 進入實作前的條件

[GKE 實作指南](/practice/ecommerce/gke/)列出 Project、權限、Registry、叢集和端點前提，再把已驗證的小型 API 部署到既有學習叢集。本站提供概念與指令模板，實際雲端環境要填入自己的資源資訊，並核對當下的可用功能。
