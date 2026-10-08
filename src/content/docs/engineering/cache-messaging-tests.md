---
title: "快取與訊息系統的測試及故障診斷"
description: "用真實容器與可觀察結果，驗證商品快取、Outbox、重試、重送及模擬通知的恢復。"
articleId: "engineering-cache-messaging-tests"
topic: "engineering"
category: "testing"
order: 3
tags: ["整合測試","Redis","RabbitMQ","PostgreSQL","Outbox","故障演練","OpenTelemetry","traceparent","metrics","DLQ"]
difficulty: "intermediate"
prerequisites: ["engineering-business-tests","engineering-metrics-tracing","architecture-outbox-inbox","redis-reliability"]
relatedArticles: ["rabbitmq-retries-idempotency","rabbitmq-queues-ordering","redis-cache-aside"]
applicableVersions: "以 .NET 10、Redis 8.2.10、RabbitMQ 4.3.6、PostgreSQL 18.6 的教學案例說明。"
verifiedWith: "已執行隔離容器、HTTP 與故障恢復測試，並以 ActivityListener 核對 traceparent；未驗證 OpenTelemetry exporter、Collector 或正式環境監控。"
lastReviewed: "2026-10-08"
takeaway: "測試應確認使用者需要的資料與結果；重送、回滾、服務停止與重啟要用真實邊界驗證。"
noteDates: []
sources: [{"title":"Microsoft Learn：測試策略","url":"https://learn.microsoft.com/en-us/ef/core/testing/choosing-a-testing-strategy"},{"title":"RabbitMQ：Reliability","url":"https://www.rabbitmq.com/docs/reliability"},{"title":"Redis：Persistence","url":"https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/"},{"title":"Microsoft Learn：分散式追蹤","url":"https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing-instrumentation-walkthroughs"},{"title":"OpenTelemetry：.NET Instrumentation","url":"https://opentelemetry.io/docs/languages/dotnet/instrumentation/"}]
---

## 測試保護什麼結果

商品更新後應讀到新價格；訂單與待發布事件一起存在；相同事件重送不應新增第二筆模擬通知；失敗工作應有限重試並保留人工處理入口。這些結果比「某個 mock 方法被呼叫」更能保護用例。

本例沒有額外的領域計算模型。數量、金額與交易邊界主要透過 HTTP 與實際 PostgreSQL 約束核對；若加入庫存或付款規則，應再為領域不變量安排獨立單元測試。

## 使用與範例相同的實際引擎

pnpm test:infrastructure 啟動唯一 Compose project、隨機本機 port 與全新的 volume，使用 Redis 8.2.10、RabbitMQ 4.3.6 與 PostgreSQL 18.6。程式結束後只清理自己建立的測試容器與 volume。

此處採用 Compose 管理容器生命週期，沿用專案既有工具；資料庫仍使用範例的 PostgreSQL 引擎，沒有用替身或 SQLite 推論真實約束、交易與佇列語意。測試有總期限與條件輪詢，不依賴很長的固定 sleep。

~~~sh
pnpm test:infrastructure
~~~

首次執行需要網路下載映像與 NuGet 套件。固定版本與 packages.lock.json 支援後續重現；Docker socket 的存取依主機設定而定。

## 以失敗窗口安排斷言

| 情境 | 應觀察的結果 |
| --- | --- |
| 冷讀、重讀、TTL 到期 | 資料正確，來源與資料庫讀取次數符合流程 |
| 商品更新與快取損壞 | 重新載入目前資料；不是把損壞內容回傳 |
| Redis 不可連線或服務停止 | 商品仍由資料庫取得，來源表示降級 |
| Outbox 寫入失敗 | 新訂單與事件一起回滾 |
| Consumer 效果寫入失敗 | Inbox 也回滾，修復後可以重送 |
| 相同事件並行／Ack 前中斷 | 通知結果只有一筆 |
| 暫時失敗、達重試上限、毒訊息 | 分別恢復成功、進入死信、直接隔離 |
| Broker 無法路由／重新啟動 | 發布失敗可被觀察；耐久工作重啟後可繼續 |
| Schema metadata | 每張表與每個欄位的說明真的存在於 PostgreSQL |

HTTP 驗證另外核對不存在商品、非法件數、金額格式與建立訂單後的狀態查詢。測試直接斷言資料庫結果與訊息內容，而非只確認連線成功。

## 指標與追蹤各自提供線索

LabDiagnostics 提供 cache hits／misses／errors，以及 processed／duplicates／retried／dead_lettered counters。API、發布與 Consumer 的 context 透過 Outbox trace_parent 與 AMQP header 傳遞，Consumer 可建立 ActivityKind.Consumer span。

ActivitySource 與 Meter 是 instrumentation 入口；需要 listener 或 OpenTelemetry pipeline 才能採集。本次程式提供 context 與測量入口，沒有啟動外部 collector、exporter 或追蹤後台，不能據此宣稱完整跨服務匯出已驗證。

正式觀測可再加入快取延遲、資料庫回源、Outbox 最舊未發布時間、ready／unacked、處理時間、重試與死信年齡。不要將每筆 MessageId、訂單 ID 或 trace-id 放進 metrics label，避免高基數；必要識別碼可放在受控 log／trace。

## 從積壓往回找原因

ready 增加時，先確認 Consumer 數量與處理速度；unacked 高時，檢查慢查詢、外部等待、Prefetch 與漏 Ack；死信增加時，分開看契約錯誤與持續服務故障；Outbox 變舊時，檢查發布器、路由與 Confirm。

Redis 失效與回源飆高時，核對過期、淘汰、記憶體與網路錯误，再查看資料庫容量。單一節點的正常停止與重啟不涵蓋多節點選主、磁碟毀損、網路分割、實際郵件效果或正式環境的高可用性。
