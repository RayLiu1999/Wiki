---
title: "高併發 CRUD：正確結果、冪等與短交易"
description: "把新增、查詢、更新與刪除拆成可驗證的業務契約，處理競爭、重送與未知提交。"
articleId: "data-access-concurrent-crud"
topic: "data-access"
category: "database-concurrency"
order: 14
tags: ["CRUD", "高併發", "冪等", "庫存", "交易", "死鎖"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["data-access-concurrency", "architecture-outbox-inbox"]
relatedArticles: ["data-access-isolation-locking", "data-access-pool-capacity", "data-access-bulk-retention"]
applicableVersions: "以 .NET 10、MySQL 8.4（InnoDB）、PostgreSQL 18 說明；driver／EF provider 的主版相容性須各自核對。"
verifiedWith: "2026-10-09 核對官方文件；SQL 為有前提的設計示意，未執行實際 CRUD、故障切換或上億筆壓測。"
lastReviewed: "2026-10-09"
takeaway: "把新增、查詢、更新與刪除拆成可驗證的業務契約，處理競爭、重送與未知提交。"
noteDates: []
sources: [{"title": "PostgreSQL 18：交易隔離", "url": "https://www.postgresql.org/docs/18/transaction-iso.html"}, {"title": "PostgreSQL 18：鎖定", "url": "https://www.postgresql.org/docs/18/explicit-locking.html"}, {"title": "MySQL 8.4：減少與處理死鎖", "url": "https://dev.mysql.com/doc/refman/8.4/en/innodb-deadlocks-handling.html"}]
---

## 促銷時先定義什麼叫成功

買家同時送出下單請求，庫存只有 3，還可能因逾時重送。要先定義不超賣、不重複建立同一業務訂單，以及付款未完成時的狀態；吞吐量是在這些條件成立後才有意義。

## CRUD 各自的設計

| 操作 | 設計重點 | 完成證據 |
| --- | --- | --- |
| Create | 穩定 request／業務識別、唯一約束、相同鍵不同 payload 的規則 | 重送找到同一結果，交易失敗沒有留下半套資料 |
| Read | 授權條件、欄位投影、有界筆數、索引、讀副本的一致性 | 回傳正確使用者與版本；查價不假設已保留庫存 |
| Update | 條件更新／版本比對、鎖順序與交易 | 影響筆數、庫存不為負、衝突有明確結果 |
| Delete | 業務狀態、保留／稽核規則、有限批次 | 不刪除仍需履約或還原的資料；清理可恢復 |

API 冪等、SQL 交易與 Consumer Inbox 是不同邊界。資料庫只有一筆正確結果，不一定表示外部付款只執行一次；還需供應商的穩定業務鍵與對帳。

## 不把 read-modify-write 留在程序記憶體

以下是 PostgreSQL 位置參數的設計示意，假設已有具約束的 `inventory(product_id, available, version)`。`$1` 為正的保留數量，`$2` 為商品 ID。MySQL 的對應範例用 driver 參數，不直接複製 `$1`。

~~~sql
UPDATE inventory
SET available = available - $1,
    version = version + 1
WHERE product_id = $2 AND available >= $1;
~~~

這只示範同一庫存列的條件更新。用例要先拒絕零／負數，檢查影響筆數；與訂單、保留記錄和 Outbox 的共同提交需要同一資料庫交易。沒有增加庫存 schema 到目前實驗。

多人改價可用讀取時版本作更新條件。若預期更新一列但沒有匹配，區分不存在、權限或版本衝突；不能把「沒有更新」一律變成無限重試。

## 保持交易短，按固定順序鎖定

交易內只做必要讀寫，使用相應索引縮小掃描與鎖範圍；多商品按固定業務鍵順序處理。不要持有 DB 交易等待付款網路、通知或人工確認。熱點商品仍會競爭同一庫存，增開 Connection 不會把它變成多份可售庫存。

死鎖／序列化失敗應回滾並有界重試完整交易單位。網路斷在 COMMIT 邊界時，不能確認提交與否，應先按 request key 查結果，再決定下一步。

## 用業務斷言驗證併發

並行購買後，成功保留量與剩餘量要能對帳；同一 request key 只能對應一份結果；失敗交易不留下訂單／Outbox 半套資料。把熱點 key、不同 key、取消、死鎖與提交後斷線分開測量。

高寫入系統還要限制每批交易大小與外部資料流入速率，接續閱讀[隔離與鎖](/data-access/isolation-locking/)及[匯入與清理](/data-access/bulk-retention/)。
