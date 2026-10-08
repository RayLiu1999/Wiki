---
title: "設定、Secret 與工作負載權限"
description: "區分應用設定、敏感值、Kubernetes API 權限、網路政策與雲端身分。"
articleId: "kubernetes-configuration-security"
topic: "kubernetes"
category: "k8s-configuration"
order: 3
tags: ["設定、Secret 與工作負載權限", "kubernetes"]
difficulty: "intermediate"
learningDepth: "basic"
prerequisites: ["kubernetes-workloads"]
relatedArticles: ["aspnet-core-options", "gke-workload-identity"]
applicableVersions: "以 Kubernetes 現行核心 API 與 Docker 容器模型說明；GKE 限制另見平台文章。"
verifiedWith: "已核對 Kubernetes／Docker 官方概念；叢集操作與環境驗證狀態見獨立實作指南。"
lastReviewed: "2026-10-08"
takeaway: "區分應用設定、敏感值、Kubernetes API 權限、網路政策與雲端身分。"
noteDates: []
sources: [{"title": "Secrets", "url": "https://kubernetes.io/docs/concepts/configuration/secret/"}, {"title": "RBAC", "url": "https://kubernetes.io/docs/reference/access-authn-authz/rbac/"}, {"title": "Network policies", "url": "https://kubernetes.io/docs/concepts/services-networking/network-policies/"}]
---

同一個商品 API 映像可以放進開發與正式環境，但端點、逾時、快取 TTL 和登入方式不同。這些執行設定應該在部署時提供；程序讀到設定後能否使用目標服務，則還涉及身分、授權和網路。

## ConfigMap 與 Secret

ConfigMap 用於非敏感設定；Secret 用於敏感資料的傳遞與權限管理。Secret 的 base64 表示法不是加密，保存時的加密保護要確認叢集設定與供應商機制。具備讀取 Secret 或建立可掛載它的 Pod 等能力，可能間接取得敏感資料。

| 使用方式 | 更新特性 |
| --- | --- |
| 環境變數 | 已啟動程序通常要重啟才取得新值 |
| Volume 掛載 | 更新傳播與讀取方式需核對；subPath 不會自動接收更新 |
| 外部 Secret 系統 | 需要取得身分、同步或掛載機制及輪替策略 |

設定檔變更不保證程式會重建 ConnectionMultiplexer、資料庫池或 HttpClient handler。把「設定已更新」「程序已讀取」「資源已重建」分成三項驗證。

## 四種不同的權限

Kubernetes ServiceAccount 是 Pod 使用的平台身分。Role／ClusterRole 與綁定資源控制它能操作哪些 Kubernetes API；RBAC 權限為加總式，沒有一般 deny 規則。

Google Cloud IAM 控制 Cloud SQL、Secret Manager 等雲端 API 的存取。應用程式的 Authentication／Authorization 則決定哪位買家能查看訂單。這些權限互不代替；最小權限要對照實際需要操作的目標資源。

NetworkPolicy 控制適用的 Pod 流量。它需要網路實作支援並執行政策，建立資源本身不足以證明網路已受限制。限制流量前要保留 DNS 與所需下游路徑。

## 在電商系統中配置

API 與通知 Worker 可使用不同 ServiceAccount。API 需要提交訂單；Worker 需要讀取待辦工作與完成通知。設定、雲端權限和資料庫帳號可以各自拆分，避免用一個共用高權限帳號涵蓋所有用途。

部署時確認是哪個 Namespace、ServiceAccount 和 Secret reference，輪替後則核對實際連線。敏感值不要寫進 Git、映像或錯誤日誌；相應操作入口見 [設定與探針章節](/projects/ecommerce/configuration/)。
