---
title: "PV、PVC 與有狀態服務"
description: "理解儲存宣告、存取模式、資料生命週期，以及高可用和備份的差別。"
articleId: "kubernetes-storage"
topic: "kubernetes"
category: "k8s-reliability"
order: 5
tags: ["PV、PVC 與有狀態服務", "kubernetes"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["kubernetes-workloads"]
relatedArticles: ["gke-data-services", "engineering-recovery-cost"]
applicableVersions: "以 Kubernetes 現行核心 API 與 Docker 容器模型說明；GKE 限制另見平台文章。"
verifiedWith: "已核對 Kubernetes／Docker 官方概念；叢集操作與環境驗證狀態見獨立實作指南。"
lastReviewed: "2026-10-08"
takeaway: "理解儲存宣告、存取模式、資料生命週期，以及高可用和備份的差別。"
noteDates: []
sources: [{"title": "Persistent volumes", "url": "https://kubernetes.io/docs/concepts/storage/persistent-volumes/"}, {"title": "StatefulSet", "url": "https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/"}, {"title": "RabbitMQ operators", "url": "https://www.rabbitmq.com/kubernetes/operator/operator-overview"}]
---

API 可以重建，訂單資料卻必須持續保存。Kubernetes 將運算生命週期與儲存需求分開，但替資料庫宣告 PVC，並不等於已經完成資料一致性、備份或故障切換設計。

## 儲存物件如何合作

PersistentVolume 是叢集內的儲存資源；PersistentVolumeClaim 表達工作負載的容量與存取需求。StorageClass 定義供應方式和特性，CSI 驅動連接實際儲存系統。PVC 可能觸發動態建立儲存，也可能綁定既有 PV。

<figure class="concept-flow">
<figcaption>儲存資源的引用關係</figcaption>
<ol><li>Pod</li><li>PVC 需求</li><li>PV 資源</li><li>實際儲存</li></ol>
</figure>

StorageClass 與 CSI 負責供應及連接實際儲存；上圖箭頭表示引用關係。

## 存取模式不是資料庫鎖

`ReadWriteOnce` 通常表示一個 Node 可讀寫，並不一定限制為單一 Pod；`ReadWriteOncePod` 在支援的 CSI 條件下限制單一 Pod。`ReadWriteMany` 表示可由多個 Node 掛載，仍不能把不支援共用檔案存取的資料庫直接開成多寫入者。

StatefulSet 提供穩定身分與儲存關聯，但資料庫複製、選主、仲裁、schema 升級和備份仍由資料服務或 Operator 處理。RabbitMQ 的 Cluster Operator 管理 Broker lifecycle；Queue／Exchange 等拓樸管理則是另一組責任。

## 釐清三種恢復

| 機制 | 解決什麼 | 仍需核對 |
| --- | --- | --- |
| 持久化磁碟 | 容器重建後保留資料 | 磁碟故障、區域限制與刪除政策 |
| 複製與高可用 | 某些節點故障時持續服務 | 仲裁、故障窗口與一致性 |
| 備份與還原 | 誤刪、損壞或災難後找回資料 | 可還原性、RPO／RTO 與相關資料 |

PV reclaim policy 決定釋放後的處理方式；刪除 Namespace、PVC 或雲端資源前要確認實際後果。備份還應核對交易一致性，不能只相信有一個 snapshot 名稱。

## 電商第一階段的選擇

學習主線先以 GKE 承載 API／Worker，PostgreSQL、Redis 與 RabbitMQ 作為明確的外部伺服器端點。自行管理有狀態叢集放在深入路線，等到能夠說明儲存、升級、監控和還原責任，再決定是否導入。

本機實驗只驗證單節點容器重啟的有限恢復，沒有驗證跨區、Broker 叢集或磁碟遺失。[GKE 資料整合](/platforms/gke/data-services/)會補上正式環境要做的核對。
