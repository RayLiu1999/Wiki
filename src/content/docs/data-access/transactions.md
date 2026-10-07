---
title: "Dapper、EF Core 與交易邊界"
description: "把連線、transaction 與記憶體狀態分開，避免漏傳交易或回滾後重用錯誤狀態。"
articleId: "data-access-transactions"
topic: "data-access"
category: "transactions"
order: 3
tags: ["Dapper", "ADO.NET", "transaction", "SaveChanges", "Rollback", "DbContext", "ChangeTracker", "Unit of Work"]
difficulty: "intermediate"
prerequisites: ["data-access-ef-core", "csharp-disposable"]
relatedArticles: ["data-access-batch-updates", "data-access-pools-locks", "architecture-application-patterns"]
applicableVersions: "以 .NET 10 生態系與本文列出的官方文件核對；套件及資料庫供應商的差異見內文。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-07"
takeaway: "資料庫回滾會撤銷已加入交易的資料操作，不會自動倒帶 DbContext 內的物件。"
noteDates: ["2026-05-21", "2026-05-22", "2026-06-29", "2026-07-01", "2026-09-02", "2026-10-06"]
sources: [{"title": "Dapper：官方原始碼與說明", "url": "https://github.com/DapperLib/Dapper"}, {"title": "Dapper：CommandDefinition", "url": "https://github.com/DapperLib/Dapper/blob/main/Dapper/CommandDefinition.cs"}, {"title": "Microsoft Learn：EF Core 交易", "url": "https://learn.microsoft.com/en-us/ef/core/saving/transactions"}, {"title": "Microsoft Learn：EF Core Change Tracking", "url": "https://learn.microsoft.com/en-us/ef/core/change-tracking/"}]
---

## Dapper 的 transaction 要傳到每個命令

Dapper 在 ADO.NET 連線上提供 SQL 與物件映射。建立 transaction 後，預期參與的每個 Query / Execute 都要使用同一個 connection 並明確傳入 transaction；否則可能被 provider 拒絕，或沒有進入你預期的交易。

以下為 SQL Server / Microsoft.Data.SqlClient 與 Dapper 片段。假設既有 Orders 表中 Id 是唯一訂單編號、State 是業務狀態（0 待處理、1 已確認），未連線執行。

~~~csharp title="交易片段"
using Dapper;
using Microsoft.Data.SqlClient;

await using var connection = new SqlConnection(connectionString);
await connection.OpenAsync(cancellationToken);
await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
try
{
    var command = new CommandDefinition(
        "UPDATE dbo.Orders SET State = @State WHERE Id = @Id",
        new { State = 1, Id = orderId }, transaction: transaction,
        cancellationToken: cancellationToken);
    await connection.ExecuteAsync(command);
    await transaction.CommitAsync(cancellationToken);
}
catch
{
    await transaction.RollbackAsync(CancellationToken.None);
    throw;
}
~~~

正式流程還需驗證 affected rows、原狀態與併發條件；回滾本身失敗時，要保留原始錯誤並記錄恢復資訊。不要在交易中等待長時間的外部 HTTP 工作。

## EF Core 的 SaveChanges

在支援交易的 provider 上，單次 SaveChanges 的變更通常以一個交易提交。跨多次 SaveChanges 或與其他命令協同時，才需要明確安排更大的邊界；手動交易與 execution strategy 的重試要配合設計。

EF Core 交易內的 SaveChanges 可能建立 savepoint，支援與限制取決於 provider / 配置，例如 SQL Server MARS 有限制。EF 與 Dapper 共用本地交易，也必須共享同一個 DbConnection / DbTransaction，而不是各自開連線。

## 回滾不會重設記憶體

回滾後，Entity 的屬性與 tracking 狀態可能仍反映已嘗試或已接受的變更。特別是 SaveChanges 成功後再回滾外層交易，context 可能已把資料視為未變更。

依用例丟棄 context、重新載入或清理追蹤後重建操作；不要盲目重送同一份記憶體狀態。資料庫交易也不會自動回滾寄信或跨服務呼叫。
