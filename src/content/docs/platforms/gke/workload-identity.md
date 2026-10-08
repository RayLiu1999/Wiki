---
title: "GKE 工作負載身分與 IAM"
description: "分清買家登入、Kubernetes RBAC、Pod 雲端授權與 CI 身分聯邦。"
articleId: "gke-workload-identity"
topic: "gke"
category: "gke-platform"
order: 2
tags: ["GKE 工作負載身分與 IAM", "gke"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["kubernetes-configuration-security"]
relatedArticles: ["aspnet-core-authentication", "engineering-ci-cd"]
applicableVersions: "依 2026-10-08 的 Google Cloud／Kubernetes 官方文件核對；可用功能、地區與費率以實際平台為準。"
verifiedWith: "已核對官方概念與責任範圍；未建立 GCP 資源、執行正式部署或量測雲端成本。"
lastReviewed: "2026-10-08"
takeaway: "分清買家登入、Kubernetes RBAC、Pod 雲端授權與 CI 身分聯邦。"
noteDates: []
sources: [{"title": "WIF for GKE", "url": "https://docs.cloud.google.com/kubernetes-engine/docs/concepts/workload-identity"}, {"title": "Configure workload access", "url": "https://docs.cloud.google.com/kubernetes-engine/docs/how-to/workload-identity"}, {"title": "CI deployment federation", "url": "https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines"}]
---

通知 Worker 要讀取 Secret Manager 的密碼時，應以明確的工作負載身分取得權限。把長期服務帳號 key 放進映像，會讓憑證跟著建置和部署流轉；Workload Identity Federation for GKE 提供另一種授權方式。

## 啟用機制與授予權限是兩步

GKE 工作負載使用 Kubernetes ServiceAccount，透過身分聯邦取得可供 Google Cloud API 使用的身分。啟用機制只建立取得身分的途徑，並不自動給 Pod 讀取所有雲端資源的權限。

IAM 政策可以直接授權受支援的 Kubernetes principal，或在所需條件下透過 IAM service account impersonation。選擇方式時要核對目標 API 支援、權限範圍與身分識別條件。

## 四種身分不要混用

| 身分與權限 | 回答的問題 |
| --- | --- |
| 買家登入與應用授權 | 這位使用者能查看哪筆訂單？ |
| Kubernetes ServiceAccount／RBAC | 這個 Pod 能操作哪些 Kubernetes API？ |
| Google Cloud IAM／GKE 身分聯邦 | 這個工作負載能呼叫哪些 Google Cloud API？ |
| CI 的外部 OIDC 身分聯邦 | 哪個來源的 pipeline 可以建置或部署？ |

節點拉取 Artifact Registry 映像的權限，也需要依平台拉取機制配置，不能只靠 Pod 呼叫雲端 API 的身分來解釋。資料庫登入同樣另有帳號或 IAM database authentication 設定。

## API 與 Worker 如何拆分

商品 API 和通知 Worker 採用不同 ServiceAccount，分別授權所需資源。若 Worker 只要讀取一個通知服務機密，就對該機密授予所需角色，而不是為整個 Project 配置廣泛管理權限。

Namespace 和 ServiceAccount 名稱會影響 principal 識別。同一 Project 內多叢集共用名稱時，需要核對身分範圍與條件，避免把預期的環境界線只寄託在命名習慣。

## 驗證授權鏈

核對 Pod 使用的 ServiceAccount、聯邦配置、IAM policy 與目標資源，再用實際 API 呼叫確認授權。能取得 token 不代表能讀取機密；403 與 DNS／連線失敗也屬於不同問題。完成權限縮減後，驗證需要的操作成功，其他操作依政策受限制。
