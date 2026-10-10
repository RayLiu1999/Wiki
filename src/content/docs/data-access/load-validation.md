---
title: "資料庫容量驗證：負載、正確性與長時間運作"
description: "用代表性資料與可觀測工作量驗證設定，區分 QPS、併發、延遲及失敗。"
articleId: "data-access-load-validation"
topic: "data-access"
category: "database-scale"
order: 20
tags:
  - "MySQL"
  - "PostgreSQL"
  - "高併發"
  - "負載驗證"
  - "p99"
  - "到達率"
  - "壓測"
  - "上億筆"
difficulty: "intermediate"
learningDepth: "deep"
prerequisites:
  - "data-access-pool-capacity"
  - "data-access-large-table-queries"
relatedArticles:
  - "dotnet-profiling"
  - "engineering-metrics-tracing"
  - "data-access-replication-recovery"
applicableVersions: "以 .NET 10、MySQL 8.4（InnoDB）、PostgreSQL 18 說明；driver／EF provider 的主版相容性須各自核對。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-10"
takeaway: "用代表性資料與可觀測工作量驗證設定，區分 QPS、併發、延遲及失敗。"
sources:
  - title: "PostgreSQL 18：累計統計"
    url: "https://www.postgresql.org/docs/18/monitoring-stats.html"
  - title: "MySQL 8.4：Performance Schema"
    url: "https://dev.mysql.com/doc/refman/8.4/en/performance-schema.html"
  - title: "PostgreSQL 18：EXPLAIN"
    url: "https://www.postgresql.org/docs/18/using-explain.html"
  - title: "MySQL 8.4：EXPLAIN"
    url: "https://dev.mysql.com/doc/refman/8.4/en/explain.html"
  - title: "k6：到達率與負載產生器容量"
    url: "https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/arrival-rate-vu-allocation/"
  - title: "MySqlConnector：連線設定"
    url: "https://mysqlconnector.net/connection-options/"
  - title: "Npgsql：連線設定"
    url: "https://www.npgsql.org/doc/connection-string-parameters.html"
---

## 案發現場

在大型專案上線前，團隊通常會進行壓力測試。然而，許多團隊在「壓測完全通過」的自信下開跑促銷活動，卻在開賣後五分鐘遭遇資料庫全線癱瘓。

事後排查發現了典型的「假壓測」現場：
在測試（Staging）環境中，工程師使用本機壓測腳本對 API 施加 2,000 QPS 的壓力，報表顯示平均響應時間（Average Latency）僅有 8ms，錯誤率為 0%。
**然而測試環境的資料庫僅有 2,000 筆測試資料！** 整個資料庫的大小僅幾十 MB，所有的索引與資料頁（Pages）100% 常駐在資料庫的 Buffer Pool 記憶體中，資料庫執行的是純記憶體計算。

而在真實生產環境中，訂單與商品資料累積超過 6,000 萬列，資料表與索引實體大小超過 120GB，遠遠超過了資料庫主機配置的 16GB RAM。當真實流量湧入時，查詢無法在記憶體中命中，開始引發龐大的隨機磁碟 I/O；再加上雲端資料庫（如 AWS RDS EBS 或 GCP Cloud SQL Persistent Disk）的磁碟 **Burst IOPS 配額** 在 10 分鐘內被耗盡，I/O 延遲從 0.5ms 暴衝至 50ms。資料庫 CPU 飆滿，連線池枯竭，全站 API 集體 504 逾時崩潰。

---

## 反模式與正確解法

### 反模式一：在空庫或極小規模資料上進行容量驗證

在資料庫領域，**1,000 筆資料與 1,000 萬筆資料的執行計畫（Execution Plan）完全不同**。
在小表上，資料庫查詢最佳化器會判定「全表掃描（Sequential Scan）」比「索引掃描」更快；但在大表上，全表掃描是致命災難。若未在等比規模資料下進行驗證，所有的測試結論毫無價值。

### 正確解法一：資料規模鋪底與真實讀寫混和模型

在執行容量驗證前，必須進行「資料鋪底（Data Seeding）」：
1. **等比資料量鋪底**：透過腳本生成至少達到生產預期規模 80%~100% 的真實假資料（包含歷史資料分佈與冷熱傾斜）。
2. **模擬真實讀寫比**：嚴禁只壓測純讀取或純寫入。生產環境的資料庫通常是「80% 查詢 + 15% 更新 + 5% 插入」。混和負載能真實暴露出 Buffer Pool 汰換競爭與鎖等待。

---

### 反模式二：使用封閉模型（Closed Model / 固定 VU）掩蓋系統雪崩

很多壓測工具（如早期的 JMeter 或預設設定的 k6）採用「固定虛擬用戶數（Virtual Users, VU）」的封閉模型：每個 VU 發送一個請求，等待回應後才發送下一個請求。
當伺服器變慢時，VU 的發送頻率也跟著變慢，**反而幫伺服器減壓**！這完全違背了現實世界：在真實促銷時，使用者的湧入是**開放模型（Open Model）**——不管你的伺服器是快是慢，每秒固定就是有 3,000 名使用者點擊購買。

### 正確解法二：採用 k6 到達率模型（Constant Arrival Rate）

必須使用基於到達率（Arrival Rate）的開放模型進行驗證，以真實的 QPS 恆定注入流量，精確觀察系統在過載時的 p99 / p999 延遲表現：

```javascript
// load-test-arrival-rate.js: 現代 k6 開放到達率壓測腳本
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    constant_request_rate: {
      executor: 'constant-arrival-rate',
      rate: 1500, // 每秒恆定發送 1,500 次請求（QPS）
      timeUnit: '1s',
      duration: '10m', // 持續 10 分鐘
      preAllocatedVUs: 100, // 預先分配的虛擬用戶
      maxVUs: 500, // 當延遲上升時允許擴展的最大 VU，保證 QPS 不降低
    },
  },
  thresholds: {
    // 嚴格品質指標：99% 的請求必須在 100ms 內完成，失敗率必須小於 0.1%
    http_req_duration: ['p(95)<50', 'p(99)<100'],
    http_req_failed: ['rate<0.001'],
  },
};

export default function () {
  const url = 'http://ecommerce-api.internal/api/products/search?keyword=electronics';
  const res = http.get(url);

  check(res, {
    'status is 200': (r) => r.status === 200,
  });
}
```

---

### 反模式三：僅做短暫 5 分鐘壓測，忽略浸泡測試（Soak Testing）

短時間壓測只能驗證靜態吞吐量，無法暴露出**慢毒性問題**：例如每次查詢洩漏 1 個連線、記憶體微小洩漏、或是 Autovacuum 追不上 Dead Tuples 導致的漸進式磁碟膨脹。

### 正確解法三：執行 12~24 小時長時間浸泡測試（Soak Testing）

在正常峰值 70% 的負載下持續運作 12 至 24 小時，重點觀測：
1. **.NET 應用端**：GC Gen2 回收頻率、連線池借用數是否維持恆定（無連線洩漏）。
2. **資料庫端**：活躍連線數、Buffer Pool 命中率、WAL/Binlog 產生速率、Dead Tuples 是否能被穩定清理。

---

## 踩坑與避坑指南

### 1. 雲端磁碟 Burstable IOPS 的陷阱
- **踩坑點**：AWS EBS (gp2/gp3) 與 GCP Cloud SQL Persistent Disk 在容量較小（如 100GB）時，提供短暫的「突波 IOPS 配額（Burst Bucket）」。在前 15 分鐘壓測中表現完美，但一旦 Burst 點數耗盡，磁碟 IOPS 被硬生生砍回基線（Baseline），系統瞬間崩潰。
- **避坑規則**：容量驗證至少需要**持續 30 分鐘以上**，確保測試跨越了雲端儲存的突波視窗。

### 2. 壓測機（Load Generator）自身瓶頸誤判
- 當報告顯示大量逾時時，先檢查壓測機本體：
  - 是否觸發了 Linux `ephemeral port exhaustion`（本地 Socket 耗盡）？
  - 壓測機 CPU 是否達到 100%？
- 建議使用多台壓測機分散發送，或利用 Grafana Cloud k6 分散式叢集。

### 3. 正確解讀平均值（Average）的謊言
- 平均響應時間（Average）會掩蓋嚴重的長尾問題。若 99 個人花費 5ms，1 個人花費 10,000ms，平均值僅為 104ms（看似正常），但那個 1% 的用戶在真實世界代表了數千筆卡死在資料庫的客訴！**容量驗證永遠以 p95、p99 與 p999 為準。**

---

## 線上排查指令

### 1. 壓測期間即時監控資料庫等待事件

```sql
-- PostgreSQL: 檢視目前是否有大量行程卡在 I/O 等待
SELECT wait_event_type, wait_event, count(*)
FROM pg_stat_activity
WHERE state = 'active'
GROUP BY wait_event_type, wait_event
ORDER BY count(*) DESC;
```
若 `wait_event_type` 大量出現 `IO`（例如 `DataFileRead`），代表查詢嚴重穿透至磁碟，Buffer Pool 嚴重不足。

```sql
-- MySQL: 檢視當前等待鎖與 I/O 的執行緒
SELECT THREAD_ID, EVENT_NAME, TIMER_WAIT / 1000000000 AS wait_ms
FROM performance_schema.events_waits_current
ORDER BY TIMER_WAIT DESC
LIMIT 10;
```

### 2. 檢測作業系統與磁碟真實延遲

在資料庫節點或透過雲端監控觀察磁碟佇列與延遲：
```bash
# 即時查看磁碟讀寫延遲與佇列長度（await 單位為毫秒）
iostat -xz 1
```
重點關注 `%util`（磁碟利用率是否接近 100%）與 `r_await`（讀取延遲是否大於 10ms）。

### 3. Prometheus / Grafana 壓測核心關聯指標

```text
# QPS 與 p99 延遲關聯對照
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[1m])) by (le))

# 資料庫連線池等待排隊數（若大於 0 代表應用端池容量不足或資料庫已超載）
dotnet_db_connections_pending_requests > 0
```
