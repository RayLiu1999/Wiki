---
title: "C# 與 MySQL：連線池、取消與 InnoDB"
description: "用 MySqlConnector 理解短期連線、TLS、參數化 SQL 與 MySQL 的容量設定。"
articleId: "data-access-mysql-dotnet"
topic: "data-access"
category: "database-connections"
order: 11
tags: ["MySQL", "C#", "MySqlConnector", "InnoDB", "TLS", "ConnectionTimeout"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["data-access-csharp-connections"]
relatedArticles: ["data-access-pool-capacity", "data-access-concurrent-crud", "data-access-isolation-locking"]
applicableVersions: "以 .NET 10、MySQL 8.4（InnoDB）、PostgreSQL 18 說明；driver／EF provider 的主版相容性須各自核對。"
verifiedWith: "2026-10-09：.NET SDK 10.0.105 編譯與 --validate 離線設定解析通過；價格 SQL 方法未被呼叫，未驗證資料庫連線、CRUD 或效能。"
lastReviewed: "2026-10-09"
takeaway: "用 MySqlConnector 理解短期連線、TLS、參數化 SQL 與 MySQL 的容量設定。"
noteDates: []
sources: [{"title": "MySqlConnector：套件與目標框架", "url": "https://mysqlconnector.net/overview/installing/"}, {"title": "MySqlConnector：連線設定", "url": "https://mysqlconnector.net/connection-options/"}, {"title": "MySQL 8.4：InnoDB buffer pool", "url": "https://dev.mysql.com/doc/refman/8.4/en/innodb-buffer-pool.html"}, {"title": "MySQL 8.4：InnoDB 隔離層級", "url": "https://dev.mysql.com/doc/refman/8.4/en/innodb-transaction-isolation-levels.html"}]
---

## 先辨認你使用的 driver

本篇採 MySqlConnector 的 ADO.NET API。Oracle 的 Connector/NET（MySql.Data）是另一套 driver，連線字串與行為不能假設完全相同；Pomelo 與 Oracle 的 EF provider 也有各自的 EF 主版支援。鎖定實際套件版本，再核對維護者文件。

範例專案固定 MySqlConnector 2.5.0，使用 .NET 10；現有快取實驗仍使用 PostgreSQL，這篇不是宣稱已替它換成 MySQL。

## 取得、查詢與歸還連線

以下是完整類別。`source` 是呼叫端注入的 MySqlDataSource，`products` 必須已存在，id 可與 Int64 比對、price 可讀為 decimal。程式使用 `@id` 參數；沒有建立 schema，也沒有將使用者輸入拼接成 SQL。

~~~csharp
using MySqlConnector;

public static class MySqlProductQueries
{
    // 呼叫端提供已存在的 products(id, price)；本範例不建立資料表。
    public static async Task<decimal?> ReadPriceAsync(
        MySqlDataSource source, long productId, CancellationToken token)
    {
        await using var connection = await source.OpenConnectionAsync(token);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT price FROM products WHERE id = @id";
        command.Parameters.Add("@id", MySqlDbType.Int64).Value = productId;
        object? value = await command.ExecuteScalarAsync(token);
        return value is null or DBNull ? null : Convert.ToDecimal(value);
    }
}
~~~

連線只跨資料查詢存活。查價之後呼叫外部服務，應先離開本方法；若需多次 SQL 的原子性，改由用例持有一個明確交易並傳給各操作，不能每次另借連線卻當成同一交易。

## 要配置與觀察什麼

| 設定 | 目的與核對方式 |
| --- | --- |
| `MaximumPoolSize`／`MinimumPoolSize` | 限制每池連線，最低值會影響常駐連線需求；總量由所有程序與池相加 |
| `ConnectionTimeout` | Open／OpenAsync 的連線或池等待上限；另外記錄實際借池延遲 |
| `DefaultCommandTimeout` | 命令執行上限；不等於整筆 HTTP 時間，也不包含所有重試總和 |
| `CancellationTimeout` | 取消等待以秒錶示；範例為 2 秒，不能直接照搬 Npgsql 的 2000 |
| `ConnectionReset` | 保持借出 session 的初始狀態一致；關掉後可能留下先前的 session 狀態 |
| `SslMode=VerifyFull` | 驗證信任鏈與主機名稱；需相符的服務端憑證與信任設定 |

CancellationToken 要一路傳到 SQL。取消不能證明交易未提交，失敗應按業務冪等與結果查詢處理；Keepalive、池 idle 與 lifetime 則是不同的連線健康或輪替問題。

## MySQL 伺服器端的容量

`max_connections` 是 session 上限，不是資料庫每秒處理能力。一起觀察 Threads_connected、Threads_running、鎖等待、buffer pool、磁碟延遲、redo／binlog 與複寫延遲。

InnoDB buffer pool 保存資料與索引頁；大小要與作業系統、其他記憶體、工作集和實際硬體共同分配。不能只把某個百分比套到共用主機或受限容器。提高連線上限也可能增加每連線／查詢的記憶體需求。

預設 InnoDB 隔離層級為 Repeatable Read。一般一致讀、鎖定讀與寫入有不同語意，範圍鎖與死鎖另見[隔離與鎖](/data-access/isolation-locking/)。

## 用電商結果驗證

先證明商品查價正確、取消後連線能再次借用、熱門商品寫入不超賣，再增加負載。池滿時應觀察有界等待與失敗；不以 `MaxPoolSize=1000` 替代容量設計。
