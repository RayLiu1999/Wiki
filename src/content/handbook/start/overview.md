---
title: "如何閱讀這份 Wiki"
description: "從問題、知識領域或電商專題開始，選擇適合自己的閱讀方式。"
group: "start"
order: 0
linkedArticles: ["csharp-syntax-traps", "redis-cache-aside", "kubernetes-workloads"]
prerequisites: []
sources: [{"title": "Microsoft modern web application architecture", "url": "https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures"}]
---

這份 Wiki 用一個電商後端串起 C#、.NET、資料、訊息與雲端部署。每項技術先用白話說明它是什麼、怎麼運作，再看它在商品、訂單與通知中的用途，以及部署到 GKE 或 EKS 後出問題怎麼排查。

## 選一個起點

| 你的目標 | 從這裡開始 | 如何往下讀 |
| --- | --- | --- |
| 第一次接觸 C# 語法 | [Microsoft Learn：C# 導覽](https://learn.microsoft.com/zh-tw/dotnet/csharp/tour-of-csharp/) | 先用官方入門建立語法基礎，再回到本站看後端實務 |
| 深入後端技術 | [技術主題](/topics/) | 依主題查閱原理、反模式與排查方法 |
| 理解系統怎麼合作 | [電商專題](/projects/ecommerce/) | 沿商品查詢、下單、事件與部署閱讀 |
| 補雲端能力 | [Kubernetes](/platforms/kubernetes/) 與 [GKE](/platforms/gke/) | 先容器和 Kubernetes，再進 GKE 與維運；EKS 的差異會在對應文章說明 |
| 深入資料庫與容量 | [資料存取](/data-access/) | C# 連接 MySQL／PostgreSQL、併發 CRUD 與大量資料 |

## 三種內容怎麼配合

技術專題回答「是什麼、怎麼運作、常見錯誤、什麼時候不要用」；文章標有「入門」或「進階」，可以先從入門篇讀起。電商章節回答「遇到什麼需求、如何選擇、失敗時會怎樣」。導讀則說明共同背景與各元件責任。

例如你想理解商品查詢的 Redis：先讀[快取章節](/projects/ecommerce/caching/)，知道資料庫是商品資料來源，再讀 [Cache-Aside](/infrastructure/redis/cache-aside/)理解命中、回源與失效。

## 程式片段如何閱讀

文章裡的程式碼是用來說明觀念的片段，不是可以直接執行的完整專案。每段程式前後都會說明它在做什麼、該注意哪一行；帶回自己的專案時，要依實際的相依套件與設定調整。Redis 指令與 SQL 範例也會注明所用語言。

每篇下方都有參考來源、相關知識與對應電商章節。學到某個概念後，可以沿這些連結看它如何接到其他技術，而不是先把所有領域讀完才使用。

## 先瞭解共同背景

下一篇[電商範圍與元件責任](/start/responsibilities/)會定義買家、商品、訂單、API、資料庫、Redis 和 RabbitMQ。之後遇到新元件，先問它負責哪份資料、哪個階段，以及成功回應代表什麼。
