---
title: "資料庫容量驗證：負載、正確性與長時間運作"
description: "用代表性資料與可觀測工作量驗證設定，區分 QPS、併發、延遲及失敗。"
articleId: "data-access-load-validation"
topic: "data-access"
category: "database-scale"
order: 20
tags: ["MySQL", "PostgreSQL", "高併發", "負載驗證", "p99", "到達率", "壓測", "上億筆"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["data-access-pool-capacity", "data-access-large-table-queries"]
relatedArticles: ["dotnet-profiling", "engineering-metrics-tracing", "data-access-replication-recovery"]
applicableVersions: "以 .NET 10、MySQL 8.4（InnoDB）、PostgreSQL 18 說明；driver／EF provider 的主版相容性須各自核對。"
verifiedWith: "2026-10-09 核對官方文件；SQL 為有前提的設計示意，未執行實際 CRUD、故障切換或上億筆壓測。"
lastReviewed: "2026-10-09"
takeaway: "用代表性資料與可觀測工作量驗證設定，區分 QPS、併發、延遲及失敗。"
noteDates: []
sources: [{"title": "PostgreSQL 18：累計統計", "url": "https://www.postgresql.org/docs/18/monitoring-stats.html"}, {"title": "MySQL 8.4：Performance Schema", "url": "https://dev.mysql.com/doc/refman/8.4/en/performance-schema.html"}, {"title": "PostgreSQL 18：EXPLAIN", "url": "https://www.postgresql.org/docs/18/using-explain.html"}, {"title": "MySQL 8.4：EXPLAIN", "url": "https://dev.mysql.com/doc/refman/8.4/en/explain.html"}, {"title": "k6：到達率與負載產生器容量", "url": "https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/arrival-rate-vu-allocation/"}, {"title": "MySqlConnector：連線設定", "url": "https://mysqlconnector.net/connection-options/"}, {"title": "Npgsql：連線設定", "url": "https://www.npgsql.org/doc/connection-string-parameters.html"}]
---

## 先定義要承受的服務

「高併發」需轉成工作負載：每秒到達多少次商品查詢／下單、每次多少 SQL、讀寫比例、資料列寬、熱點、尖峰時間和可接受 p95／p99／失敗率。設定不能脫離查詢和硬體獨立保證 QPS。

本篇是驗證方法，沒有測得「上億列也可承受某數字」。新增 C# 範例只完成編譯與離線設定解析，沒有實際 CRUD、壓測或災難復原結果。

## 正確性先於吞吐量

先在隔離資料庫證明重複 request 不重複建單、同鍵不同內容會被辨識、庫存不為負、版本衝突被處理、取消／斷線後能查詢提交結果，Worker 重送也不重復業務效果。

讀寫混合負載中持續檢查這些不變量，不能只看 HTTP 200。死鎖、序列化失敗、合法庫存不足、系統錯誤要分別統計，不能把所有失敗都列為可重試。

## 資料分布與測試階段

| 階段 | 需要取得的證據 |
| --- | --- |
| 小資料正確性 | 用例、約束、冪等、交易及取消行為 |
| 代表性資料與基線 | 實際查詢計畫、欄位大小、索引、熱點與工作集 |
| 階梯負載 | 到達率增加時，等待、延遲、錯誤與資源的變化 |
| 尖峰與故障 | pool 耗盡、Redis 失效、熱 SKU、副本失效及擴容 |
| 長時間運作 | vacuum／purge、日誌、複寫與記憶體是否累積 |
| 大表與維護 | 資料逼近目標規模時的回填、索引、封存、備份及恢復 |

逐步增大資料量與負載，不只用平均分布。總列數增加但熱門區始終完整留在記憶體，不能代表冷資料查詢或跨年度維護已經驗證。若要生成一億列，需另有容量、成本、時間和清理計畫；本 Wiki 不會自動替讀者生成。

## 看見等待發生在哪裡

記錄 HTTP／Worker 完整延遲，再拆出入場等待、借池、SQL、鎖等待、提交與讀取結果。每秒完成量必須連同到達量、拒絕／逾時、pending 和測試時長一起報告。

PostgreSQL 可觀察 pg_stat_activity、累計統計、鎖等待、長交易、WAL 和 autovacuum；MySQL 可用 Performance Schema 與伺服器狀態觀察執行、鎖、I/O、InnoDB 和複寫。權限、取樣開銷與版本需核對，不直接對正式環境開啟所有收集項。

CPU、記憶體、磁碟延遲／吞吐、網路和副本落後都要接到時間軸。把「池等待很久」等同「池太小」會漏掉慢 SQL、交易熱點、連線未歸還或資料庫已過載。

## 負載產生器也有限制

固定併發的 closed model 通常等待上一輪完成，服務變慢時送入的工作也會減少；arrival-rate／open model 指定到達節奏，更能觀察持續到達時的排隊。兩者回答不同問題。

例如 k6 的到達率模式仍需足夠 VU；記錄 dropped iterations 與產生器 CPU／網路，不能把沒送出的請求算成服務達標。測量請求延遲時，應說明是否包含排隊和超時，避免只統計已成功回應的快速樣本。

## 每次只調有理由的變因

| 記錄 | 比較前後都要一致或明示 |
| --- | --- |
| 環境 | driver／DB 版本、CPU、RAM、儲存與網路、HA／持久性 |
| 資料 | 列數、bytes、分布、索引、統計、快取狀態 |
| 應用 | Pod／Worker、池總量、入場上限、重試與 deadline |
| 結果 | 到達／完成／失敗、p95／p99、等待、資源與正確性 |

先修查詢和持有時間，再量測並調整池與入場工作量；變更 work_mem、buffer pool、索引或 Pod 數都要記錄原因與結果。如果較高設定使 p99、錯誤或恢復能力變差，就不算容量改善。

可依[資料庫驗證指南](/practice/ecommerce/database-validation/)製作記錄表；規格和實際測量完成前，保留為「待驗證的容量方案」。
