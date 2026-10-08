---
title: "電商實作指南與環境地圖"
description: "先看每個實驗需要什麼，再選商品快取、可靠訊息或部署練習。"
group: "practice"
order: 0
environment: "reading"
verification: "此頁說明環境配置；各指南標示實際可執行內容和待驗證項目。"
linkedArticles: ["containers-compose", "kubernetes-workloads", "gke-platform-modes"]
prerequisites: ["start/responsibilities"]
sources: [{"title": "Docker Compose", "url": "https://docs.docker.com/compose/"}, {"title": "kind quick start", "url": "https://kind.sigs.k8s.io/docs/user/quick-start/"}]
---

操作從這裡開始。每份指南說明程式在哪裡執行、指令屬於哪個工具、成功後看什麼，以及哪些功能仍只作為設計案例。

## 四層環境

| 層次 | 執行配置 | 指南與驗證範圍 |
| --- | --- | --- |
| L1 主機與 Compose | .NET API／Worker 在主機，資料服務在容器 | [準備](/practice/ecommerce/setup/)、[快取與訊息](/practice/ecommerce/cache-messaging/)、[故障驗證](/practice/ecommerce/failure-drills/) |
| L2 本機 Kubernetes | 獨立商品 API 映像，在 kind 叢集運作 | [容器](/practice/ecommerce/containers/)、[Kubernetes](/practice/ecommerce/kubernetes/) |
| L3 GKE | Registry 映像與既有 GKE 學習叢集 | [GKE](/practice/ecommerce/gke/)，需要自己的雲端資源 |
| L4 交付與維運 | CI 身分、映像、部署及資料更新 | [交付章節](/projects/ecommerce/delivery/)，目前是設計目標 |

## 選擇最小可觀察問題

想看 Redis 命中和故障回源，先跑 L1；想看訂單提交後通知晚一點完成，也使用同一組 L1 程序。想理解 Pod 和 Service，從 L2 固定商品 API 開始，暫時不需要資料庫。

L1 可執行實驗包含商品查詢、價格更新、訂單與 Outbox、發布確認、重試、Inbox 及模擬通知，尚未加入購物車、庫存、付款或買家登入。L2 只提供固定商品和程序健康。L3 指南沒有宣稱已完成讀者環境的雲端部署。

## 指令怎麼讀

資料庫另有[設定與容量驗證指南](/practice/ecommerce/database-validation/)。它先執行獨立 C# 範例的離線設定解析，再說明選用的 TLS 連線檢查與 CRUD／負載驗證方法；不需要啟動 L1，也沒有已完成的上億列壓測。

`sh`區塊在終端機執行；`text`區塊可能是預期輸出，或有明確前提的 Redis CLI 輸入。`pnpm lab:*`是這個儲存庫定義的快捷指令，並非 Redis 或 RabbitMQ 的通用命令。

如果只是閱讀概念，從[電商專題](/projects/ecommerce/)或[技術主題](/topics/)往下即可；操作時使用與本站相同版本的範例專案。
