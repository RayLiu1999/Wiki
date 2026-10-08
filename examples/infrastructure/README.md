# Redis、RabbitMQ 與可靠訊息處理實驗

網站已提供包含環境、完整操作與驗證範圍的實作指南：`/practice/ecommerce/`。原始指南在 `src/content/handbook/practice/`。

這組範例搭配 Wiki 的「.NET 快取與可靠訊息處理」學習路徑。商品查詢示範 Redis Cache-Aside；訂單流程示範 PostgreSQL Outbox、RabbitMQ 發布確認、有限重試，以及 Inbox 與模擬通知結果的交易。

API 與 Worker 是本機執行的獨立 .NET 程序，Docker 只提供實驗服務。通知結果寫在資料庫，沒有實際寄信。Wiki 仍以靜態檔案提供文章，閱讀網站不需要啟動這些服務。

## 環境與版本

需要 Node 22.17.0、pnpm 10.16.0、.NET SDK 10.0.105，以及已啟動的 Docker／Compose v2.20 以上。SDK 更新 patch 依根目錄 global.json 的同一 feature band 規則選擇。

| 元件 | 固定版本／預設本機 port |
| --- | --- |
| Redis | 8.2.10-alpine／16379 |
| RabbitMQ | 4.3.6-management-alpine／AMQP 5673、管理介面 15673 |
| PostgreSQL | 18.6-alpine／15432 |
| API | .NET 10／5080 |
| .NET 用戶端 | StackExchange.Redis 3.3.1、RabbitMQ.Client 7.2.2、Npgsql 10.0.3 |
| 快取與 DI 套件 | Microsoft.Extensions.Caching.StackExchangeRedis、DependencyInjection 10.0.5 |

Docker port 全部綁定 127.0.0.1，Compose project 使用 devwiki-labs，與網站的 devwiki 分開。第一次執行需要網路下載映像與 NuGet 套件；後續 restore 使用各專案的 packages.lock.json 與 locked mode。

指令從儲存庫根目錄執行。預設載入本目錄 .env.example；需要調整 port 或本機帳密時，複製為 .env 後修改，或提供同名環境變數。環境變數優先，.env 已被 Git 忽略。範例帳密僅供這個本機實驗。

~~~sh
cp examples/infrastructure/.env.example examples/infrastructure/.env
pnpm lab:up
~~~

啟動成功後可開啟 http://127.0.0.1:15673/，使用設定中的 RabbitMQ 帳密與 devwiki vhost。

## 先執行兩個小範例

~~~sh
pnpm lab:redis
pnpm lab:rabbit
~~~

指令先還原及編譯，再執行對應程式。RedisDemo 使用共享 ConnectionMultiplexer、IDistributedCache、Hash 與 TTL，輸出：

~~~text
IDistributedCache: 商品快取
Hash: 商品名稱
String TTL 已設定: True
~~~

RabbitMqDemo 建立專屬拓樸，發布一個有穩定 MessageId 的事件，等待 Publisher Confirm，讀取後手動 Ack，最後移除自己的示範 Queue 與 Exchange：

~~~text
發布確認: broker 已接收
消費內容: 商品 1，數量 2
消費確認: 已完成處理
~~~

pnpm 的指令與 .NET build 本身也會有輸出；自動驗證核對的是範例程序的上述三行。

## 跑商品快取與訂單流程

在第一個終端機啟動 API：

~~~sh
pnpm lab:api
~~~

在第二個終端機查詢商品、更新價格：

~~~sh
curl http://127.0.0.1:5080/products/1
curl http://127.0.0.1:5080/products/1
curl -X PUT http://127.0.0.1:5080/products/1/price -H 'Content-Type: application/json' -d '{"price":120.00}'
curl http://127.0.0.1:5080/products/1
~~~

回應的 source 表示 redis、database 或 database-fallback。首次來源依既有快取而定；重複查詢通常命中 Redis。價格更新先提交 PostgreSQL，再移除商品快取，下一次查詢重載目前資料與遞增 version。這個順序仍存在並行回填與失效失敗窗口，沒有強一致性保證。

先讓 Worker 保持停止，再建立訂單：

~~~sh
curl -i -X POST http://127.0.0.1:5080/orders -H 'Content-Type: application/json' -d '{"productId":1,"quantity":2}'
~~~

成功回應是 HTTP 201，包含 orderId、messageId 與 Location。把實際 orderId 填入下列網址：

~~~sh
curl http://127.0.0.1:5080/orders/你的-orderId
~~~

此時 notificationRecorded 為 false。另開終端機啟動 Worker，稍後重查相同訂單：

~~~sh
pnpm lab:worker
~~~

notificationRecorded 變成 true，表示 Inbox 與一筆模擬通知已在交易中提交。API 回應成功只代表訂單與 Outbox 已提交，後續工作可以晚一些完成。再次啟動 Worker 會接續待發布工作。

可使用 Ctrl+C 停止各 .NET 程序。容器與本機實驗資料保留到下一次練習。

## 觀察 Key 與佇列

~~~sh
pnpm lab:redis-cli
~~~

在 redis-cli 中可查看 TTL、記憶體及持久化狀態：

~~~text
TTL devwiki:products:v1:1
INFO memory
INFO stats
INFO persistence
~~~

RabbitMQ 管理介面可查看以下主要佇列：

| Queue | 用途 |
| --- | --- |
| devwiki.orders.notifications | 等待通知 Consumer 的訂單事件 |
| devwiki.orders.retry.500ms | 暫時失敗後等待 500ms，再經 DLX 回到事件 Exchange |
| devwiki.orders.dead | 毒訊息或三次處理仍失敗的工作 |

三次包含初次處理；x-lab-attempt 使用 0、1、2。教學程式將已確認的重試副本發布到 retry Exchange，成功後才 Ack 原訊息。未知確認結果仍可能重送，因此 Inbox 去重不可省略。死信保留供診斷；本例沒有自動重新投遞死信的操作。

## 程式與交易邊界

~~~mermaid
flowchart LR
  API["OrderApi"] -->|商品查詢| Redis["Redis 副本"]
  API -->|回源與訂單加 Outbox 交易| DB["PostgreSQL"]
  Publisher["Worker 發布器"] -->|讀取待發布事件| DB
  Publisher -->|發布並等待 Confirm| MQ["RabbitMQ"]
  MQ -->|事件| Consumer["Worker Consumer"]
  Consumer -->|Inbox 加模擬通知交易| DB
  Consumer -->|提交後 Ack| MQ
~~~

| 位置 | 責任 |
| --- | --- |
| Common/CachedProducts.cs | 讀取命中、TTL、資料庫回源與更新後失效 |
| Common/OrderStore.cs | 商品與訂單存取、Outbox／Inbox 的本地交易 |
| Common/Broker.cs | 拓樸、確認發布、Dispatcher、手動 Ack、重試與死信 |
| Common/Contracts.cs | orders.placed.v1 契約與輸入驗證 |
| Common/LabDiagnostics.cs | ActivitySource、Meter 與用例計數器 |
| OrderApi、OrderWorker | HTTP 輸入與狀態查詢、獨立背景工作程序 |
| IntegrationChecks | 真實服務的行為與故障窗口驗證 |
| schema.sql | 初始化五張表、約束、索引、範例商品及資料庫註解 |

schema.sql 只在全新的 PostgreSQL volume 初始化時執行。所有資料表與欄位都具有持久化 COMMENT；測試會從 PostgreSQL metadata 核對。這是教學初始化檔，未提供既有正式資料庫的升級 migration。

事件使用穩定 MessageId 重送；Outbox 發布確認與 published_at 更新之間仍可能中斷。Inbox 的主鍵是邏輯 Consumer 名稱與 MessageId，模擬通知另以 order_id 保護業務結果。兩者與通知在同一個資料庫交易提交。

## 自動驗證

~~~sh
pnpm test:snippets
pnpm test:infrastructure
~~~

test:snippets 比對六段文章 C# 與可編譯來源，避免文章與範例分歧。test:infrastructure 建立唯一 Compose project、隨機本機 port、隨機測試帳密與全新 volume；不使用手動 devwiki-labs 的資料，結束時清理自己的容器與 volume。

驗證包含：

- 兩個入門範例的編譯、執行與預期輸出。
- 商品冷讀、命中、更新失效、TTL、損壞快取、不存在商品與 Redis 停機回源。
- Outbox 寫入失敗的訂單回滾、無路由發布失敗後保留工作與修復恢復。
- Inbox／通知一起回滾、並行重複事件、資料提交後 Ack 前關閉 Channel 的重送。
- 暫時失敗兩次後成功、持續失敗三次後進死信、毒訊息直接隔離。
- PostgreSQL 表與欄位註解、數量約束、HTTP 金額與商品邊界。
- W3C traceparent 經 Outbox 與 Broker 傳入 Consumer Activity。
- Redis AOF 確認後恢復、RabbitMQ 已確認耐久工作的容器重啟恢復。
- HTTP 建立訂單後，由另一個程序的 Worker 完成模擬通知。

追蹤測試使用 ActivityListener，未安裝 OpenTelemetry exporter 或 Collector。單節點容器沒有驗證 Cluster、Sentinel、多 Broker 故障切換、正式負載、斷電資料保留或真實郵件供應商。

## 停止與重建

~~~sh
pnpm lab:down
~~~

此指令移除 devwiki-labs 的容器與網路，保留 volume。要把自己的實驗商品、訂單與佇列全部重設，先停止 API／Worker，再明確移除該 project 的 volume：

~~~sh
docker compose --env-file examples/infrastructure/.env.example --project-name devwiki-labs --file examples/infrastructure/compose.yaml down --volumes
pnpm lab:up
~~~

若使用自訂 .env，將 --env-file 改為該檔案。這個重設指令會刪除 devwiki-labs 的實驗資料；不要改成其他共用 project 的名稱。
