---
title: "觀察商品快取、訂單與背景通知"
description: "從兩個小範例開始，再用三個終端機觀察 API 提交和 Worker 完成結果。"
group: "practice"
order: 2
environment: "host-compose"
verification: "本機教學實驗；實際服務、程序與預期結果見內文。"
linkedArticles: ["redis-dotnet-integration", "redis-cache-aside", "rabbitmq-dotnet-integration", "rabbitmq-acknowledgements", "architecture-outbox-inbox"]
prerequisites: ["practice/setup"]
sources: [{"title": "Redis TTL", "url": "https://redis.io/docs/latest/commands/ttl/"}, {"title": "RabbitMQ confirms", "url": "https://www.rabbitmq.com/docs/confirms"}]
---

完成環境準備後，使用這組實驗回答兩個問題：商品是從 Redis 還是資料庫取得？訂單建立後，背景通知何時完成？所有 shell 命令在 Wiki 根目錄執行。

## 先看獨立小範例

~~~sh
pnpm lab:redis
pnpm lab:rabbit
~~~

RedisDemo 建立共享連線，示範 IDistributedCache、Hash 與 TTL。範例程序的三行輸出為：

~~~text
IDistributedCache: 商品快取
Hash: 商品名稱
String TTL 已設定: True
~~~

RabbitMqDemo 建立自己的示範 Exchange 與 Queue，發布具有穩定 MessageId 的事件，等待 Confirm、讀取並 Ack，再清理自己的拓樸。程序輸出為：

~~~text
發布確認: broker 已接收
消費內容: 商品 1，數量 2
消費確認: 已完成處理
~~~

pnpm 與 .NET 還原、編譯也會輸出訊息；上面只是範例程序的預期結果。這兩個小範例尚未建立完整的訂單流程。

## 終端機 A：啟動商品與訂單 API

~~~sh
pnpm lab:api
~~~

保持這個程序運作。接下來 curl 是在另一個終端機發送 HTTP 請求，目標是 API 而非 Redis 或 RabbitMQ。

## 終端機 B：商品查詢與價格更新

~~~sh
curl http://127.0.0.1:5080/products/1
curl http://127.0.0.1:5080/products/1
curl -X PUT http://127.0.0.1:5080/products/1/price -H 'Content-Type: application/json' -d '{"price":120.00}'
curl http://127.0.0.1:5080/products/1
~~~

回應中的 source 可能是`database`、`redis`或`database-fallback`。首次來源受之前的快取影響；重複查詢通常命中 Redis。更新提交後使快取失效，再查應看到 120 與遞增 version。此流程仍存在競爭回填與失效失敗窗口，不提供即時強一致保證。

## 先建立訂單，再啟動 Worker

讓 Worker 保持停止，在終端機 B 執行：

~~~sh
curl -i -X POST http://127.0.0.1:5080/orders -H 'Content-Type: application/json' -d '{"productId":1,"quantity":2}'
~~~

成功為 HTTP 201，包含實際的 orderId、messageId 和 Location。複製這次回應的 orderId，取代下列占位文字：

~~~sh
curl http://127.0.0.1:5080/orders/你的-orderId
~~~

`notificationRecorded`此時為 false：訂單與 Outbox 已提交，但模擬通知尚未記錄。這不是訂單失敗。

在終端機 C 啟動 Worker，稍後在 B 重查同一 orderId：

~~~sh
pnpm lab:worker
~~~

結果變成 true，表示 Inbox 與一份模擬通知在交易中提交。沒有真正寄信，也沒有扣庫存、登入或付款。

## 觀察 Key 與佇列

另開終端機，執行`pnpm lab:redis-cli`進入 Redis CLI。以下是輸入到該 CLI 的指令：

~~~text
TTL devwiki:products:v1:1
INFO memory
INFO stats
INFO persistence
~~~

TTL 大於或等於 0 表示剩餘秒數，-1 是沒有期限，-2 是 key 不存在。商品快取預設 30 秒，所以稍後查看可能已到期。輸入`exit`離開 CLI。

若要單獨練習 String 與 TTL，在同一個 Redis CLI 使用獨立練習 key：

~~~text
SET devwiki:learning:price 100 EX 30
GET devwiki:learning:price
TTL devwiki:learning:price
DEL devwiki:learning:price
~~~

RabbitMQ 管理頁的主要 Queue：`devwiki.orders.notifications`處理通知，`devwiki.orders.retry.500ms`等待重試，`devwiki.orders.dead`隔離毒訊息或三次仍失敗工作。正常處理很快時，queue 可能已為空，訂單查詢結果是更直接的完成證據。

## 收尾

以 Ctrl+C 停止 API 和 Worker，再用`pnpm lab:down`停止服務並保留 volume。再次啟動後可接續未完成的工作；故障與重送的自動驗證見下一篇。
