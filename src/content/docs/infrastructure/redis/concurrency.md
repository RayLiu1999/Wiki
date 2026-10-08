---
title: "快取併發、限流與分散式鎖的限制"
description: "區分穿透、熱點失效與同時過期，理解原子計數、租約與業務正確性的邊界。"
articleId: "redis-concurrency"
topic: "redis"
category: "redis-caching"
order: 5
tags: ["快取穿透","cache stampede","快取雪崩","single flight","Lua","INCR","限流","分散式鎖","fencing token"]
difficulty: "intermediate"
prerequisites: ["redis-cache-aside","csharp-thread-safety"]
relatedArticles: ["redis-reliability","data-access-pools-locks","rabbitmq-retries-idempotency"]
applicableVersions: "Redis 8.2.10／StackExchange.Redis 3.3.1／.NET 10；版本相關限制見內文。"
verifiedWith: "已核對 Redis 命令與鎖的官方文件；Lua 示意及多節點鎖未納入本站執行驗證。"
lastReviewed: "2026-10-08"
takeaway: "減少重複載入與限流可以使用 Redis；關鍵業務規則仍須由權威儲存與交易保護。"
noteDates: []
sources: [{"title":"Redis：INCR 與限流模式","url":"https://redis.io/docs/latest/commands/incr/"},{"title":"Redis：Distributed Locks","url":"https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/"},{"title":"Redis：SET","url":"https://redis.io/docs/latest/commands/set/"}]
---

## 三種流量問題需要不同處理

| 情境 | 發生什麼事 | 可評估的方式 |
| --- | --- | --- |
| 快取穿透 | 大量請求查詢不存在的資料，每次都回源 | 輸入檢查、短期負面快取；定義不存在資料的更新與期限 |
| 熱點失效／擊穿 | 一個熱門 Key 到期，許多請求同時重建 | 合併同 Key 載入、短期保留舊值、預先更新 |
| 大量同時過期／雪崩 | 很多 Key 在相近時間失效，或快取服務不可用 | TTL 加抖動、分批預熱、回源限流與降級容量 |

先用 metrics 確認究竟是哪些 Key、多少回源與哪段延遲，再選擇控制方式。Bloom filter 或鎖也有維護成本，不是每個快取查詢都需要。

## 同一程序可以先合併載入

若同一程序的十個請求同時發現同一 Key 未命中，可以共用一次正在進行的載入（single flight）。要定義載入失敗的傳播、等待者取消、Key 清理與最大等待時間。

本機 SemaphoreSlim 只協調一個程序。多個 API 副本仍可能同時回源；是否值得跨程序協調，取決於載入成本與資料庫可承受的併發。先讓載入操作可重複且有界，通常比較容易恢復。

## 計數與期限要一起考慮

固定窗口限流可將窗口放入 Key，例如 devwiki:rate:user-42:202610080930。INCR 原子增加數量，EXPIRE 限制保存時間；若第一個 INCR 與 EXPIRE 中間中斷，可能留下沒有期限的 Key。

下面是只操作一個 Key 的 Lua 示意，將計數與初次設定期限放在同一執行範圍。它沒有處理完整 HTTP 限流政策，也未納入可執行範例。

~~~lua title="固定窗口計數示意"
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
~~~

窗口邊界可能瞬間允許較多請求；需要滑動窗口或更平滑的控制時，選擇不同演算法。Redis 不可用時採允許或拒絕，也要依服務用途決定。

## 鎖是有期限的租約

最小的單實例鎖可使用 SET key token NX PX milliseconds，取得失敗就不進入工作。釋放時必須以原子操作確認 token 仍屬於自己，再刪除 Key；不能直接 DEL 別人的新鎖。

租約到期時，原持有者可能仍在執行。程序暫停、網路延遲或故障切換，都可能讓兩個工作同時繼續。需要保護重要寫入時，評估由資源端驗證的 fencing token、資料庫約束或交易，而不是只檢查 Redis 裡有沒有 Key。

## 讓最終效果仍可重複處理

本案例的通知去重使用 PostgreSQL Inbox 與通知表的約束。Redis 的 TTL、淘汰與重啟設定會影響 Key 是否存在，因此快取去重不能自行承諾通知效果恰好執行一次。

將鎖當作降低重複工作的協調手段，再由穩定業務 ID、唯一約束與交易保護結果。多節點鎖、續租、Cluster 與故障切換需要另外的部署與失敗驗證，本篇先建立這些判斷邊界。
