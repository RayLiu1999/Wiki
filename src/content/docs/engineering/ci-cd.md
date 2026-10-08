---
title: "從 commit 到部署：CI/CD 與映像追溯"
description: "把驗證、映像、環境、migration 和部署後結果連成可追查的交付流程。"
articleId: "engineering-ci-cd"
topic: "engineering"
category: "delivery"
order: 4
tags: ["從 commit 到部署：CI/CD 與映像追溯", "engineering"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["containers-image-runtime", "data-access-migrations"]
relatedArticles: ["engineering-iac", "engineering-slo-alerts"]
applicableVersions: "依 2026-10-08 的 Google Cloud／Kubernetes 官方文件核對；可用功能、地區與費率以實際平台為準。"
verifiedWith: "已核對官方概念與責任範圍；未建立 GCP 資源、執行正式部署或量測雲端成本。"
lastReviewed: "2026-10-08"
takeaway: "把驗證、映像、環境、migration 和部署後結果連成可追查的交付流程。"
noteDates: []
sources: [{"title": "OIDC deployment pipelines", "url": "https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines"}, {"title": "Deployments", "url": "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/"}, {"title": "EF production migrations", "url": "https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying"}]
---

一次電商更新可能同時改 API、資料格式和資料庫 schema。CI/CD 的目的，是讓每個環境執行哪份程式、通過哪些檢查、如何更新與回復，都有可追查的證據。

## 交付產物怎麼流動

<figure class="concept-flow">
<figcaption>一份候選版本的交付流程</figcaption>
<ol><li>commit</li><li>驗證</li><li>建置映像</li><li>Registry／digest</li><li>環境部署</li><li>健康與業務驗證</li></ol>
</figure>

相同候選映像應從測試環境晉級到正式環境，避免正式部署時重新建置成不同內容。以 digest 追溯實際映像；tag 方便命名，但可以被重新指向，不能單靠名稱辨識產物。

## 驗證要對應變更

型別或純規則可以用快速檢查和單元測試；資料庫交易、訊息重送與快取失效需要相應的整合環境。部署後驗證還包含健康端點、商品查詢和安全的業務 smoke test。不能因為編譯成功就推論訂單與 Outbox 已正確提交。

CI 記錄來源 commit、SDK／套件 lock、映像 digest、測試結果和目標環境。敏感值與權限不進入日誌或產物。外部 pipeline 使用 OIDC 身分聯邦時，限制來源 repo、branch／environment 等條件，並分開建置和部署權限。

## Migration 與 rolling update

新舊 API 會在更新期間並存。先以 expand 建立相容的新欄位或結構，部署相容程式，完成資料轉換與觀察，再於合適版本 contract 移除舊結構。Migration 可用受控的一次性 Job，需防止每個 API Pod 同時執行。

程序 rollback 不會自動撤銷資料變更。部署計畫要記錄哪些舊映像仍能使用新 schema、如何處理已寫入的新格式，以及需要向前修復的條件。

## CD 的完成條件

部署命令成功後，確認 rollout、流量、錯誤率、延遲與待處理事件。出現異常時依事先定義的條件停止推進、回復相容映像或向前修復。本站目前既有 CI 驗證的是 Wiki 與本機範例；本篇描述電商 GKE 交付設計，沒有宣稱已存在正式部署 pipeline。
