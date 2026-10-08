---
title: "Redis 與分散式快取入門"
description: "從重複讀取的成本理解 Redis，分清本機快取、共享快取與權威資料。"
articleId: "redis-getting-started"
topic: "redis"
category: "redis-basics"
order: 1
tags: ["Redis","分散式快取","IMemoryCache","cache hit","cache miss","延遲"]
difficulty: "beginner"
prerequisites: ["csharp-collections"]
relatedArticles: ["redis-data-types-ttl","redis-cache-aside","architecture-communication-boundaries"]
applicableVersions: "Redis 8.2.10／StackExchange.Redis 3.3.1／.NET 10；版本相關限制見內文。"
verifiedWith: "已以 Redis 8.2.10 容器及 .NET 10 執行 String、Hash、TTL 範例；網站本身仍為靜態 PWA。"
lastReviewed: "2026-10-08"
takeaway: "快取是可重建的資料副本；導入 Redis 前，先決定哪些舊值可以接受，以及故障時如何讀取。"
noteDates: []
sources: [{"title":"Redis：資料型別","url":"https://redis.io/docs/latest/develop/data-types/"},{"title":"Microsoft Learn：分散式快取","url":"https://learn.microsoft.com/en-us/aspnet/core/performance/caching/distributed?view=aspnetcore-10.0"},{"title":"Microsoft Learn：Cache-Aside","url":"https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside"}]
learningDepth: "basic"
---

同一商品被大量讀取時，Redis 可以保存可重新建立的資料副本。導入前先決定權威來源、允許舊資料的時間，以及快取故障時的結果。

## 從重複查詢的成本開始

假設商品名稱與價格存放於資料庫，許多請求重複讀取同一項商品。每次都執行查詢，會增加資料庫與網路負擔。Redis 可以保存查詢結果的副本，讓下一次請求先找快取；找到稱為命中（cache hit），找不到稱為未命中（cache miss）。

Redis 提供記憶體中的資料結構與網路存取，也有持久化功能。它能承擔不同角色，但本主題的第一個案例把 PostgreSQL 設為權威資料來源，Redis 保存可重新載入的商品副本。讀者需要能辨認「目前使用的資料」與「最終應以哪份資料為準」。

## 本機與共享快取的邊界

| 選擇 | 資料位於哪裡 | 適用情境與成本 |
| --- | --- | --- |
| IMemoryCache | 單一 .NET 程序 | 小型且可重建的本機資料；各個程序有自己的副本 |
| Redis | 外部服務，透過網路存取 | 多個 API 程序共用資料；需處理連線、序列化、延遲與故障 |
| 瀏覽器／PWA 快取 | 使用者的瀏覽器 | 網頁與資源的離線閱讀；與後端商品快取分屬不同層級 |

共享快取讓不同程序存取同一個 Key，仍需由應用程式決定何時更新或清除。增加一個 Redis 服務也增加一個網路邊界，效益應由資料庫查詢量、命中率及整體延遲驗證。

## 先選擇允許過期的資料

商品介紹、公開分類與可重建的查詢結果，通常比較容易定義快取生命週期。權限、餘額、庫存扣減等資料，需要依用例設計一致性與權威來源，不能把「讀取很快」當作商業正確性的證明。

為每個用例回答：最多能接受多久的舊值？資料更新由誰負責？快取不可用時是否可以回資料庫？回源會不會使資料庫超載？如果大多數資料只讀一次，序列化與快取存取成本也可能超過效益。

## 怎麼觀察命中與回源

命中代表找到商品副本，未命中則回資料庫。本機示範 API 的 source 欄位會標示 redis、database 或 database-fallback，讓讀者辨識資料路徑；價格與 version 用來核對更新。這些是教學欄位，不是 Redis 通用回應。

[快取與訊息實作指南](/practice/ecommerce/cache-messaging/)提供完整啟動方式、HTTP 命令與結果，閱讀原理時先掌握各資料來源即可。

## 常見誤解

快取未命中是正常讀取路徑，不是例外。TTL 讓副本有明確存活時間，並不代表期間內一直最新。Redis 有持久化能力，也不代表本案例的快取會變成權威資料。先確認資料角色，後續才能選擇失效與故障策略。

## 套用到電商情境

商品介紹適合討論可接受短暫舊值的快取，結帳價格與庫存則有不同一致性需求。先以資料庫為商品來源、Redis 為副本，再用命中率、回源量和整體延遲評估效益。只讀一次的資料不一定值得快取。

[閱讀對應的電商章節](/projects/ecommerce/caching/)，把本篇概念接到整個用例。
