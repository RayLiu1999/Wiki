---
title: "UUID v4、v7、ULID、COMB 與 Snowflake"
description: "比較 ID 的大小、排序、產生條件與資料庫索引行為，避免把時間排序誤當全域遞增。"
articleId: "dotnet-identifiers"
topic: "dotnet"
category: "time-identifiers"
order: 4
tags: ["UUID v4", "UUID v7", "ULID", "COMB Guid", "Snowflake", "Guid.CreateVersion7", "索引", "唯一識別碼"]
difficulty: "intermediate"
prerequisites: ["dotnet-time-zones", "data-access-type-mapping"]
relatedArticles: ["data-access-pools-locks", "architecture-domain-modeling"]
applicableVersions: "Guid.CreateVersion7 需 .NET 9 以上；UUID 依 RFC 9562，其他方案依列出的規格或實作。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-07"
takeaway: "ID 的時間布局、比較順序與唯一性依賴不同條件；先確認實際資料庫與跨節點需求。"
noteDates: ["2026-08-27"]
sources: [{"title": "IETF：RFC 9562 UUID", "url": "https://www.rfc-editor.org/rfc/rfc9562.html"}, {"title": "ULID：正式規格", "url": "https://github.com/ulid/spec"}, {"title": "RT.Comb：SQL Server 與 PostgreSQL 的 COMB 實作", "url": "https://github.com/richardtallent/RT.Comb"}, {"title": "Twitter：Snowflake 原始專案", "url": "https://github.com/twitter-archive/snowflake"}, {"title": "Microsoft Learn：Guid.CreateVersion7", "url": "https://learn.microsoft.com/en-us/dotnet/api/system.guid.createversion7?view=net-10.0"}]
---

## 先比較二進位大小與排序意圖

| 方案 | 二進位大小 | 產生與排序特性 |
| --- | --- | --- |
| UUID v4 | 128-bit / 16 bytes | 隨機為主，沒有時間前綴 |
| UUID v7 | 128-bit / 16 bytes | 前段含 Unix 毫秒時間，另有隨機 / 計數布局 |
| ULID | 128-bit / 16 bytes | 48-bit 時間、80-bit 隨機，常用 26 字元文字表示 |
| COMB Guid | 通常 128-bit / 16 bytes | 時間與隨機組合，布局依實作及目標資料庫不同 |
| Snowflake 類型 | 常見 64-bit / 8 bytes | 時間、worker 與序號，需管理節點配置及時鐘 |

文字欄位實際空間還受編碼、欄位型別與索引影響。不能拿 36 字元 UUID 字串直接當成 Guid 的二進位儲存大小。

## .NET 的 API 版本

Guid.NewGuid 產生 v4；Guid.CreateVersion7 自 .NET 9 起提供。以下為 API 片段，未單獨納入可執行範例驗證；較早 runtime 需選符合規格的實作。

~~~csharp title=".NET 9 以上的片段"
Guid randomId = Guid.NewGuid();
Guid timedId = Guid.CreateVersion7();
~~~

時間前綴不保證同一毫秒或不同節點都嚴格遞增，ULID 的 monotonic 行為也取決於 generator。Snowflake 類型要避免 worker id 衝突，處理時鐘回撥與每個時間單位的序號耗盡。

## 資料庫排序才決定索引表現

隨機 key 可能增加 B-tree 寫入的頁分裂，時間布局有機會改善寫入區域性，但也可能產生熱點。SQL Server uniqueidentifier、PostgreSQL uuid、字串 collation 與 .NET 比較順序未必相同；尤其不能把 v7 在某個引擎的結果直接套到另一個。

COMB 不是一個跨實作一致的 UUID 標準版本；要確認布局、排序與相容性。用實際資料量、索引型態及工作負載量測，再選方案。ID 也不是授權憑證，時間型 ID 可能透露建立時刻。
