---
title: "還原演練、RPO／RTO 與成本"
description: "把可用性、資料恢復、資源清理和費用控制放進同一份營運計畫。"
articleId: "engineering-recovery-cost"
topic: "engineering"
category: "operations"
order: 7
tags: ["還原演練、RPO／RTO 與成本", "engineering"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["engineering-slo-alerts", "kubernetes-storage"]
relatedArticles: ["architecture-outbox-inbox", "engineering-iac"]
applicableVersions: "依 2026-10-08 的 Google Cloud／Kubernetes 官方文件核對；可用功能、地區與費率以實際平台為準。"
verifiedWith: "已核對官方概念與責任範圍；未建立 GCP 資源、執行正式部署或量測雲端成本。"
lastReviewed: "2026-10-08"
takeaway: "把可用性、資料恢復、資源清理和費用控制放進同一份營運計畫。"
noteDates: []
sources: [{"title": "Disaster recovery planning", "url": "https://docs.cloud.google.com/architecture/dr-scenarios-planning-guide"}, {"title": "Cloud Billing budgets", "url": "https://docs.cloud.google.com/billing/docs/how-to/budgets"}, {"title": "GKE backup concepts", "url": "https://docs.cloud.google.com/kubernetes-engine/docs/add-on/backup-for-gke/concepts/backup-for-gke"}]
---

訂單系統的備份成功訊息，只能證明某個備份工作完成；真正的問題是，在需要時能否找回正確資料，並在可接受時間內恢復服務。雲端費用同樣需要實際資源清單和計費證據，不能只看 Pod 數量。

## 定義恢復目標

RPO 表示可接受的資料遺失時間範圍；RTO 表示可接受的恢復時間。目標需要從業務需求、備份頻率、資料服務能力和操作成本協商，並以演練核對。

| 層次 | 要恢復的內容 |
| --- | --- |
| 程式 | 已知映像 digest、部署設定與路由 |
| 身分 | ServiceAccount、IAM、機密與輪替資訊 |
| 業務資料 | 訂單、商品、Outbox、Inbox 和已完成結果 |
| 訊息 | 未處理工作、死信與重新投遞紀錄 |
| 觀測 | 能確認恢復是否達標的指標與日誌 |

## 資料和事件一起還原

資料庫還原可能讓已完成通知的 Inbox 記錄回到較早時間，而 Broker 或外部郵件服務仍保留較新結果。只恢復單一元件會產生重複或遺漏。需要穩定事件 ID、業務唯一鍵與外部結果查詢或對帳機制，並記錄各系統的恢復時間點。

快取若可重新建立，可以清除後回源，但要控制冷啟動流量。若 Redis 保存不能任意丟棄的狀態，就必須納入資料恢復計畫。多副本、複製或 Quorum 不能代替誤刪與資料損壞時的備份。

## 演練要得到哪些證據

在隔離環境還原，記錄開始、完成時間、使用的備份與映像。驗證訂單數量和狀態、Outbox 待辦、Inbox 與通知結果，並測試實際 API 和 Worker。確認恢復後可以繼續操作，才算得到可使用的 runbook。

本機實驗的容器重啟恢復，只覆蓋部分持久化契約，不等於災難恢復或實測 RPO／RTO。

## 成本如何管理

成本包括叢集和運算、負載平衡器、資料庫、磁碟、Registry、網路流量和觀測資料。使用 labels／環境範圍分析帳單，為高成長資源設定容量、保留期限與清理政策。

Google Cloud 的 alerts-only budget 提供通知，並不自動限制支出。平台也提供適用服務範圍內的 spend cap budget；要核對支援範圍、觸發機制與服務暫停影響，不能把所有預算一概當成硬上限。

結束學習環境時，按資源清單確認叢集、Gateway 相關負載平衡、IP、磁碟與其他服務。完成清理後再檢查實際資源與後續計費記錄，而不是只看部署檔案被刪除。
