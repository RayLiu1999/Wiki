---
title: "製作電商後端：從 C# 到 GKE"
description: "沿十七個主線章節理解購買、事件與部署，再深入資料庫容量專題。"
group: "ecommerce"
order: 0
environment: "reading"
verification: "電商設計案例；本章描述規則與方案，尚未提供完整業務實作。"
linkedArticles: ["architecture-domain-modeling", "gke-platform-modes"]
prerequisites: ["start/responsibilities"]
sources: [{"title": "Microsoft modern web application architecture", "url": "https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures"}]
---

從一個店家的商品查詢開始，逐步加入登入、購物車、訂單、模擬付款與通知，再把程序放上容器、Kubernetes 和 GKE。每章先提出需求與規則，接著說明技術選擇及失敗邊界；深入知識透過篇末連結補充。

## 章節順序

| 章 | 情境與目標 | 目前內容範圍 |
| --- | --- | --- |
| 01 [商品與領域模型](/projects/ecommerce/catalog/) | 分清目前商品、價格與歷史快照 | 設計案例 |
| 02 [商品 API](/projects/ecommerce/product-api/) | 建立 HTTP、輸入和錯誤契約 | 有商品查詢／價格更新實驗 |
| 03 [登入與權限](/projects/ecommerce/identity/) | 買家只能操作自己的資料 | 設計案例 |
| 04 [購物車](/projects/ecommerce/cart/) | 建立暫存內容與結帳重驗規則 | 設計案例 |
| 05 [訂單與庫存](/projects/ecommerce/ordering-inventory/) | 防止同時購買造成超賣 | 訂單事件已有實驗，庫存為設計 |
| 06 [模擬付款](/projects/ecommerce/payment/) | 面對重複回呼與未知結果 | 設計案例 |
| 07 [商品快取](/projects/ecommerce/caching/) | 理解命中、失效和故障回源 | 已有實驗 |
| 08 [背景通知](/projects/ecommerce/notifications/) | 把通知移出 HTTP 等待 | 已有模擬通知實驗 |
| 09 [可靠事件](/projects/ecommerce/reliable-events/) | 串接 Outbox、Confirm、Inbox 與 Ack | 已有實驗 |
| 10 [測試與觀測](/projects/ecommerce/testing-observability/) | 證明結果與故障恢復 | 已有隔離整合檢查 |
| 11 [容器化](/projects/ecommerce/containers/) | 把程序做成可追溯映像 | 獨立商品 API 範例 |
| 12 [本機 Kubernetes](/projects/ecommerce/kubernetes/) | 理解多 Pod 和 Service | 宣告範例與跟做指南 |
| 13 [設定、探針與資源](/projects/ecommerce/configuration/) | 區分就緒、重啟和安全停止 | 宣告範例與設計 |
| 14 [GKE](/projects/ecommerce/gke/) | 整合身分、網路和外部資料 | 雲端指南與設計 |
| 15 [多副本與擴縮](/projects/ecommerce/scaling/) | 核對工作領取和容量 | 設計與驗證目標 |
| 16 [交付與 Migration](/projects/ecommerce/delivery/) | 管理新舊版本與資料相容 | 設計與驗證目標 |
| 17 [日常維運](/projects/ecommerce/operations/) | 建立 SLO、還原與成本管理 | 設計與演練目標 |

## 先單體，再依責任擴展

主線之外的[資料庫容量專題](/projects/ecommerce/database-capacity/)比較 C# 連接 MySQL／PostgreSQL、高併發 CRUD、上億筆資料與雲端擴容。可從商品 API、訂單與庫存、多副本或維運章節接入，不改變主線順序。

最初使用模組化後端與獨立通知工作程序即可。商品、訂單、付款有各自規則，但不必立即各開一個服務。只有出現不同的一致性、容量、團隊或部署需求時，再評估切分；服務拆分也會增加契約、網路與故障成本。

## 怎麼讀這條路線

先看[元件責任](/start/responsibilities/)，再依章節順序走一次。遇到型別、非同步、交易或部署概念，回到 [.NET 地圖](/knowledge-maps/dotnet-backend/)或[雲端地圖](/knowledge-maps/cloud-native/)深入閱讀。要實際觀察命中、重送或 Pod 狀態，就進[實作指南](/practice/ecommerce/)。

這份專題讓技術有共同背景，也保留各項技術自己的語意與限制。讀者可以單讀某篇文章，再沿連結補上所在流程。
