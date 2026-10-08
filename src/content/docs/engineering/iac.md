---
title: "IaC、Kustomize 與 Helm 的責任"
description: "區分雲端資源建立、Kubernetes 宣告、環境差異和狀態管理。"
articleId: "engineering-iac"
topic: "engineering"
category: "delivery"
order: 5
tags: ["IaC、Kustomize 與 Helm 的責任", "engineering"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["kubernetes-workloads", "engineering-ci-cd"]
relatedArticles: ["kubernetes-configuration-security", "engineering-recovery-cost"]
applicableVersions: "依 2026-10-08 的 Google Cloud／Kubernetes 官方文件核對；可用功能、地區與費率以實際平台為準。"
verifiedWith: "已核對官方概念與責任範圍；未建立 GCP 資源、執行正式部署或量測雲端成本。"
lastReviewed: "2026-10-08"
takeaway: "區分雲端資源建立、Kubernetes 宣告、環境差異和狀態管理。"
noteDates: []
sources: [{"title": "Terraform state", "url": "https://developer.hashicorp.com/terraform/language/state"}, {"title": "Kustomize", "url": "https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/"}, {"title": "Helm charts", "url": "https://helm.sh/docs/topics/charts/"}]
---

電商測試環境和正式環境需要相同的部署模型，但 Project、區域、端點、容量和權限不同。Infrastructure as Code 讓這些配置進入版本控制和 review，仍需要明確的工具責任與狀態所有權。

## 不同工具管理什麼

| 工具／方式 | 常見責任 | 需要理解的界線 |
| --- | --- | --- |
| Terraform | Project 周邊、VPC、GKE、Registry、IAM 等雲端資源 | state、provider、plan 與相依關係 |
| Kubernetes manifest | Deployment、Service、ConfigMap 等期望狀態 | 控制器收斂及實際平台行為 |
| Kustomize | base 與 overlay 的設定差異 | patch 結果及每個環境的產物 |
| Helm | 封裝與參數化應用資源 | chart／values、升級與 release 狀態 |

選擇工具時先找管理對象。Kustomize 和 Helm 可以幫助處理 Kubernetes 配置，不能因此代替所有雲端資源的生命週期管理。也應避免多套工具同時修改同一個欄位或資源而沒有所有權規則。

## 狀態與預覽

Terraform state 記錄資源對應，可能包含敏感內容，因此後端需要存取控制、加密和鎖定機制。plan 提供變更預覽；apply 仍會受到權限、配額和外部狀態影響。

手動修改造成 drift 時，先判斷哪些變更應回寫定義，哪些要恢復。不要僅把重新 apply 視為永遠安全，尤其是替換資料庫、磁碟或網路資源。

## 電商環境如何切分

共用 base 定義商品 API 的 port、探針和服務；overlay 提供映像 digest、ServiceAccount、非敏感端點與資源需求。機密值由相應的機密系統提供，Git 可以保存引用或政策，而不是實際密碼。

有狀態資源和可丟棄的學習叢集應有不同的刪除與還原策略。拆開環境 state／權限，使實驗更新不會同時操作正式訂單資料。

## Review 要看產物

核對 Terraform plan 與最終渲染的 Kubernetes YAML：目標 Project、Namespace、映像、權限、容量和資源刪除。部署後觀察收斂與業務結果，再把實際資源資訊記錄為環境資產。工具的 dry-run 只檢查其能看到的條件，不能證明外部服務已可用。
