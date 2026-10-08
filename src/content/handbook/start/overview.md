---
title: "如何閱讀這份 Wiki"
description: "從問題、知識領域或電商專題開始，選擇適合自己的閱讀方式。"
group: "start"
order: 0
environment: "reading"
verification: "情境與設計說明；實作範圍及跟做前提見內文。"
linkedArticles: ["csharp-getting-started", "redis-cache-aside", "kubernetes-workloads"]
prerequisites: []
sources: [{"title": "Microsoft modern web application architecture", "url": "https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures"}]
---

這份 Wiki 用一個電商後端串起 C#、.NET、資料、訊息與雲端部署。每項技術先說明原理，再展示它在商品、訂單與通知中的用途；需要執行程式時，另有包含環境與完整操作的實作指南。

## 選一個起點

| 你的目標 | 從這裡開始 | 如何往下讀 |
| --- | --- | --- |
| 第一次學 C# | [C# 入門](/learning-paths/csharp-beginner/) | 用短程式理解語法，再回到電商案例 |
| 深入後端技術 | [C#／.NET 地圖](/knowledge-maps/dotnet-backend/) | 依十個領域補基礎與深入知識 |
| 理解系統怎麼合作 | [電商專題](/projects/ecommerce/) | 沿商品查詢、下單、事件與部署閱讀 |
| 補雲端能力 | [雲端地圖](/knowledge-maps/cloud-native/) | 先容器和 Kubernetes，再進 GKE 與維運 |
| 深入資料庫與容量 | [資料庫地圖](/knowledge-maps/database-scale/) | C# 連接 MySQL／PostgreSQL、併發 CRUD 與大量資料 |
| 動手觀察結果 | [實作指南](/practice/ecommerce/) | 先確認環境，再跑對應的實驗 |

## 四種內容怎麼配合

技術文章回答「是什麼、怎麼運作、何時使用」，其中基礎篇建立語意，深入篇分析邊界與取捨。電商章節回答「遇到什麼需求、如何選擇、失敗時會怎樣」。實作指南才提供工作目錄、啟動方式與可觀察結果；開始閱讀則說明共同背景與各元件責任。

例如你想理解商品查詢的 Redis：先讀[快取章節](/projects/ecommerce/caching/)，知道資料庫是商品資料來源，再讀 [Cache-Aside](/infrastructure/redis/cache-aside/)理解命中、回源與失效；最後依[快取與訊息實驗](/practice/ecommerce/cache-messaging/)觀察實際回應。

## 程式片段如何閱讀

C# 入門使用小型完整程式，聚焦一個語言行為。框架整合片段會說明相依服務、所在程序與示意範圍；它們通常不是整個可直接執行的專案。Redis 指令與 SQL 範例也會注明所用語言，跟做時使用指南提供的環境。

每篇下方都有參考來源、相關知識與對應電商章節。學到某個概念後，可以沿這些連結看它如何接到其他技術，而不是先把所有領域讀完才使用。

## 先瞭解共同背景

下一篇[電商範圍與元件責任](/start/responsibilities/)會定義買家、商品、訂單、API、資料庫、Redis 和 RabbitMQ。之後遇到新元件，先問它負責哪份資料、哪個階段，以及成功回應代表什麼。
