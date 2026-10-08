---
title: "Redis 資料型別、Key 與 TTL"
description: "依讀寫行為選資料結構，理解過期時間、覆寫、命名與原子操作的界線。"
articleId: "redis-data-types-ttl"
topic: "redis"
category: "redis-basics"
order: 2
tags: ["String","Hash","List","Set","Sorted Set","TTL","EXPIRE","SET","Key"]
difficulty: "beginner"
prerequisites: ["redis-getting-started"]
relatedArticles: ["redis-dotnet-integration","redis-concurrency","redis-reliability"]
applicableVersions: "Redis 8.2.10／StackExchange.Redis 3.3.1／.NET 10；版本相關限制見內文。"
verifiedWith: "已用 .NET 範例與整合測試驗證 String、Hash 與 TTL；其餘型別及 Cluster 限制依官方文件核對。"
lastReviewed: "2026-10-08"
takeaway: "Key、資料結構與 TTL 是同一份資料契約；單一命令的原子性不會自動延伸到一串命令。"
noteDates: []
sources: [{"title":"Redis：資料型別","url":"https://redis.io/docs/latest/develop/data-types/"},{"title":"Redis：SET","url":"https://redis.io/docs/latest/commands/set/"},{"title":"Redis：TTL","url":"https://redis.io/docs/latest/commands/ttl/"},{"title":"Redis：INCR","url":"https://redis.io/docs/latest/commands/incr/"}]
---

## 依操作選資料結構

| 型別 | 典型用途 | 需要理解的操作 |
| --- | --- | --- |
| String | 序列化商品 DTO、單一值、計數器 | GET、SET、INCR |
| Hash | 一個物件的多個欄位 | HSET、HGET、HGETALL |
| List | 依序加入與移除項目 | LPUSH、RPOP；耐久工作流程另需確認傳遞機制 |
| Set | 不重複的會員或標籤集合 | SADD、SISMEMBER |
| Sorted Set | 依分數排序的排行榜 | ZADD、ZRANGE |

JSON 字串放在 String 中，是應用程式自己的序列化約定；它與 Redis 的 JSON 資料型別是不同用法。Streams 的消費者群組與確認機制放在通訊選擇文章比較，避免將所有結構都當成相同的佇列。

## 把 Key 當作公開契約

商品快取可使用 devwiki:products:v1:1：前綴表示應用，products 表示用途，v1 表示快取格式版本，最後是商品 ID。調整格式時切換版本前綴，可讓新程式避開舊格式副本，再依 TTL 清理。

多租戶或與使用者權限有關的結果，Key 必須包含必要的隔離維度；只用商品 ID 可能讓不同用戶共用錯誤結果。Key 也應避免直接包含密碼、token 或不必要的個資。

## 同一次 SET 設定過期

先執行 pnpm lab:up，再用 pnpm lab:redis-cli 開啟本機實驗的 redis-cli。以下只操作 devwiki:learning: 前綴：

~~~text
SET devwiki:learning:price 100 EX 30
GET devwiki:learning:price
TTL devwiki:learning:price
DEL devwiki:learning:price
TTL devwiki:learning:price
~~~

SET 回傳 OK，GET 回傳 100。第一個 TTL 是剩餘秒數，會隨時間減少；刪除後 TTL 為 -2。若 Key 存在但沒有過期時間，TTL 為 -1。

一般 SET 覆寫既有值會移除原來的 TTL；需要保留時使用命令支援的 KEEPTTL，或重新指定 EX／PX。Hash 的一般欄位更新不等於重新設定整個 Key 的過期時間；個別欄位過期功能也有版本條件。

## 原子命令與多步驟流程

INCR 本身可以原子地增加整數，但「讀取數量、判斷、寫回」是多個命令，會受到其他用戶端穿插操作。SET 與 EXPIRE 分開執行，也可能在兩者之間中斷，留下沒有 TTL 的 Key。

需要把短小的多步驟操作放在同一個原子執行範圍時，可以評估 Lua 或 transaction 的能力與限制。Pipeline 主要減少網路往返，本身不會把所有命令變成一個資料庫交易。Cluster 下的多 Key 操作另有 hash slot 限制。

## 到期與淘汰分開看

到期是依 TTL 判定 Key 已失效；淘汰（eviction）是記憶體壓力下依政策移除資料。Key 設定 30 秒 TTL，仍可能因淘汰在 30 秒內消失，因此讀取流程始終需要處理未命中。

這裡的命令使用 Redis 8.2 基本語意；沒有執行全套資料型別或 Cluster 測試。可執行 .NET 範例與故障演練集中在實驗目錄。
