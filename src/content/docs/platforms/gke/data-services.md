---
title: "GKE 與 PostgreSQL、Redis、RabbitMQ 整合"
description: "逐層核對外部端點、IAM、服務登入、連線池與恢復責任。"
articleId: "gke-data-services"
topic: "gke"
category: "gke-integration"
order: 4
tags: ["GKE 與 PostgreSQL、Redis、RabbitMQ 整合", "gke"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["gke-workload-identity", "data-access-pools-locks"]
relatedArticles: ["redis-reliability", "rabbitmq-acknowledgements", "kubernetes-storage"]
applicableVersions: "依 2026-10-08 的 Google Cloud／Kubernetes 官方文件核對；可用功能、地區與費率以實際平台為準。"
verifiedWith: "已核對官方概念與責任範圍；未建立 GCP 資源、執行正式部署或量測雲端成本。"
lastReviewed: "2026-10-08"
takeaway: "逐層核對外部端點、IAM、服務登入、連線池與恢復責任。"
noteDates: []
sources: [{"title": "Cloud SQL from GKE", "url": "https://docs.cloud.google.com/sql/docs/postgres/connect-kubernetes-engine"}, {"title": "Cloud SQL Auth Proxy", "url": "https://docs.cloud.google.com/sql/docs/postgres/sql-proxy"}, {"title": "RabbitMQ operators", "url": "https://www.rabbitmq.com/kubernetes/operator/operator-overview"}]
---

把 API 搬上 GKE 後，本機 `127.0.0.1:15432` 不再是原本主機上的 PostgreSQL。資料整合需要重新確認端點與路徑，還要保留交易、快取和訊息原有的契約。

## 外部服務的核對順序

| 層次 | 要回答的問題 |
| --- | --- |
| 網路 | Pod 能解析並連到哪個私有或公開端點？ |
| 雲端授權 | 工作負載能使用哪些 Google Cloud 資源？ |
| 服務認證 | 用哪個資料庫、Redis 或 RabbitMQ 帳號登入？ |
| 應用契約 | 逾時、重連、版本與資料一致性如何處理？ |
| 維運 | 誰負責升級、容量、備份、還原與故障切換？ |

IAM 不會代替 RabbitMQ vhost 權限或一般 PostgreSQL 密碼驗證。服務採用何種 IAM 整合，需要個別確認。

## Cloud SQL 與池

Cloud SQL Auth Proxy 可以作為 sidecar 提供連線授權與安全通道；它本身不是資料庫 connection pool。應用仍需要管理 Npgsql 或 ORM 使用的池、逾時和交易。使用 private IP 時，Proxy 也需要實際可達的網路路徑。

總連線預算包含所有 API 與 Worker 副本、每程序各個池、rolling update 額外副本，以及 migration／管理工具。只看單一 Pod 的最大池大小，會低估促銷或更新時的資料庫壓力。

## Redis 和訊息的責任

商品快取可在允許的情況下回資料庫，但故障回源會改變資料庫負載。若 Redis 保存不能隨意遺失的購物車或冪等資料，必須另外定義持久化、恢復與資料期限，不能沿用可丟棄快取的假設。

RabbitMQ 需要核對 TLS、vhost、Publisher Confirm、Consumer Ack、耐久拓樸與處理去重。受管理服務、自行部署 Cluster Operator 和外部 Broker，在升級、容量與故障處理上的責任不同；都要有可驗證的交付與恢復契約。

## 第一階段如何實施

先用一組明確端點承載商品查詢與訂單通知，驗證正常連線、相依服務停止與恢復。接著演練憑證輪替、連線上限、Worker 停止與重送，再評估多副本或跨區能力。

目前本機實驗使用單節點 PostgreSQL／Redis／RabbitMQ，未驗證上述雲端整合。遷移時還需要把 Outbox 工作領取和 SIGTERM 收尾納入測試，不能只替換連線字串就宣稱完成正式部署。
