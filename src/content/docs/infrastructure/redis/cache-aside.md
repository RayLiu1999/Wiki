---
title: "Cache-Aside、失效與資料一致性"
description: "用商品查詢理解讀取回源、寫入後清除快取、競態與故障降級的取捨。"
articleId: "redis-cache-aside"
topic: "redis"
category: "redis-caching"
order: 4
tags: ["Cache-Aside","快取失效","一致性","stale data","TTL","回源","cache invalidation"]
difficulty: "intermediate"
prerequisites: ["redis-dotnet-integration","data-access-transactions"]
relatedArticles: ["redis-concurrency","architecture-outbox-inbox","engineering-cache-messaging-tests"]
applicableVersions: "Redis 8.2.10／StackExchange.Redis 3.3.1／.NET 10；版本相關限制見內文。"
verifiedWith: "已連線 Redis 8.2.10 與 PostgreSQL 18.6，驗證冷讀、命中、更新失效、TTL、損壞快取與停機回源；未驗證強一致性。"
lastReviewed: "2026-10-08"
takeaway: "先提交資料庫再使快取失效是起點；併發、失效失敗與回源負載仍需要獨立設計。"
noteDates: []
sources: [{"title":"Microsoft Learn：Cache-Aside","url":"https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside"},{"title":"Redis：Key eviction","url":"https://redis.io/docs/latest/develop/reference/eviction/"}]
---

## 讀取先找副本，未命中才回源

商品查詢的流程如下：

~~~text
API → Redis
      命中：回傳商品副本
      未命中：讀 PostgreSQL → 以 TTL 寫入 Redis → 回傳
~~~

TTL 應反映可接受的資料延遲與回源成本。價格更新頻繁、不能接受舊價格的結帳用例，應在權威來源重新確認；展示頁的查詢快取與訂單成交價是不同的資料責任。

## 把正常讀取與降級路徑寫清楚

下列片段取自 CachedProducts.GetAsync。前半段已嘗試讀 Redis，unavailable 表示讀取或反序列化失敗；store 是 PostgreSQL 存取邊界，lifetime 是外部提供的 TTL。

~~~csharp title="CachedProducts.cs（回源片段）"
LabDiagnostics.CacheMisses.Add(1);
Interlocked.Increment(ref databaseReads);
Product? current = await store.GetProductAsync(id, token);
if (current is null) return null;
if (!unavailable)
{
    try
    {
        await cache.StringSetAsync(Key(id), JsonSerializer.Serialize(current, LabJson.Options), lifetime).WaitAsync(token);
    }
    catch (RedisException)
    {
        unavailable = true;
        LabDiagnostics.CacheErrors.Add(1);
    }
}
return new ProductRead(current, unavailable ? "database-fallback" : "database");
~~~

Redis 失敗時仍可讀取資料庫，source 顯示 database-fallback。這個教學流程沒有替資料庫增加無限重試，也沒有快取查無資料的結果。正式系統需評估降級流量上限、連線池、熱點合併與可接受的服務品質。

## 寫入後清除快取

本案例的更新順序是：提交 PostgreSQL 商品變更，再刪除對應 Redis Key。下一次讀取重新建立副本。若先清除快取再更新資料庫，並行讀取可能在資料庫更新之前把舊值重新寫入。

資料庫與 Redis 的兩個操作不是同一個本地交易。資料庫已提交但清除快取失敗時，本案例記錄快取錯誤，讓舊值依 TTL 失效；需要更嚴格要求時，可評估可重試的失效工作、資料版本或避免在該路徑使用快取。

## 刪除成功仍可能有競態

一個讀取者可能先讀到舊資料，另一個寫入者隨後提交新值並刪除快取，第一個讀取者最後才把舊值放回 Redis。這表示「寫完後刪除」仍不保證所有並行讀取立刻看到新值。

教學案例用有限 TTL 接受這個窗口，沒有實作強一致性或延遲雙刪保證。依用例可以使用版本化副本、每 Key 的載入協調，或把要求強一致性的查詢直接交給權威來源。每種方式都要分析故障與併發條件。

## 以可觀察的結果驗證

執行 pnpm lab:api 後，可以在第二個終端機觀察：

~~~sh
curl http://127.0.0.1:5080/products/1
curl http://127.0.0.1:5080/products/1
curl -X PUT http://127.0.0.1:5080/products/1/price -H 'Content-Type: application/json' -d '{"price":120.00}'
curl http://127.0.0.1:5080/products/1
~~~

第一次讀取的來源取決於既有副本，重複讀取通常命中；更新後的下一次讀取應看到新價格與遞增 version。pnpm test:infrastructure 使用全新的隔離容器，另外核對冷讀、命中、TTL 到期、更新失效、損壞快取與 Redis 停機時的回源結果。
