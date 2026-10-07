---
title: "分批更新與鎖競爭"
description: "用批次大小、範圍、間隔與取消控制維護工作，避免一個大交易長時間佔用資源。"
articleId: "data-access-batch-updates"
topic: "data-access"
category: "transactions"
order: 4
tags: ["批次 SQL", "Dapper", "Task.Delay", "連線管理", "批次大小", "資料庫鎖", "keyset"]
difficulty: "intermediate"
prerequisites: ["data-access-transactions", "csharp-cancellation"]
relatedArticles: ["data-access-pools-locks", "csharp-thread-safety", "engineering-metrics-tracing"]
applicableVersions: "SQL 範例限定 SQL Server T-SQL；其他資料庫需重寫批次語法與鎖定策略。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-07"
takeaway: "批次需要可重跑的範圍與清楚的提交邊界；延遲應放在釋放交易與連線之後。"
noteDates: ["2026-09-02"]
sources: [{"title": "Microsoft Learn：SQL Server UPDATE", "url": "https://learn.microsoft.com/en-us/sql/t-sql/queries/update-transact-sql?view=sql-server-ver17"}, {"title": "Microsoft Learn：SQL Server 鎖與交易", "url": "https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-transaction-locking-and-row-versioning-guide?view=sql-server-ver17"}, {"title": "Dapper：CommandDefinition", "url": "https://github.com/DapperLib/Dapper/blob/main/Dapper/CommandDefinition.cs"}]
---

## 將大工作拆成可觀察的小提交

一次更新大量資料可能持有鎖、增加 transaction log 與等待。以固定截止範圍、keyset 或明確的「待處理」條件分批，每批完成後提交，再暫停一段時間讓其他工作有機會執行。

批次大小與間隔應依鎖等待、耗時、錯誤率與資料庫負載調整；沒有對所有資料庫都合適的固定數字。小批次不保證完全沒有 table lock 或 lock escalation。

## 延遲時不佔用連線

下列為 SQL Server / Microsoft.Data.SqlClient 與 Dapper 的示意片段，使用單一 statement 的提交邊界。WorkItems 已存在，State 0 代表待處理、1 代表已處理，Id 為唯一編號；SQL 與套件未在本站執行。

~~~csharp title="批次方法片段"
using Dapper;
using Microsoft.Data.SqlClient;

while (true)
{
    cancellationToken.ThrowIfCancellationRequested();
    int affected;
    await using (var connection = new SqlConnection(connectionString))
    {
        await connection.OpenAsync(cancellationToken);
        var command = new CommandDefinition(
            "UPDATE TOP (@BatchSize) dbo.WorkItems SET State = 1 " +
            "WHERE State = 0 AND Id <= @CutoffId",
            new { BatchSize = 200, CutoffId = cutoffId },
            cancellationToken: cancellationToken);
        affected = await connection.ExecuteAsync(command);
    }
    if (affected < 0) throw new InvalidOperationException("無法取得可靠的受影響筆數");
    if (affected == 0) break;
    await Task.Delay(TimeSpan.FromMilliseconds(200), cancellationToken);
}
~~~

TOP 不保證處理順序；若順序有業務意義，應改用有序選取範圍與相應的 SQL 設計。CutoffId 固定處理範圍，避免新增資料讓工作永遠跑不完。

## 重啟與併發也要有定義

檢查索引、查詢計畫、觸發器和 affected rows 的契約。多個 worker 同時取資料時，需使用實際資料庫支援的 claim / 鎖定流程或防止重複執行；process 內 SemaphoreSlim 不能協調其他 Pod。

保留進度、每批耗時與錯誤紀錄；失敗後從安全的 checkpoint 繼續。單純縮小 batch 無法修正錯誤的 WHERE、無索引掃描或長交易。
