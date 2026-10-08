---
title: "Compose 與本機服務邊界"
description: "分清主機程序、容器網路、port 映射、volume 和服務就緒。"
articleId: "containers-compose"
topic: "containers"
category: "container-environments"
order: 2
tags: ["Compose 與本機服務邊界", "containers"]
difficulty: "intermediate"
learningDepth: "basic"
prerequisites: ["containers-image-runtime"]
relatedArticles: []
applicableVersions: "以 Kubernetes 現行核心 API 與 Docker 容器模型說明；GKE 限制另見平台文章。"
verifiedWith: "已核對 Kubernetes／Docker 官方概念；叢集操作與環境驗證狀態見獨立實作指南。"
lastReviewed: "2026-10-08"
takeaway: "分清主機程序、容器網路、port 映射、volume 和服務就緒。"
noteDates: []
sources: [{"title": "Compose networking", "url": "https://docs.docker.com/compose/how-tos/networking/"}, {"title": "Compose startup order", "url": "https://docs.docker.com/compose/how-tos/startup-order/"}]
---

Compose 用一份宣告描述多個容器、網路與 volume，方便重複建立本機環境。它適合讓開發者啟動資料庫、Redis 和 RabbitMQ，但不能直接等同於正式 Kubernetes 的可用性、權限或更新策略。

## 先畫出程序位置

本 Wiki 的快取與訊息實驗採用「API／Worker 在主機，三個相依在容器」的配置。主機上的 API 連到 `127.0.0.1` 的映射 port；如果日後把 API 也搬進同一個 Compose 網路，連線字串就要改為服務名稱與容器 port。

| 連線位置 | 位址的意義 |
| --- | --- |
| 主機 → 容器 | 使用已發布到主機的 port |
| 同一 Compose 網路內 | 使用服務名稱的 DNS 與服務監聽 port |
| 容器中的 localhost | 指向該容器，不是主機或其他服務 |

這個差別可以解釋「主機能連 Redis，API 容器卻連不上」：先確認程序位置和位址，再檢查認證，而不是先改應用程式邏輯。

## 啟動與就緒不同

容器程序啟動不代表 PostgreSQL 已經可以登入，或 RabbitMQ 已完成初始化。Compose healthcheck 可以回報相依健康，`depends_on` 的健康條件能控制啟動順序；服務執行中再次故障時，應用程式仍需要逾時、重新連線與可接受的降級。

商品查詢允許 Redis 故障時回資料庫，訂單提交則不能在資料庫無法使用時假裝成功。就緒判斷必須和業務契約一致。

## 資料和環境的生命週期

同一個 Compose project 名稱會決定資源範圍。日常停止可保留具名 volume，下一次繼續閱讀訂單；隔離測試則使用唯一 project、全新 volume，結束時清理自己的資源。初始化 SQL 通常只在新資料目錄建立時執行，不能用修改初始化檔代替既有資料庫 migration。

`.env` 用於本機設定，不是完整的機密管理系統。對外公開、共用環境和 CI 的權限需求，要另外建立。固定映像版本也不代表永遠不更新，應讓升級經過可重現驗證。

## 跟做入口

[環境準備](/practice/ecommerce/setup/)會說明每個指令到底啟動哪個程序、工作目錄和 port；[快取與訊息實驗](/practice/ecommerce/cache-messaging/)則把商品查詢與訂單結果連起來。閱讀技術原理不需要先安裝 Compose。
