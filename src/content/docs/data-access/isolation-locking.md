---
title: "MySQL／PostgreSQL 隔離、鎖與重試差異"
description: "分清快照、鎖定讀、競爭更新與重試單位，避免跨資料庫照搬一致性假設。"
articleId: "data-access-isolation-locking"
topic: "data-access"
category: "database-concurrency"
order: 15
tags: ["MySQL", "PostgreSQL", "MVCC", "Repeatable Read", "Read Committed", "SKIP LOCKED"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["data-access-transactions"]
relatedArticles: ["data-access-concurrent-crud", "architecture-outbox-inbox"]
applicableVersions: "以 .NET 10、MySQL 8.4（InnoDB）、PostgreSQL 18 說明；driver／EF provider 的主版相容性須各自核對。"
verifiedWith: "2026-10-09 核對官方文件；SQL 為有前提的設計示意，未執行實際 CRUD、故障切換或上億筆壓測。"
lastReviewed: "2026-10-09"
takeaway: "分清快照、鎖定讀、競爭更新與重試單位，避免跨資料庫照搬一致性假設。"
noteDates: []
sources: [{"title": "MySQL 8.4：InnoDB 隔離層級", "url": "https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-isolation-levels.html"}, {"title": "PostgreSQL 18：交易隔離", "url": "https://www.postgresql.org/docs/18/transaction-iso.html"}, {"title": "PostgreSQL 18：鎖定", "url": "https://www.postgresql.org/docs/18/explicit-locking.html"}, {"title": "MySQL 8.4：減少與處理死鎖", "url": "https://dev.mysql.com/doc/refman/8.4/en/innodb-deadlocks-handling.html"}]
---

## 同樣叫交易，不代表同樣可見資料

買家查到庫存 3，再下單保留 2。在兩個 statement 之間，其他買家可能已提交。選擇隔離層級前，先問業務要保護哪個條件，與哪些操作一起提交；隔離名稱不會自動完成整個保留流程。

| 差異 | MySQL 8.4 InnoDB | PostgreSQL 18 |
| --- | --- | --- |
| 預設隔離 | Repeatable Read | Read Committed |
| 一般讀取 | RR 下的非鎖定一致讀通常使用首個一致讀建立的交易快照 | RC 下各 statement 取得對應快照 |
| 鎖定讀／修改 | 與一般快照讀不同；範圍鎖受索引、條件與隔離影響 | 列鎖、競爭 UPDATE 與快照有自己的規則 |
| Serializable | 更強隔離仍需處理等待與失敗 | 可能因序列化相依而中止，應準備重試交易 |

實際值可能已被 session 或平台設定修改，測試時需記錄。PostgreSQL 的 Read Uncommitted 會按 Read Committed 處理；不能推論兩套相同名稱的所有行為都一致。

## 索引決定的不只是速度

需要更新一件商品時，讓查詢用相應索引找到小範圍。掃描過多資料會增加查詢成本，也可能擴大鎖足跡。MySQL 的 next-key／gap locking 與唯一鍵精確查詢有不同情境；不要只看 WHERE 文字就認定鎖一列。

一般 SELECT、SELECT FOR UPDATE、UPDATE 不能當成同一種讀取。先畫出交易時序，再用兩個獨立 session／程序驗證實際結果與等待。

## 重試完整的交易單位

死鎖或序列化失敗後，完整回滾，重建應用所需狀態並有界重試讀取、計算和寫入。只把最後失敗 UPDATE 再執行一次，可能與前面根據舊資料計算的結果不一致。

| 失敗 | 處理方向 |
| --- | --- |
| 版本衝突／庫存不足 | 按業務規則回應，未必值得重試 |
| 可辨識死鎖／序列化失敗 | 有界退避，重試完整交易 |
| 取消或網路中斷 | 依階段判斷；提交邊界不明時查業務結果 |
| 永久輸入／約束錯誤 | 修正請求或模型，重試不會使其正確 |

錯誤分類須使用 driver 的結構化資訊，而非對錯誤文字做模糊比對；跨 provider 重新核對錯誤碼與被回滾的範圍。

## SKIP LOCKED 的使用界線

工作領取可使用適當的鎖定或 claim／lease，SKIP LOCKED 可讓 Worker 跳過已鎖工作，減少相互等待。但取得的是不完整候選集合，不適合一般需要完整可見結果的商品查詢。領取後仍需定義失敗回復、租期、去重與完成記錄。

提高隔離也不能把 HTTP 付款與資料庫合成一個原子交易。分開設計庫存、訂單狀態、付款識別與 Outbox，才能說明每個失敗時點的結果。
