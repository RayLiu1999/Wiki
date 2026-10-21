---
title: "16 CI/CD、映像與資料變更"
description: "建立可追溯的交付流程，讓新舊程序與 schema 安全共存。"
group: "ecommerce"
order: 16
linkedArticles: ["engineering-ci-cd", "engineering-iac", "data-access-migrations", "dotnet-sdk-packages", "data-access-bulk-retention"]
prerequisites: ["ecommerce/scaling"]
sources: [{"title": "EF production migrations", "url": "https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying"}, {"title": "Deployment pipeline federation", "url": "https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines"}]
---

一版訂單 API 新增欄位，更新期間舊 Pod 與新 Pod 同時運作，Worker 也可能較晚升級。交付計畫需要兼顧程序、事件與 schema 相容，不能只替換映像 tag。

## 一個候選版本

從 commit 與固定工具版本開始，通過相應靜態、業務與整合檢查，再建置映像並記錄 digest。同一候選產物晉級到不同環境，執行設定和權限由環境提供。

CI 使用有明確來源條件的 OIDC 身分聯邦，分別取得建置、Registry 和部署權限。環境審查應能看到實際映像與渲染後的資源變化。

## 資料與事件相容

先 expand 增加相容結構，部署能容忍新舊資料的程序，完成資料轉換，再 contract 移除舊結構。Migration 作為受控一次性任務，避免每個 API 副本爭相執行。

事件契約新增欄位要說明預設與未知欄位處理；破壞性變更採用明確版本或遷移策略。已排隊的舊事件仍可能在新 Consumer 啟動後到達。

## 回復的條件

程序 rollback 只改變部署產物，不自動回滾已寫入資料。記錄舊映像是否仍兼容新 schema、哪些情況需要向前修復，以及無法回退時如何維持服務。

rollout 完成後檢查商品查詢、合法訂單提交、背景結果、錯誤率與延遲。部署前與部署後各自有完成條件。

## 資料庫延伸

上億列上的回填、索引與結構更新另見[大量寫入與保留](/data-access/bulk-retention/)；online DDL 仍需檢查鎖、磁碟與失敗處理。
