---
title: "讀副本與復原：延遲、Failover 和備份"
description: "設計讀寫路由、提交結果查詢與復原驗證，連回 GKE 與 Cloud SQL。"
articleId: "data-access-replication-recovery"
topic: "data-access"
category: "database-scale"
order: 19
tags: ["MySQL", "PostgreSQL", "Cloud SQL", "Read Replica", "Failover", "PITR", "RPO", "RTO"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["data-access-pool-capacity", "data-access-concurrent-crud"]
relatedArticles: ["gke-data-services", "kubernetes-autoscaling", "engineering-recovery-cost", "data-access-load-validation"]
applicableVersions: "以 .NET 10、MySQL 8.4（InnoDB）、PostgreSQL 18 說明；driver／EF provider 的主版相容性須各自核對。"
verifiedWith: "2026-10-09 核對官方文件；SQL 為有前提的設計示意，未執行實際 CRUD、故障切換或上億筆壓測。"
lastReviewed: "2026-10-09"
takeaway: "設計讀寫路由、提交結果查詢與復原驗證，連回 GKE 與 Cloud SQL。"
noteDates: []
sources: [{"title": "PostgreSQL 18：高可用與複寫", "url": "https://www.postgresql.org/docs/18/high-availability.html"}, {"title": "Npgsql：failover 與讀取路由", "url": "https://www.npgsql.org/doc/failover-and-load-balancing.html"}, {"title": "Cloud SQL：從 GKE 連接 PostgreSQL", "url": "https://docs.cloud.google.com/sql/docs/postgres/connect-kubernetes-engine"}, {"title": "PgBouncer：池模式與相容性", "url": "https://www.pgbouncer.org/features.html"}]
---

## 下單後立刻看見訂單

主庫提交與副本重放有時間差。下單成功後若立即從非同步副本查詢，可能暫時找不到訂單；列表舊版本也不表示剛才寫入失敗。庫存決策、冪等結果查詢與需要 read-after-write 的操作，應使用能滿足一致性要求的來源。

允許延遲的商品資訊／歷史列表可以分擔到副本，但先定義可接受的新鮮度。固定等待幾秒或短暫 sticky routing 不保證任何情境都已追上。若使用複寫位置等待，需要具體的 PostgreSQL／MySQL 與平台能力，並定義逾時結果。

## 路由也是容量設計

讀副本能分攤某些讀取，不會自動提高主庫寫入能力。主副本通常各有池與連線預算；副本故障後若所有讀取回主庫，要重新核對負載及限流。交易內的讀寫應保持所需的同一資料來源與連線，不能讓通用讀取方法任意切換端點。

Npgsql 的多主機／目標 session 能力需按版本、端點和部署核對。MySQL 的複寫／HA 模式、driver 與服務入口也各有分工，不能把 PostgreSQL 的設定直接搬過去。

## Failover 不是重試所有 SQL

失效端點上的既有連線可能中斷；池內連線健康、服務 discovery、DNS、重新連線與整體 deadline 都要驗證。Connection Lifetime 可協助輪替，不能保證正在執行的交易平安搬到新主庫。

如果 COMMIT 附近斷線，應用可能不知道資料是否已持久化。先以穩定 request／order id 查詢權威結果，再按業務規則決定重試；把整個 POST 無條件重送會產生重複風險。連線錯誤、讀取重試與寫入重試應有不同判斷。

## GKE 與 Cloud SQL 的責任

| 元件 | 提供什麼 | 仍需應用處理 |
| --- | --- | --- |
| Cloud SQL（MySQL／PostgreSQL） | 受管資料庫能力；依實際規格設定 HA、備份與連線限制 | 模型、查詢、交易、工作量及恢復目標 |
| Cloud SQL Auth Proxy／Connector | 服務連線與驗證機制 | driver 的池、SQL 權限與併發預算 |
| PgBouncer | PostgreSQL 連線重用；池模式有相容性差異 | session 行為、交易、查詢與過載 |
| HPA／Rolling Update | 增加或替換應用 Pod | 所有程序合計的池上限與主庫承受量 |

雲端身分、網路可達、資料庫帳號權限和 TLS 是不同檢查點。Proxy 能建立安全路徑，不是通用 SQL 連線池或查詢加速器。擴容時包含 rollout 額外 Pod、Worker、migration、監控和備援容量。

## 備份要以恢復結果驗證

高可用與複寫仍可能傳播誤刪或錯誤寫入，不能代替備份。依業務定義可接受資料遺失（RPO）與恢復時間（RTO），核對備份、日誌保留、時間點恢復和跨故障範圍的能力。

演練需在隔離環境恢復到指定時間，驗證 schema、訂單／明細完整性、去重記錄及應用連線，記下真正耗時。備份 job 成功不等於已達成恢復目標。

效能比較也應記錄 durability 與 HA 設定；不能關掉提交持久性後仍宣稱提供相同訂單可靠性。本專題沒有執行 Cloud SQL 建立、failover 或恢復演練，跟做方式見[驗證指南](/practice/ecommerce/database-validation/)。
