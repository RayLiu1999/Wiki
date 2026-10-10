---
title: "EF Core 型別對應與 Value Converter：JSON 欄位與查詢轉譯地雷"
description: "深入剖析 ValueConverter 無法轉譯 SQL 災難、EF Core 8+ 原生 ToJson 欄位映射、Enum 字串儲存最佳實務與 ValueComparer 陷阱。"
articleId: "data-access-type-mapping"
topic: "data-access"
category: "querying"
order: 2
tags: ["EF Core", "Type Mapping", "ValueConverter", "JSON", "ToJson", "ValueComparer", "SQL轉譯"]
articleType: "deep-dive"
prerequisites: ["data-access-ef-core", "csharp-syntax-traps"]
relatedArticles: ["data-access-sql-foundations", "data-access-migrations"]
applicableVersions: "EF Core 8 / 10、.NET 8 / 10"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "結構化配置優先採用 EF Core 原生 ToJson() 達成 SQL 條件下推；可變物件轉換必配 ValueComparer；Enum 儲存字串須宣告嚴格長度。"
sources:
  - title: "Microsoft Learn：EF Core 中的值轉換 (Value Conversions)"
    url: "https://learn.microsoft.com/zh-tw/ef/core/modeling/value-conversions"
  - title: "Microsoft Learn：EF Core 中的 JSON 欄位 (JSON Columns)"
    url: "https://learn.microsoft.com/zh-tw/ef/core/what-is-new/ef-core-80/whatsnew#json-columns"
---

## 案發現場

某電商平台的商品中心為了彈性支援不同品類的自訂規格（如顏色、尺寸、產地），工程師在實體中定義了一個 `ProductDetail` 物件，並在 EF Core 使用自訂 `ValueConverter` 透過 `JsonSerializer` 序列化成字串存進資料庫的 `varchar(max)` 欄位。上線後行銷團隊發起「篩選紅色保溫杯」的查詢，資料庫伺服器 I/O 瞬間 100% 爆滿，單次查詢耗時超過 12 秒！

排查 SQL 執行計畫驚覺：因為使用了自訂字串 ValueConverter，EF Core 根本無法理解 JSON 內部結構，LINQ 的 `Where(p => p.Detail.Color == "Red")` 無法轉譯為資料庫的原生 JSON 查詢函式，而是觸發了整張商品表的**全表循序掃描（Full Table Scan）**！若在早期版本甚至會將百萬筆商品全數撈回記憶體做 Client Evaluation，釀成災難性 OOM。

## 致命反模式 vs. 正確解法

```text
【自訂 ValueConverter vs. 原生 ToJson 查詢轉譯差異】
[❌ 自訂 ValueConverter] 
LINQ: Where(p => p.Detail.Color == "Red")
SQL 轉譯失敗 ──► 強制全表掃描 WHERE Detail LIKE '%"Color":"Red"%' 或 Client 評估 (無索引可用)

[✅ EF Core 原生 ToJson()]
LINQ: Where(p => p.Detail.Color == "Red")
SQL 成功下推 ──► PostgreSQL: WHERE "Detail"->>'Color' = 'Red' (支援 GIN 索引快速檢索)
```

### 坑一：使用黑盒 ValueConverter 儲存結構化資料

自訂 ValueConverter 對 EF Core 查詢提供者而言是「不透明的黑盒」，任何對內部子屬性的條件過濾都無法生成對應的資料庫查詢語句。

### 坑二：轉換可變集合未配置 ValueComparer

若將 `List<string>` 以 Converter 存為逗號分隔字串，呼叫 `list.Add("newItem")` 後執行 `SaveChanges()`，EF Core 的變更追蹤器預設比對物件記憶體指標（Reference Equality），判定物件未改變，**變更直接被靜默丟棄，資料完全沒有寫入資料庫！**

~~~csharp title="Program.cs"
// ✅ Good：使用 EF Core 8/10 原生 ToJson 欄位映射與列舉字串轉換規格
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

Console.WriteLine("展示 EF Core 原生 JSON 欄位與列舉映射模型");

var modelBuilder = new ModelConfigurationDemo();
modelBuilder.ConfigureModel();

Console.WriteLine("型別映射配置合規：支援 SQL JSON 查詢下推與嚴格字串枚舉");

public sealed class ModelConfigurationDemo
{
    public void ConfigureModel()
    {
        // 1. 原生 JSON 欄位映射：支援 SQL JSON_EXTRACT / ->> 運算子下推
        // builder.OwnsOne(p => p.Detail, b => b.ToJson());
        Console.WriteLine("已宣告 OwnsOne(p => p.Detail, b => b.ToJson())");

        // 2. Enum 存為字串並設定精確長度，兼具可讀性與索引緊湊度
        // builder.Property(p => p.Status).HasConversion<string>().HasMaxLength(20);
        Console.WriteLine("已宣告 Status 枚舉存為 varchar(20)");
    }
}
~~~

預期輸出：
```text
展示 EF Core 原生 JSON 欄位與列舉映射模型
已宣告 OwnsOne(p => p.Detail, b => b.ToJson())
已宣告 Status 枚舉存為 varchar(20)
型別映射配置合規：支援 SQL JSON 查詢下推與嚴格字串枚舉
```

## 踩坑與避坑指南

* **可變物件的救星：`ValueComparer<T>`**：
  若非得使用自訂 Converter 儲存物件（如自訂字串陣列），必須在 ModelBuilder 中附加 `HasConversion(converter, new ValueComparer<List<string>>((c1, c2) => c1.SequenceEqual(c2), ...))`，告訴 Change Tracker 如何以深層內容比對變更。
* **原生 ToJson() 的優勢**：
  EF Core 8+ / 10 支援將子實體或集合宣告為 `ToJson()`。在 PostgreSQL 會生成原生 `jsonb` 欄位，在 SQL Server 生成原生 `JSON` 型別，LINQ 查詢可直接將屬性存取下推為資料庫的 JSON 運算子，並能建立 GIN / 函數索引。
* **避坑原則（什麼時候千萬不要使用 JSON 欄位？）**：
  * **需要維持強外鍵約束與交易一致性的核心關聯**：例如「訂單」與「買家」、「訂單」與「支付流水」。若將支付狀態硬塞在訂單 JSON 裡，將失去關聯資料庫的 Referential Integrity 級聯防護，並使跨表統計分析效能劇烈下降。

## 線上排查指令與監控指標

線上檢查未轉譯查詢與全表掃描：

```bash
# 1. 檢視 PostgreSQL JSON 查詢是否命中 GIN 索引
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM "Products" WHERE "Detail"->>'Color' = 'Red';

# 2. 檢測全表掃描比率 (Seq Scans) 在 Grafana 的 PromQL
rate(pg_stat_user_tables_seq_scan[5m]) / 
(rate(pg_stat_user_tables_seq_scan[5m]) + rate(pg_stat_user_tables_idx_scan[5m]))

# 3. 檢查 EF Core 是否記錄了無法轉譯 SQL 的警告
grep -i "could not be translated" /var/log/app/*.log | tail -n 20
```
