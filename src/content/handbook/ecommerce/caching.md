---
title: "07 商品快取與失效"
description: "在允許短暫舊資料的前提下，降低商品讀取負載並觀察故障回源。"
group: "ecommerce"
order: 7
environment: "reading"
verification: "已有本機實驗可觀察部分流程；本章逐項說明其邊界。"
linkedArticles: ["redis-getting-started", "redis-data-types-ttl", "redis-cache-aside", "redis-dotnet-integration", "redis-reliability"]
prerequisites: ["ecommerce/product-api"]
sources: [{"title": "Redis client-side caching concepts", "url": "https://redis.io/docs/latest/develop/reference/client-side-caching/"}, {"title": "Cache-Aside pattern", "url": "https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside"}]
---

商品頁讀取次數多，價格更新相對少。Redis 可保存可重新建立的商品副本，讓查詢避免每次都去資料庫；結帳的價格和庫存判斷仍要使用其對應的一致性規則。

## 查詢與更新流程

查詢先讀商品 key，命中返回副本；沒有資料時回資料庫、寫入帶 TTL 的副本，再回應。價格更新先提交資料庫，再使快取失效，下一次讀取回源。

<figure class="concept-flow">
<figcaption>命中與回源的兩條讀取路徑</figcaption>
<ol><li>查商品</li><li>Redis 命中</li><li>返回副本</li></ol>
<ol><li>Redis 未命中或允許的故障</li><li>讀資料庫</li><li>嘗試寫入帶期限副本</li><li>返回商品</li></ol>
</figure>

## 仍存在什麼窗口

一個讀取正在回填舊值，另一個請求剛完成更新並刪除 key，舊值可能在刪除後寫回。TTL 限制副本壽命，但不保證永遠讀到最新值。失效失敗也要有可觀察錯誤和恢復策略。

選擇允許的舊資料範圍後，再考慮版本檢查、延後重複失效或其他設計。庫存扣減與付款不能只讀商品快取就決定成功。

## Redis 故障時

目前實驗允許查詢回 PostgreSQL，並在 source 欄位顯示 database-fallback。回源仍受資料庫容量與併發限制；故障降級並非免費增加處理能力。損壞 JSON 應被識別和清理，而不是當成正確商品返回。

## 可以動手看見的結果

指南會讓你連續查詢、更新價格和查看 TTL。冷讀通常回 database，後續讀命中 redis；更新後可以讀到新價格和 version。既有快取會影響首次來源，指南明確說明如何解釋結果。[進入快取實驗](/practice/ecommerce/cache-messaging/)。
