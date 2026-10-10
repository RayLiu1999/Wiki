---
title: "關聯資料庫查詢基礎：SQL 執行計畫、隱式型別轉換與索引失效"
description: "深入剖析 SQL 執行計畫解讀、隱式型別轉換使索引失效的根本原因、SARGable 查詢撰寫原則與覆蓋索引優化。"
articleId: "data-access-sql-foundations"
topic: "data-access"
category: "querying"
order: 3
tags: ["SQL", "執行計畫", "索引失效", "隱式轉換", "SARGable", "覆蓋索引", "PostgreSQL", "MySQL"]
articleType: "deep-dive"
prerequisites: ["data-access-ef-core", "csharp-syntax-traps"]
relatedArticles: ["data-access-type-mapping", "data-access-large-table-queries"]
applicableVersions: "SQL Server 2019+、PostgreSQL 14+、MySQL 8.0+"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "確保查詢條件滿足 SARGable 原則；C# 字串必須精確對齊 Ansi/Unicode 避免隱式轉換；杜絕在索引欄位上套用函數。"
sources:
  - title: "PostgreSQL 官方文件：Using EXPLAIN"
    url: "https://www.postgresql.org/docs/current/using-explain.html"
  - title: "Microsoft Learn：了解 SQL Server 中的執行計畫"
    url: "https://learn.microsoft.com/zh-tw/sql/relational-databases/performance/execution-plans"
---

## 案發現場

某電商平台的會員登入與查單端點在促銷期間突然變慢，單次依手機號碼查詢用戶的操作耗時從 2ms 驟增至 1,800ms，資料庫 CPU 直衝 95%。DBA 檢查表結構，確認 `MobilePhone` 欄位已建立了 B-Tree 唯一索引；然而抓取慢查詢的 **執行計畫（Execution Plan）** 卻顯示令人費解的結果：資料庫完全跳過了索引搜尋（Index Seek），而是對全表 2,000 萬筆會員進行了極其昂貴的**全表掃描（Table Scan / Seq Scan）**！

深入分析發現：資料庫欄位為 `varchar(20)`（Ansi 非 Unicode），而 C# 後端傳入參數時預設被識別為 Unicode 字串；為了完成比對，資料庫執行引擎被迫對全表每一行的欄位自動套用 `CONVERT(nvarchar, MobilePhone)` 函式，引發了後端工程師最容易忽視的**隱式型別轉換索引失效**。

## 致命反模式 vs. 正確解法

```text
【SARGable 索引直達 vs. 隱式轉換全表計算】
[❌ 隱式轉換/函數包裝] WHERE CONVERT(nvarchar, Phone) = @Param
資料庫 ──► 必須走訪每一筆資料，每行呼叫 CPU 轉型 ──► 💥 索引失效，全表掃描 2,000 萬次！

[✅ SARGable 查詢]     WHERE Phone = @Param
資料庫 ──► 參數型別與欄位精確對齊 ──► B-Tree 樹狀搜尋 (Index Seek)，O(log N) 3 次 I/O 直達！
```

### 坑一：C# 字串編碼與資料庫欄位型態不匹配

在 SQL Server 或 MySQL 中，若欄位是 `varchar`，但傳入參數未指定型別（預設 Unicode `nvarchar`），字別優先級會迫使資料庫將欄位逐行提升為 `nvarchar`，徹底廢掉 B-Tree 索引。

### 坑二：在 WHERE 條件的索引欄位外層包裝函數

使用 `WHERE YEAR(CreatedAt) = 2026` 或 `WHERE SUBSTRING(OrderNo, 1, 4) = '2026'` 會阻止資料庫利用 B-Tree 範圍檢索，必須改寫為範圍查詢 `WHERE CreatedAt >= '2026-01-01' AND CreatedAt < '2027-01-01'`。

~~~csharp title="Program.cs"
// ✅ Good：在 EF Core 與 Dapper 中明確宣告 Ansi 字串型別，確保產生 SARGable 查詢
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

Console.WriteLine("展示 SARGable 最佳化查詢模型與參數宣告");

var user = new UserAccount
{
    Id = 1,
    MobilePhone = "0912345678",
    CreatedAt = DateTime.UtcNow
};

Console.WriteLine($"會員手機號碼: {user.MobilePhone}");
Console.WriteLine("宣告 [Unicode(false)]：保證傳遞 varchar 參數，防止資料庫隱式型別轉換");

public sealed class UserAccount
{
    public int Id { get; set; }

    // 關鍵：明確宣告 Unicode(false)，EF Core 將生成 varchar 參數而非預設 nvarchar
    [Unicode(false)]
    [StringLength(20)]
    public string MobilePhone { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; }
}
~~~

預期輸出：
```text
展示 SARGable 最佳化查詢模型與參數宣告
會員手機號碼: 0912345678
宣告 [Unicode(false)]：保證傳遞 varchar 參數，防止資料庫隱式型別轉換
```

## 踩坑與避坑指南

* **SARGable（Search Argument Able）三大鐵律**：
  1. **禁止在欄位外層套用任何函數**：例如 `WHERE UPPER(Email) = 'TEST@ABC.COM'` 應改為在寫入時統一小寫儲存，查詢時使用純值比對。
  2. **禁止在欄位左側進行算術運算**：`WHERE Amount * 1.1 > 100` 應改寫為 `WHERE Amount > 100 / 1.1`。
  3. **前綴模糊查詢禁止前置萬用字元**：`LIKE '%cup'` 無法使用 B-Tree 索引，僅 `LIKE 'cup%'` 支援索引範圍搜尋。
* **覆蓋索引（Covering Index）威力**：
  在建立二級索引時，透過 `CREATE INDEX ix_orders_status ON Orders(Status) INCLUDE (TotalAmount, CreatedAt)`，將常用查詢欄位掛在葉節點。資料庫只需查閱索引本身即可回傳結果，無需再進行昂貴的「回表二次讀取（Bookmark Lookup / Key Lookup）」。
* **避坑原則（什麼時候不要建索引？）**：
  * **低區分度（Low Selectivity）欄位**：如性別或布林標記（`IsActive`）。當單一數值佔據全表 50% 以上時，B-Tree 搜尋反而比全表循序讀取更慢，資料庫優化器通常會自動放棄索引。

## 線上排查指令與監控指標

分析慢查詢與執行計畫：

```bash
# 1. PostgreSQL 取得真實執行耗時與緩衝命中計畫
EXPLAIN (ANALYZE, BUFFERS, COSTS)
SELECT "Id", "MobilePhone" FROM "Users" WHERE "MobilePhone" = '0912345678';

# 2. MySQL 8.0 樹狀格式執行計畫（尋找是否有 Type: ALL 全表掃描）
EXPLAIN FORMAT=TREE
SELECT Id, MobilePhone FROM Users WHERE MobilePhone = '0912345678';

# 3. Grafana 監控指標 (PromQL)
# 檢視資料庫未走索引的掃描行數比率（比例高代表嚴重索引失效）
rate(pg_stat_database_tup_returned[5m]) / rate(pg_stat_database_tup_fetched[5m])
```
