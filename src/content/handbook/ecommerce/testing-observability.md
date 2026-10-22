---
title: "10 行為測試與端到端觀測"
description: "以商品、訂單和通知結果證明正常流程與失敗恢復。"
group: "ecommerce"
order: 10
linkedArticles: ["engineering-business-tests", "engineering-cache-messaging-tests", "engineering-metrics-tracing", "dotnet-profiling", "engineering-integration-tests", "engineering-structured-logging"]
prerequisites: ["ecommerce/reliable-events"]
sources: [{"title": "OpenTelemetry .NET", "url": "https://opentelemetry.io/docs/languages/dotnet/"}, {"title": "RabbitMQ monitoring", "url": "https://www.rabbitmq.com/docs/monitoring"}]
---

先寫下買家或店家需要的結果，再選驗證方式。商品更新後應看到新價格，訂單提交後必須留下可恢復事件，重送不能新增第二筆相同模擬通知。這些結果比驗證每個類別的內部呼叫更有意義。

## 測試分層

純金額、數量和合法狀態轉移可用快速測試。資料庫交易、唯一約束與查詢要用對應資料庫；快取、Broker Confirm、Ack 和重送則需要真實服務的整合測試。少量完整用例確認 API 與另一個程序的 Worker 能一起完成工作。

| 情境 | 要核對的結果 |
| --- | --- |
| Redis 命中、停機或損壞資料 | 商品結果正確，來源可解釋 |
| Outbox 寫入失敗 | 訂單與事件一起回滾 |
| Consumer 交易失敗 | Inbox 與通知一起回滾 |
| 提交後 Ack 前中斷 | 重送仍只有一份業務結果 |
| Broker 暫時無法交付 | 工作保留，修復後繼續發布 |
| 暫時或持續失敗 | 暫時失敗可恢復；持續失敗有限次重試後進死信；毒訊息直接隔離 |
| 服務重新啟動 | 已確認的耐久資料與工作在重啟後仍在 |

故障演練要證明的是使用者看到的結果與恢復契約，不只是程序沒有丟例外。每一項業務斷言都通過，演練才算通過。

## 隔離環境

整合測試每次都建立自己專用的資料庫、Redis 與 Broker（例如用容器），使用獨立的 port、帳密與資料，結束後清掉。這樣測試結果不會受前一次測試或手動操作留下的資料影響。

單節點容器重啟只能驗證最基本的恢復，不等於 Broker 叢集、Redis 高可用、正式負載或雲端上的故障切換。測試名稱與報告要反映實際驗證了哪些邊界。

## 一筆事件如何追查

API 的 Activity context 經 Outbox 欄位和 AMQP header 傳給 Consumer。事件 ID 關聯業務交付，trace context 關聯這次執行；重試和重送的兩種識別不能混為一談。

測試裡可以用 ActivityListener 確認 trace context 有正確傳遞。正式系統還要安裝 OpenTelemetry exporter 或 Collector，並選擇收集、保存、查詢與敏感資料政策，才能在觀測平台看到完整路徑。

## 先看症狀，再找原因

通知慢先看最老 Outbox、Queue ready／unacked、Consumer 成功與死信；商品查詢慢則分開快取、回源、池等待和程序處理。Metrics 使用有限維度；訂單 ID、MessageId 和 trace-id 放在受控日誌或 Trace。
