---
title: "Redis 持久化、記憶體與故障處理"
description: "理解 RDB、AOF、淘汰與高可用性的不同責任，建立有界的快取降級與觀測。"
articleId: "redis-reliability"
topic: "redis"
category: "redis-reliability"
order: 6
tags: ["RDB","AOF","appendfsync","maxmemory","eviction","Sentinel","Cluster","故障降級","命中率"]
difficulty: "intermediate"
prerequisites: ["redis-cache-aside"]
relatedArticles: ["redis-concurrency","engineering-cache-messaging-tests","engineering-metrics-tracing"]
applicableVersions: "Redis 8.2.10／StackExchange.Redis 3.3.1／.NET 10；版本相關限制見內文。"
verifiedWith: "已驗證 Redis 停機回源及 AOF 確認後的容器重啟恢復；未驗證斷電、多節點切換、容量壓測或備份恢復。"
lastReviewed: "2026-10-08"
takeaway: "持久化、備份、複寫與降級各自處理不同故障；快取應始終容許資料遺失與重新載入。"
noteDates: []
sources: [{"title":"Redis：Persistence","url":"https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/"},{"title":"Redis：Key eviction","url":"https://redis.io/docs/latest/develop/reference/eviction/"},{"title":"Redis：Replication","url":"https://redis.io/docs/latest/operate/oss_and_stack/management/replication/"}]
learningDepth: "deep"
---

Redis 作為可丟棄快取或重要共享狀態，會產生不同恢復需求。持久化、記憶體淘汰、複製與故障切換要按資料角色選擇，不能用「有 Redis」概括保證。

## 先決定重新啟動後需要留下什麼

RDB 保存某個時間點的資料快照；AOF 記錄寫入命令，重啟時重建資料。兩者有不同的空間、重建與寫入成本，也可以搭配使用。若資料全是可重建副本，是否持久化可以依冷啟動成本決定。

本地實驗啟用 AOF 與 appendfsync everysec，並將 /data 放在專屬 volume。它示範一般容器重新啟動後的資料恢復，不承諾斷電時所有剛完成的寫入都保留。fsync 政策與故障時間會影響可遺失的範圍。

## 持久化與淘汰是不同的機制

實驗設定 maxmemory 128mb 與 allkeys-lru。超過容量時，可依近似 LRU 政策移除任何 Key，包括有 TTL 的副本。TTL 尚未到期，不代表 Key 一定存在。

| 政策 | 容量不足時的行為 | 要先考慮的問題 |
| --- | --- | --- |
| allkeys-lru／allkeys-lfu | 依近期存取／頻率估計淘汰 | 哪些資料可以重建？命中率如何？ |
| volatile 類政策 | 從有 TTL 的 Key 選擇 | 沒有符合條件的 Key 時，寫入是否可能失敗？ |
| noeviction | 不自動淘汰，部分寫入回傳錯誤 | 誰負責容量規劃、清理與告警？ |

持久化不會阻止淘汰；快取與關鍵持久資料共用實例時，需特別確認政策的影響。

## 降級也需要容量邊界

Cache-Aside 範例遇到 Redis 錯誤會回 PostgreSQL。Redis 停機時，更多請求可能同時進入資料庫；要一起考慮回源限流、操作逾時、連線池、熱點合併與降級回應。

以本機 CLI 查看實驗資訊：

~~~text
INFO memory
INFO stats
INFO persistence
~~~

先看 used_memory、keyspace_hits、keyspace_misses、evicted_keys、expired_keys，再看持久化狀態。INFO 的全實例數值與特定 API 用例的命中率不同，避免把兩種量測範圍混在一起。

## 複寫、Sentinel 與 Cluster 的定位

複寫提供副本；Sentinel 可參與監控與主節點故障切換；Cluster 提供分片與對應的節點故障處理。這些選擇涉及不同的 client 行為、hash slot 與部署條件。

複寫與故障切換也可能有尚未同步的寫入；備份則需要獨立保存並驗證恢復。單一 Redis 容器沒有驗證多節點可用性、資料分片或正式環境備份。

## 教學實驗的驗證範圍

[隔離故障驗證](/practice/ecommerce/failure-drills/)在專屬容器與 volume 中核對：快取失效、TTL、無法連線的 client、Redis 服務停止時回源，以及 AOF 寫入確認後重啟再讀取探測值。

一般 docker compose down 保留本機實驗 volume。需要重建初始化資料時，依實驗 README 的明確清理指令處理自己的 devwiki-labs 資料；避免對正在共用的服務執行 FLUSHALL。正式網路部署另需依用途設定帳號權限、TLS、資源與備份。

## 套用到電商情境

商品副本可以重建，故障回源需容量限制；購物車若不能丟失，就要定義持久化、恢復與期限。AOF 確認後的單容器重啟驗證，不等於跨節點切換或斷電保證。成本、備份與恢復責任放進對應運作計畫。

[閱讀對應的電商章節](/projects/ecommerce/operations/)，把本篇概念接到整個用例。
