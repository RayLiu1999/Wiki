---
title: "C# 連線設計：DataSource、DbContext 與生命週期"
description: "分清 driver、ORM、連線池與交易，建立可控制、可診斷的資料存取邊界。"
articleId: "data-access-csharp-connections"
topic: "data-access"
category: "database-connections"
order: 10
tags: ["C#", "MySQL", "PostgreSQL", "DataSource", "DbContext", "Dapper", "ADO.NET"]
difficulty: "intermediate"
learningDepth: "basic"
prerequisites: ["csharp-cancellation-disposable", "aspnet-core-dependency-injection"]
relatedArticles: ["data-access-mysql-dotnet", "data-access-postgresql-dotnet", "data-access-pool-capacity"]
applicableVersions: "以 .NET 10、MySQL 8.4（InnoDB）、PostgreSQL 18 說明；driver／EF provider 的主版相容性須各自核對。"
verifiedWith: "2026-10-09：.NET SDK 10.0.105 編譯與 --validate 離線設定解析通過；價格 SQL 方法未被呼叫，未驗證資料庫連線、CRUD 或效能。"
lastReviewed: "2026-10-09"
takeaway: "分清 driver、ORM、連線池與交易，建立可控制、可診斷的資料存取邊界。"
noteDates: []
sources: [{"title": "Npgsql：DataSource 與借還連線", "url": "https://www.npgsql.org/doc/basic-usage.html"}, {"title": "MySqlConnector：DataSourceBuilder", "url": "https://mysqlconnector.net/api/mysqlconnector/mysqldatasourcebuildertype/"}, {"title": "EF Core：Context 與連線池", "url": "https://learn.microsoft.com/en-us/ef/core/performance/advanced-performance-topics"}, {"title": "EF Core：provider 相容性", "url": "https://learn.microsoft.com/en-us/ef/core/providers/"}]
---

## 從商品 API 的一次查價開始

API 可以同時等待很多請求，但資料庫能安全處理的工作量有限。HTTP 併發、開啟的 session、正在執行的 SQL 與持有鎖的交易是不同數字。`async/await` 讓等待不必佔住同一條執行緒，仍會使用連線、鎖與資料庫資源。

本專題比較兩種資料庫方案，不要求一個電商同時寫入 MySQL 與 PostgreSQL。先選一個權威交易來源，再依需求加入快取、背景工作或讀副本。

<figure class="concept-flow"><figcaption>一次資料庫操作的責任</figcaption><ol><li>HTTP／Worker 用例</li><li>有限工作量與 deadline</li><li>EF Core／Dapper／ADO.NET</li><li>driver 與連線池</li><li>資料庫查詢、鎖與提交</li></ol></figure>

## 各物件的生命週期

| 物件 | 使用方式 | 要避免的問題 |
| --- | --- | --- |
| DataSource／穩定的池設定 | 同一程序、同一連線目的與身分重用；由 Host／DI 管理釋放 | 每個 request 新建 DataSource，形成更多池或反覆建連線 |
| Connection | 一次操作／交易借出，用完立即釋放 | 共享一條 Singleton Connection 給多個並行請求 |
| Command／Reader／Transaction | 隸屬該次連線與工作，離開時釋放 | Reader 未關閉就重用連線；持有交易等待付款 HTTP |
| DbContext | 一個工作單位；Web 常用 Scoped，背景工作自行建立 scope／factory | 同一 context 同時做多個 async 查詢或跨 request 共用 |

DataSource 的可共用性不代表取出的 Connection 或 DbContext 可任意並行使用。`await using` 在例外路徑也能歸還資源；只呼叫 `OpenAsync` 而漏釋放，池再大也會耗盡。

## 明確設定的最小範例

以下是 `examples/database-connections` 的完整設定類別，需要 MySqlConnector 2.5.0 與 Npgsql 10.0.3。呼叫端從自己的安全設定提供連線字串，並將回傳的各 DataSource 以 Singleton factory 註冊至 DI，由容器釋放。API 與 Worker 不會因此跨程序共享池。

數值僅供教學：每池 20、開啟 5 秒、命令 3 秒。它們是待量測的候選配置，不表示能達成某個 QPS 或延遲目標。兩種 driver 的取消等待單位不同；範例保留 session reset，並驗證 TLS 主機名稱與憑證。

~~~csharp
using MySqlConnector;
using Npgsql;

public static class ConnectionSetup
{
    // 這些數值供教學設定檢查；實際值由容量與延遲量測決定。
    public static MySqlDataSource CreateMySql(string connectionString)
    {
        var options = new MySqlConnectionStringBuilder(connectionString)
        {
            Pooling = true,
            MinimumPoolSize = 0,
            MaximumPoolSize = 20,
            ConnectionTimeout = 5,
            DefaultCommandTimeout = 3,
            CancellationTimeout = 2, // 秒
            ConnectionReset = true,
            SslMode = MySqlSslMode.VerifyFull,
        };
        return new MySqlDataSourceBuilder(options.ConnectionString).Build();
    }

    public static NpgsqlDataSource CreatePostgreSql(string connectionString)
    {
        var options = new NpgsqlConnectionStringBuilder(connectionString)
        {
            Pooling = true,
            MinPoolSize = 0,
            MaxPoolSize = 20,
            Timeout = 5,
            CommandTimeout = 3,
            CancellationTimeout = 2000, // 毫秒
            NoResetOnClose = false,
            SslMode = SslMode.VerifyFull,
        };
        return new NpgsqlDataSourceBuilder(options.ConnectionString).Build();
    }
}
~~~

建構 DataSource 不等於已連線。此範例的 `--validate` 只解析設定，商品價格方法另外提供參數化查詢的寫法。完整的取得、執行與前提在[資料庫驗證指南](/practice/ecommerce/database-validation/)。

## EF Core 與 Dapper 如何選

EF Core 提供模型、追蹤、LINQ 翻譯與 migration；Dapper／ADO.NET 適合明確的 SQL 與資料映射。選擇仍要量測實際 SQL、round trip、資料傳輸與交易時間，不能由 ORM 名稱推論效能。

DbContext pooling 重用 context，driver pooling 重用實體連線，兩者獨立。EF Core 的 provider 要與 EF 主版相容；.NET 10 應用程式並不表示所有 MySQL provider 都支援 EF Core 10。

## 把等待拆開量測

記錄進入應用佇列、借到連線、SQL 完成、交易提交、回應送出的時間；Reader 的消費也可能繼續佔用連線。逾時要有整筆請求／工作 deadline，不能把每次重試的命令上限無限相加。

成功返回由用例定義。逾時、取消或網路斷線後，提交結果可能未知；對寫入應提供穩定業務識別與查詢結果，而不是立刻再插入一筆。
