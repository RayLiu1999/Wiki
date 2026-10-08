---
title: "驗證故障、重送與有限恢復"
description: "用隔離的真實服務測試，核對商品結果、交易、去重與恢復範圍。"
group: "practice"
order: 3
environment: "host-compose"
verification: "已有真實服務的隔離整合檢查；各檢查的覆蓋與未涵蓋範圍見內文。"
linkedArticles: ["engineering-cache-messaging-tests", "engineering-metrics-tracing", "redis-reliability", "rabbitmq-retries-idempotency"]
prerequisites: ["practice/cache-messaging"]
sources: [{"title": "RabbitMQ reliability", "url": "https://www.rabbitmq.com/docs/reliability"}, {"title": "Redis persistence", "url": "https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/"}]
---

這份指南使用儲存庫已有的整合檢查，主動製造 Redis 停機、資料交易失敗、Channel 中斷與 Broker 重啟。目標是證明使用者結果與恢復契約，而不是只看程序沒有丟例外。

## 前提與啟動

使用準備篇的工具版本，Docker 必須執行。命令從 Wiki 根目錄執行：

~~~sh
pnpm test:snippets
pnpm test:infrastructure
~~~

第一個指令核對六段文章 C# 片段與可編譯來源，第二個建立唯一 Compose project、隨機本機 port、測試帳密與全新 volume。它使用自己的資料，結束時清理自己的容器和 volume；無需刪除手動實驗的 devwiki-labs。

## 每類檢查的業務證據

| 範圍 | 預期結果 |
| --- | --- |
| 快取 | 冷讀、命中、更新失效、TTL、損壞與 Redis 停止時商品結果正確 |
| 訂單與 Outbox | 事件寫入失敗時，訂單一起回滾 |
| 路由與發布 | 未成功交付時工作保留，修復後恢復發布 |
| Inbox 與通知 | 失敗一起回滾，重送或並行重複只有一份結果 |
| Ack 前斷線 | 已提交結果重新交付，仍不會新增重複通知 |
| 重試與死信 | 暫時失敗可恢復；持續失敗三次隔離；毒訊息直接隔離 |
| 持久化 | Redis AOF 確認後與 RabbitMQ 已確認耐久工作可在容器重新啟動後恢復 |
| 跨程序 | API 提交，另一個 Worker 程序完成模擬通知 |

測試還檢查 schema 持久化註解、輸入約束和 traceparent 傳遞。命令最終 exit code 0 才表示檢查全部通過；輸出中的失敗要修復後重跑對應檢查。

## 觀測驗證的邊界

追蹤檢查使用 ActivityListener，沒有安裝 Exporter 或 Collector。你可以看到測試核對 context 傳遞，但不能據此聲稱已經具備正式的觀測後端。

單節點容器重啟不是多 Broker、Redis Sentinel、跨區故障切換、斷電保證或災難恢復。實驗也不包含真實郵件服務；其冪等結果是資料庫中的模擬通知。

## 怎麼讀失敗

先看未通過用例與原始錯誤，分清 Docker 啟動、服務連線、編譯和業務斷言。若中斷測試，檢查殘留資源時先辨識該次唯一 project；不要刪除其他項目或日常實驗資料。

要把 Worker 搬上 Kubernetes，還需補上 SIGTERM 收尾與多發布器 claim／lease 測試。目前這組證據不會自動覆蓋那些新邊界。
