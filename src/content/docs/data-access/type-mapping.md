---
title: "byte 與 tinyint 的供應商差異"
description: "依資料庫的有號、無號與範圍選擇 .NET 型別，避免同名型別帶來截斷與溢位。"
articleId: "data-access-type-mapping"
topic: "data-access"
category: "querying"
order: 6
tags: ["byte", "sbyte", "tinyint", "SQL Server", "MySQL", "PostgreSQL", "checked", "型別對應"]
difficulty: "intermediate"
prerequisites: ["csharp-variables", "data-access-ef-core"]
relatedArticles: ["data-access-migrations", "csharp-records-invariants"]
applicableVersions: "比較 SQL Server、MySQL 8.4 與 PostgreSQL；實際 CLR 對應由選用 provider 驗證。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-07"
takeaway: "tinyint 不是跨資料庫完全一致的型別；先確認值域與 provider 的映射。"
noteDates: ["2026-07-14"]
sources: [{"title": "Microsoft Learn：SQL Server 整數型別", "url": "https://learn.microsoft.com/en-us/sql/t-sql/data-types/int-bigint-smallint-and-tinyint-transact-sql?view=sql-server-ver17"}, {"title": "MySQL 8.4：Integer types", "url": "https://dev.mysql.com/doc/refman/8.4/en/integer-types.html"}, {"title": "PostgreSQL：Numeric types", "url": "https://www.postgresql.org/docs/current/datatype-numeric.html"}]
---

## 名稱相同，值域可能不同

| 型別 / 引擎 | 值域與對應考量 |
| --- | --- |
| C# byte | 0～255，8-bit 無號整數 |
| C# sbyte | -128～127，8-bit 有號整數 |
| SQL Server tinyint | 0～255，常對應 byte |
| MySQL TINYINT | 預設 -128～127；UNSIGNED 時 0～255 |
| PostgreSQL | 沒有內建 tinyint；常以 smallint 配合範圍約束 |

MySQL 的 TINYINT(1) 與布林映射還會受 provider 設定影響；括號中的顯示寬度不會把整數值域變成只有 0 與 1。不要只由 SQL 型別名稱決定 C# 型別。

## 轉型前檢查範圍

窄化轉型可能在 unchecked 下截斷；checked 會在超出範圍時拋出 OverflowException。下面為語法片段，未單獨納入可執行範例驗證。

~~~csharp title="範圍檢查片段"
int storedValue = 255;
byte value = checked((byte)storedValue);
~~~

ORM / Dapper 讀取的型別轉換，也要以实際 driver、nullable 設定與代表性資料驗證，而不是假設會自動接受所有整數。

## 商業狀態不要只留下數字

如果 tinyint 儲存訂單狀態，在資料表與欄位註解寫明代碼、有效範圍、預設值及 null 意義，並以約束維持有效資料。enum 也可能被轉型成未定義值，仍需在邊界檢查。

Migration 更換 provider 或型別時，先檢查既有負數、255 上界與 null，再安排資料轉換；欄位更小不等於一定值得犧牲可維護性。
