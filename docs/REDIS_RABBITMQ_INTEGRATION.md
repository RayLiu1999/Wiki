# Redis／RabbitMQ 整合紀錄

整理日期：2026-10-08（Asia/Taipei）。

依使用者確認的規劃，加入 Redis、RabbitMQ 與可靠訊息處理。新增內容使用獨立技術整理，沒有新增或虛構工作筆記日期；文章的 noteDates 保持空陣列。既有筆記對照與兩條學習路徑保留。

## 內容與導覽

| 主題 | 本次新增 | 完成後總數 |
| --- | --- | --- |
| Redis | 6 篇 | 6 篇 |
| RabbitMQ | 6 篇 | 6 篇 |
| 架構設計 | 通訊選擇、Outbox／Inbox 2 篇 | 4 篇 |
| 測試與觀測 | 快取及訊息故障測試 1 篇 | 3 篇 |
| 全站 | 新增 15 篇 | 8 個主題、63 篇文章 |

Redis 依基礎與資料模型、快取與應用、可靠性與維運分類；RabbitMQ 依基礎與路由、.NET 整合、可靠性與維運分類。每篇提供固定 articleId、先備與相關文章、適用版本、驗證紀錄、最近審閱日期及官方來源。

新增 /learning-paths/dotnet-cache-messaging/，共 5 階段、23 篇文章：

1. 以 6 篇既有文章建立非同步、取消、Channel、DI、Host 與本地交易邊界。
2. 用 6 篇 Redis 文章理解資料模型、快取與故障。
3. 用 4 篇 RabbitMQ 文章建立路由、用戶端及確認流程。
4. 以 4 篇文章處理重試、順序、通訊選擇與 Outbox／Inbox。
5. 用 3 篇測試及觀測文章核對結果與故障窗口。

首頁、主題總覽、Starlight 導覽、Pagefind 與 PWA 均納入新內容。既有 Channel、交易、應用程式模式、DI、Dapr、Host、測試與追蹤文章補上交叉連結。主題基本頁及新路徑加入預快取，文章維持成功閱讀後快取，最多 40 篇、30 天。

## 可執行實驗

實驗位於 [examples/infrastructure](../examples/infrastructure/README.md)，使用固定 Redis 8.2.10、RabbitMQ 4.3.6、PostgreSQL 18.6 與 .NET 10。套件版本集中在 Directory.Packages.props，各專案保存 NuGet lockfile。

Docker 只提供三個實驗服務，API 與 Worker 是獨立本機程序。手動環境使用 devwiki-labs project 與獨立本機 port；自動測試使用唯一 project、隨機 port、隨機帳密及全新 volume，完成後清理自身資料。

| 程序／元件 | 實作結果 |
| --- | --- |
| RedisDemo | IDistributedCache、共享連線、Hash 與 String TTL |
| RabbitMqDemo | 唯一示範拓樸、確認發布、讀取與手動 Ack |
| OrderApi | 商品 Cache-Aside、更新後失效、訂單交易及狀態查詢 |
| OrderWorker | Outbox 發布器、Consumer、最多三次處理、500ms 重試與死信 |
| OrderStore | 同一交易寫訂單與 Outbox、同一交易寫 Inbox 與模擬通知 |
| LabDiagnostics | ActivitySource、Meter、traceparent 與用例計數器 |
| IntegrationChecks | 真實服務與故障窗口的行為驗證 |

PostgreSQL 初始化包含五張表、所有表與欄位的持久化註解、主鍵、外鍵、數量／金額約束及待發布索引。schema.sql 僅供全新 volume 初始化；沒有提供正式資料庫的升級 migration。

商品副本除了 JSON 解析，還檢查 Key 對應 ID、名稱、版本及金額。Redis 錯誤或副本不符契約時回源 PostgreSQL。更新提交與 Redis 失效不屬同一交易，仍以有限 TTL 接受一致性窗口。

Broker 使用持久 Exchange、單節點 Quorum Queue、persistent 訊息、mandatory 與 Publisher Confirm。Outbox 只有確認後才標記發布；Consumer 只有 Inbox 與模擬通知提交後才 Ack。重試副本確認後才 Ack 原訊息，仍保留中斷重複窗口，結果以資料庫約束去重。

## 驗證結果

| 驗證 | 本機結果 |
| --- | --- |
| pnpm check | 型別、lint、六個文章片段核對、四個收藏測試與正式建置通過 |
| 靜態產物 | 81 個頁面、63 篇文章的搜尋目錄、麵包屑、內部連結、錨點與離線路由一致 |
| .NET 編譯 | 六個專案通過；SDK 10.0.105，0 warning、0 error |
| Redis 行為 | 冷讀、命中、更新失效、TTL、損壞／錯誤商品副本、不存在商品與停機回源通過 |
| 本地交易 | Outbox 寫入失敗時訂單回滾；通知結果失敗時 Inbox 回滾通過 |
| RabbitMQ 恢復 | 無路由失敗保留 Outbox，修復後發布；提交後 Ack 前中斷與並行重送皆只有一份通知結果 |
| 重試與死信 | 暫時失敗兩次後成功、持續失敗三次後隔離、毒訊息與無效 header 直接死信通過 |
| 重啟 | Redis AOF 確認後的值恢復；RabbitMQ 已確認耐久工作重啟後繼續處理 |
| HTTP／獨立 Worker | 無效件數、未知商品及非法金額的邊界；建立訂單、查詢狀態及另一程序完成工作通過 |
| 追蹤與 Schema | ActivityListener 核對 Consumer 的 trace／parent；實際 PostgreSQL metadata 核對表與欄位註解 |
| 容器網站 | 獨立 Nginx 容器的 80 個正常頁面、63 篇文章、搜尋／PWA 資源、快取標頭、轉址與 404 通過 |
| 瀏覽器 | 八個主題、23 篇學習路徑、Redis 分類篩選、Outbox 全文搜尋可見 |
| 手機寬度 | 360 × 844 下，Outbox 與 Cache-Aside 的程式碼、RabbitMQ 佇列文章表格無整頁水平溢出；檢查後恢復原 viewport |
| 新文章離線 | 停止此次 4322 預覽並確認連線失敗後，Redis Cache-Aside 與 RabbitMQ 佇列文章完整重讀；未快取的併發文章顯示離線提示，保留網址並列出三篇已快取文章 |

容器驗證只移除本次建立的暫存 project；既有網站與其他服務未被替換。操作步驟、預期輸出、API curl 及手動環境資料重設集中在實驗 README。

## 實測範圍

通知效果是 PostgreSQL 中的模擬結果，未實際寄信。單節點實驗不代表 Redis Cluster／Sentinel、多 Broker 高可用性、斷電資料保留或正式負載驗證。Redis Lua 限流、分散式鎖、Streams 與 Dapr 僅作概念及官方文件說明。

追蹤 context 已驗證，但沒有安裝 OpenTelemetry exporter 或 Collector。Cache-Aside 的並行競態、快取失效失敗與降級流量需要依正式用例再設計。既有 ASP.NET／EF／Dapr 等其他整合片段的未執行範圍維持原有標記。

新增 GitHub Actions 的 infrastructure-examples job，沿用既有網站、C# 範例與容器 job。本次完成本機驗證；遠端 CI、正式發布與手機實機安裝尚未執行。
