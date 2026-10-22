---
title: "13 設定、探針與資源"
description: "讓設定更新、可接流量、程序重啟和安全停止各有證據。"
group: "ecommerce"
order: 13
linkedArticles: ["aspnet-core-options", "kubernetes-configuration-security", "kubernetes-probes-resources", "dotnet-gc-memory", "dotnet-background-services"]
prerequisites: ["ecommerce/kubernetes"]
sources: [{"title": "Probes", "url": "https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/"}, {"title": "Resource management", "url": "https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/"}]
---

商品 API 新副本剛啟動，還不能接流量；Redis 故障時卻可能仍可回資料庫。平台需要知道什麼時候等待、移除端點或重啟，應用也需要正確取得端點與權限。

## 設定由誰讀取

一般設定放 ConfigMap，敏感值以 Secret 或外部機密系統提供。環境變數更新通常要重啟程序；檔案更新也要應用重新讀取或重建相應資源。OptionsMonitor 看到新值，不表示已建立的連線池自動切換。

## 探針按照業務能力設計

startup 等初始化，readiness 決定是否接流量，liveness 判斷是否需要重啟。允許 Redis 故障回源的查詢，不必把 Redis 故障直接視為 API 完全不可用。外部資料庫故障時，重啟所有 Pod 也不會修好資料庫。

獨立小型 API 的探針只驗證程序能回應，不包含下游相依；加入實際服務時，重新定義檢查範圍和失敗門檻。

## 資源與更新

requests 影響排程與容量，limits 影響 CPU 節流和記憶體終止。範例的數值用於本機學習，正式環境依實際量測調整，GKE Autopilot 也可能有最低值或調整政策。

rolling update 期間額外副本會增加連線與記憶體需求。停止時核對 Host timeout、工作取消與平台寬限；PDB 用於其適用的自願中斷，不能保證所有故障可用。

## 驗證目標

設定改變後能確認哪個程序已使用新值；新副本就緒前不接流量；更新不中斷已提交訂單；Worker 未完成工作可重送。現有 Console OrderWorker 還需要補上並驗證 SIGTERM 與多程序工作領取協定，才能符合這份部署目標。
