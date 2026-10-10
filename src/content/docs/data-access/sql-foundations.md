---
title: "SQL、約束、索引與查詢計畫"
description: "從商品與訂單說明資料完整性、查詢成本及交易隔離的基本責任。"
articleId: "data-access-sql-foundations"
topic: "data-access"
category: "querying"
order: 7
tags: ["SQL、約束、索引與查詢計畫", "data-access"]
difficulty: "intermediate"
learningDepth: "basic"
prerequisites: ["csharp-syntax-traps"]
relatedArticles: ["data-access-concurrency", "data-access-transactions"]
applicableVersions: "PostgreSQL 18；EF Core 供應商的差異另見相關文章。"
verifiedWith: "已依官方文件核對概念；文中示意片段未宣稱完成外部服務整合或效能量測。"
lastReviewed: "2026-10-08"
takeaway: "從商品與訂單說明資料完整性、查詢成本及交易隔離的基本責任。"
noteDates: []
sources: [{"title": "PostgreSQL Constraints", "url": "https://www.postgresql.org/docs/18/ddl-constraints.html"}, {"title": "PostgreSQL EXPLAIN", "url": "https://www.postgresql.org/docs/18/using-explain.html"}, {"title": "PostgreSQL Transaction Isolation", "url": "https://www.postgresql.org/docs/18/transaction-iso.html"}]
---

## 本篇的資料背景

商品、訂單與 Outbox 保存於 PostgreSQL；Redis 只保存商品副本。本篇讓讀者能分辨查詢速度與資料正確性。現有實驗有商品與訂單，完整庫存和訂單明細屬於後續案例設計。

## 約束保護什麼

主鍵保護識別，外鍵保護引用，唯一約束保護不能重複的業務鍵，CHECK 保護同一列可表達的有效範圍。應用驗證提供清楚錯誤，資料庫約束則涵蓋其他入口；兩者有各自目的。

金額的精度、數量範圍、NULL 的意義與時間格式都要明確。新增資料表和欄位使用持久化 COMMENT 記錄每列粒度、單位、來源及生命週期；現有初始化檔已採 PostgreSQL comment，修改模型時需同步 migration。

## 索引不是每個欄位都加

商品 ID 查詢、訂單買家加建立時間的排序，以及 Outbox 待送工作的掃描，有不同索引需求。複合索引的欄位順序、選擇性、排序與寫入成本要一起評估，並以實際查詢計畫核對。

以下是 PostgreSQL 查詢計畫的閱讀示意；`products` 是現有實驗的商品表，這裡沒有執行命令。

~~~sql
EXPLAIN SELECT id, name, price FROM products WHERE id = 1;
~~~

EXPLAIN 提供計畫；EXPLAIN ANALYZE 還會執行命令並量測，因此對 UPDATE／DELETE 等操作不能當成純讀取工具。小表順序掃描也可能合理，先看資料量和實際耗時。

## 交易隔離與並行

交易把一組操作放進提交／回滾邊界，隔離級別與寫入方式決定競爭下可觀察到的結果。先查到庫存 3，再各自寫回 1，可能產生遺失更新；需要條件更新、concurrency token 或適當鎖定，而非只增加交易關鍵字。

庫存、金額和訂單狀態的 schema 範例需要核對 provider 方言；SQL Server rowversion、PostgreSQL 的機制與 SQLite 行為不能直接混用。
