---
title: "上億筆資料的查詢：索引、投影與游標"
description: "從查詢需要的資料量出發，設計複合索引、穩定排序與 keyset pagination。"
articleId: "data-access-large-table-queries"
topic: "data-access"
category: "database-scale"
order: 16
tags: ["MySQL", "PostgreSQL", "上億筆", "複合索引", "Keyset Pagination", "EXPLAIN"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["data-access-sql-foundations", "data-access-csharp-connections"]
relatedArticles: ["data-access-bulk-retention", "data-access-partitioning-sharding", "data-access-load-validation"]
applicableVersions: "以 .NET 10、MySQL 8.4（InnoDB）、PostgreSQL 18 說明；driver／EF provider 的主版相容性須各自核對。"
verifiedWith: "2026-10-09 核對官方文件；SQL 為有前提的設計示意，未執行實際 CRUD、故障切換或上億筆壓測。"
lastReviewed: "2026-10-09"
takeaway: "從查詢需要的資料量出發，設計複合索引、穩定排序與 keyset pagination。"
noteDates: []
sources: [{"title": "EF Core：有效率的查詢", "url": "https://learn.microsoft.com/en-us/ef/core/performance/efficient-querying"}, {"title": "PostgreSQL 18：複合索引", "url": "https://www.postgresql.org/docs/18/indexes-multicolumn.html"}, {"title": "MySQL 8.4：複合索引", "url": "https://dev.mysql.com/doc/refman/8.4/en/multiple-column-indexes.html"}, {"title": "PostgreSQL 18：EXPLAIN", "url": "https://www.postgresql.org/docs/18/using-explain.html"}, {"title": "MySQL 8.4：EXPLAIN", "url": "https://dev.mysql.com/doc/refman/8.4/en/explain.html"}]
---

## 一億列，不代表每次都要讀一億列

先分清交易查詢與分析查詢。買家最近 30 筆訂單、單一訂單狀態、每月所有商家的收入報表，需要的存取方式不同。將全站統計放進每次商品請求，即使有快取也需說明重算與失效成本。

一億列若平均每列 500 bytes，單是這項乘法約 50 GB，尚未計入索引、頁面配置、額外大型欄位、版本、日誌與備份。總列數、每列大小、活躍工作集和資料分布都要記錄；不能只說「上億」就選硬體或分片。

## 從一個明確的查詢設計索引

買家訂單列表先限定 buyer_id，再依 created_at 與 id 排序。候選複合索引是 `(buyer_id, created_at, id)`；這是待驗證的模型方向，本篇沒有建立索引或 migration。

| 需要核對 | 原因 |
| --- | --- |
| 欄位型別、時區、非空與排序 | 游標必須能還原相同值和順序 |
| 篩選選擇性與熱門買家 | 平均分布可能掩蓋大商家／熱點 |
| 實際掃描列數、排序與回表 | 返回 30 列仍可能掃描大量資料 |
| 索引大小與寫入代價 | 每個新索引都要隨 INSERT／UPDATE 維護 |
| 統計資料與執行計畫 | 資料量和分布改變後，計畫也可能改變 |

複合索引的前導欄位和查詢條件密切相關，但不要寫成所有資料庫都「沒用第一欄就完全不能用索引」。例如 PostgreSQL 18 的 B-tree skip scan 有適用條件，仍由成本與實際計畫判斷。

## 用最後一列的位置翻頁

以下是 PostgreSQL／Npgsql 的查詢示意，需要既有 `orders` 表、非空 created_at，以及在買家範圍內唯一的 id。`$1` 是經權限核對的買家，`$2`／`$3` 是上一頁最後的時間與 id，`$4` 是服務端限制的頁大小。首頁另用不含游標條件的查詢。

~~~sql
SELECT id, created_at, status, total_amount
FROM orders
WHERE buyer_id = $1
  AND (created_at < $2 OR (created_at = $2 AND id < $3))
ORDER BY created_at DESC, id DESC
LIMIT $4;
~~~

MySqlConnector 要使用其命名參數，例如 `@buyerId`、`@lastCreatedAt`、`@lastId`、`@pageSize`，並核對 MySQL 時間及金額型別。不能直接把 `$1` SQL 交給另一套 driver。

時間相同時用 id 打破平手；排序欄位應保持穩定。游標需綁定買家、篩選與排序並驗證輸入，不能讓下一頁改查他人資料。這種 keyset pagination 適合連續往後看，不提供任意跳到第十萬頁；跨多個請求也不是一致快照。若期間有刪除或排序欄位更新，需定義可接受的可見結果。

## C# 不要把大量資料拉回再篩選

在 EF Core 的 IQueryable 階段完成 Where、Select、排序及 Take，再執行 SQL。唯讀結果可投影成 DTO，依需要使用 AsNoTracking；先 ToList 再篩選無法減少資料庫傳輸。一起核對 N+1、多次 round trip 與每次列表都精確 COUNT 全集的成本。

串流讀取能減少應用記憶體，但 Reader 存活時仍可能佔用連線；慢速匯出應另有批次、checkpoint 與工作量預算。不能把長時間下載綁在所有 API 共用的池裡。

## 如何證明查詢改善

先看 EXPLAIN 的估計，再在受控環境比較實際掃描、排序、buffer／I/O、回傳量和 p95／p99。EXPLAIN ANALYZE 會執行被分析的語句，寫入語句也有相應影響；它不只是查看文字。

比較相同資料分布、索引、快取狀態與負載。查詢變快後仍需檢查新增索引對寫入和維護的代價，接著閱讀[大量寫入與保留](/data-access/bulk-retention/)。
