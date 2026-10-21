---
title: "電商範圍與元件責任"
description: "用同一筆購買流程說明 API、資料庫、快取、訊息與部署平台各負責什麼。"
group: "start"
order: 1
linkedArticles: ["architecture-communication-boundaries", "architecture-outbox-inbox", "kubernetes-workloads"]
prerequisites: ["start/overview"]
sources: [{"title": "Microsoft modern web application architecture", "url": "https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures"}]
---

學習案例以一個店家販售商品為起點，保留未來擴展賣家、物流和結算的空間。買家先查商品，再加入購物車、送出訂單、完成模擬付款，最後得到通知。這條主線足以討論交易、並行、快取、訊息與雲端部署。

## 共同案例

設計章節以「保溫杯、單價 120 元、庫存 3 個、購買 2 個」討論規則。這組數字是情境條件，方便推演競爭與金額。

## 各元件負責什麼

| 元件 | 責任 | 成功代表什麼 |
| --- | --- | --- |
| HTTP API | 接收、驗證、授權與執行用例 | 回應的契約指定哪個階段已完成 |
| PostgreSQL | 商品、訂單與本地交易 | 資料已提交至對應交易邊界 |
| Redis | 有期限的快取或指定的共享狀態 | 可讀取該資料；語意取決於用途 |
| Outbox 發布器 | 將已提交事件交給 Broker | 發布確認後記錄交付狀態 |
| RabbitMQ | 路由、保存並分派待處理事件 | Confirm／Ack 各確認不同階段 |
| 通知 Consumer | 處理事件並記錄結果 | 用例結果提交後再確認消費 |
| Kubernetes（GKE／EKS） | 排程、更新、入口與資源管理 | 工作負載按平台條件運作 |

## 一筆訂單如何走完

本站以 PostgreSQL 作為權威交易來源。[資料庫專題](/projects/ecommerce/database-capacity/)比較 MySQL 與 PostgreSQL 的連線、交易及容量設計，選擇其中一個作為權威交易來源；快取和訊息的責任仍按用例定義。

<figure class="concept-flow">
<figcaption>訂單提交與通知完成的流程</figcaption>
<ol><li>買家</li><li>訂單 API</li><li>訂單與 Outbox 交易</li><li>發布器</li><li>RabbitMQ</li><li>通知 Consumer</li><li>Inbox 與通知結果交易</li></ol>
</figure>

API 先提交訂單和 Outbox，可以在 Worker 尚未完成通知時回應成功。通知會稍後完成；發生重送時，以穩定事件 ID 與業務唯一條件保護結果。
