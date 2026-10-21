---
title: "15 多副本、容量與安全擴縮"
description: "增加處理能力之前，先核對共享狀態、工作領取和下游容量。"
group: "ecommerce"
order: 15
linkedArticles: ["kubernetes-autoscaling", "data-access-pools-locks", "redis-concurrency", "rabbitmq-retries-idempotency", "dotnet-threadpool", "data-access-pool-capacity", "data-access-load-validation"]
prerequisites: ["ecommerce/gke"]
sources: [{"title": "HPA", "url": "https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/"}, {"title": "RabbitMQ consumers", "url": "https://www.rabbitmq.com/docs/consumers"}]
---

促銷開始後，商品查詢增加，通知逐漸堆積。API 與 Worker 可以有不同擴縮策略，但都需要先檢查資料與外部服務的容量邊界。

## API 的共享狀態

登入與購物車不能綁定到某個 Pod 記憶體；請求冪等記錄要能跨副本查詢；庫存由資料庫一致性邊界仲裁。增加 API 實例不會自動解決超賣或重複提交。

Redis 故障回源可能讓資料庫負載突然增加，因此最大副本數要納入故障模式，而不是只看快取命中時的 CPU。

## Worker 先領任務再處理

多個 Outbox 發布器需要 claim／lease 或對應的交易鎖定協定，確保可辨識工作所有權、程序死亡後恢復以及租期到期行為。Consumer 仍以穩定事件 ID 和業務條件去重。

工作領取協定完成之前，不要把發布器設成多副本。完成後，用真實資料庫的並行測試核對重複領取、未知 Confirm、停止與恢復。

## 指標與容量預算

HPA 的 CPU 目標需要 requests 與資源指標。Queue 年齡、處理量等外部指標需要相應管道與 adapter；KEDA 也是可選整合，需要安裝和授權。

最大資料庫連線要計算所有 API／Worker 池、rolling update 額外副本與工具。Node 容量、Broker 連接、外部服務節流與成本也可能成為上限。

## 驗證擴縮

分階段增加請求和工作，觀察成功率、延遲、Queue 與 Outbox 年齡、池等待與資源；縮容時確認在途工作可安全完成或重送。擴容後結果正確，才有理由調整目標和上限。

## 資料庫延伸

API／Worker、rollout 額外 Pod、讀副本與故障回源的連線預算，見[池容量](/data-access/pool-capacity/)和[資料庫容量專題](/projects/ecommerce/database-capacity/)。增加 Pod 前先量測主庫承受量。
