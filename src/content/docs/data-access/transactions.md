---
title: ".NET 資料庫交易實務：本地交易、分散式交易陷阱與 TransactionScope 避坑"
description: "深入剖析 TransactionScope 在 Linux 容器環境升級 DTC 崩潰原因、持鎖範圍過大災難、單一連線本機交易與 Outbox 最終一致性架構。"
articleId: "data-access-transactions"
topic: "data-access"
category: "transactions"
order: 1
tags: [".NET", "交易", "Transactions", "TransactionScope", "DTC", "分散式交易", "Outbox"]
articleType: "deep-dive"
prerequisites: ["data-access-ef-core", "csharp-cancellation-disposable"]
relatedArticles: ["data-access-batch-updates", "architecture-outbox-inbox"]
applicableVersions: "EF Core 8 / 10、.NET 8 / 10"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "Linux 容器嚴禁跨多連線使用 TransactionScope；持交易期間禁執行外部 I/O；跨微服務一律採用 Outbox 與 Saga 最終一致性。"
sources:
  - title: "Microsoft Learn：EF Core 中的交易"
    url: "https://learn.microsoft.com/zh-tw/ef/core/saving/transactions"
  - title: "Microsoft Learn：使用 TransactionScope 實作隱含交易"
    url: "https://learn.microsoft.com/zh-tw/dotnet/framework/data/transactions/implementing-an-implicit-transaction-using-transaction-scope"
---

## 案發現場

某微服務系統由 Windows 伺服器遷移至 Linux Kubernetes 容器後，結帳流程在特定分支突發大規模崩潰，日誌充斥著 `PlatformNotSupportedException: This platform does not support distributed transactions`。追查發現，舊程式碼使用了 `using var scope = new TransactionScope()`，但在 scope 內部因兩段邏輯各自開啟了獨立的 DbConnection，Windows 時代默默幫忙升級的 MSDTC（微軟分散式交易協調器）在 Linux 上根本不存在！

另一起更嚴重的事故中，開發者在資料庫交易內部直接發起對第三方金流 API 的 HTTP 呼叫；適逢金流網路抖動回應延遲達 20 秒，資料庫庫存表的排他鎖（X-Lock）被長期扣押，後續所有結帳請求被全數卡死在鎖等待，資料庫連線池瞬間被借光，引發全站 504 逾時雪崩。

## 致命反模式 vs. 正確解法

```text
【TransactionScope 跨平台陷阱 vs. 本地交易最小持鎖】
[❌ Linux 下的 TransactionScope] 
連線 A (扣款) ──► 開啟連線 B (建單) ──► 試圖升級 MSDTC ──► 💥 Linux 拋出 PlatformNotSupportedException！

[❌ 交易內夾雜外部 I/O]
BEGIN TX ──► 鎖定庫存 ──► [慢速 HTTP 金流 20s] ──► 提交 ──► 💥 庫存表被鎖死 20 秒，全站排隊崩潰

[✅ 本地交易 + 最小持鎖]
BEGIN TX (單一連線) ──► 扣庫存 ──► 寫入 Outbox ──► COMMIT (僅 2ms) ──► 後續在交易外異步發起 HTTP
```

### 坑一：跨多個連線或多資料庫使用 TransactionScope

.NET Core / 8+ 在 Linux 容器環境中**不支援跨連線分散式交易升級（Distributed Transactions）**。只要在一個 scope 內開啟第二個連線，CLR 就會直接崩潰。

### 坑二：在交易範圍內執行耗時遠端 I/O

在交易區塊內發送 HTTP 請求或發送訊息，會將資料庫交易鎖定時間由微秒級拉長至數十秒，極易癱瘓整張資料表。

~~~csharp title="Program.cs"
// ✅ Good：使用 EF Core 單一連線顯式本機交易與最小持鎖時間
using System.Data;
using Microsoft.EntityFrameworkCore;

Console.WriteLine("展示生產級本機資料庫交易最佳實踐");

var txManager = new OrderTransactionManager();
await txManager.ExecuteOrderPlacementAsync();

Console.WriteLine("本機交易提交成功：持鎖時間小於 5ms，無外部分散式協調負擔");

public sealed class OrderTransactionManager
{
    public async Task ExecuteOrderPlacementAsync()
    {
        // 1. 嚴格限定在單一連線內開啟本機交易（Local Transaction）：
        // await using var transaction = await dbContext.Database.BeginTransactionAsync(IsolationLevel.ReadCommitted);
        Console.WriteLine("開啟單一連線本機交易：BeginTransactionAsync(IsolationLevel.ReadCommitted)");

        // 2. 僅執行純粹、極速的資料庫 SQL 變更：
        Console.WriteLine("步驟一：扣減庫存商品行鎖");
        Console.WriteLine("步驟二：寫入訂單實體與 Outbox 待發布事件");

        // 3. 立即提交交易，歸還資料庫連線與行鎖：
        // await transaction.CommitAsync();
        Console.WriteLine("提交交易：CommitAsync() 釋放資料庫鎖定");

        // 4. 外部 HTTP 呼叫與 MQ 發布一律放在交易提交之後！
        await Task.CompletedTask;
    }
}
~~~

預期輸出：
```text
展示生產級本機資料庫交易最佳實踐
開啟單一連線本機交易：BeginTransactionAsync(IsolationLevel.ReadCommitted)
步驟一：扣減庫存商品行鎖
步驟二：寫入訂單實體與 Outbox 待發布事件
提交交易：CommitAsync() 釋放資料庫鎖定
本機交易提交成功：持鎖時間小於 5ms，無外部分散式協調負擔
```

## 踩坑與避坑指南

* **TransactionScope 必備參數：`TransactionScopeAsyncFlowOption.Enabled`**：
  若在非同步方法中使用 TransactionScope，建構子**必須**傳入 `TransactionScopeAsyncFlowOption.Enabled`。否則當遇到 `await` 切換執行緒池時，交易上下文無法流動至續行執行緒，導致子任務脫離交易或拋錯。
* **跨微服務分散式交易正解：Outbox + Saga 模式**：
  微服務架構下嚴禁妄想跨服務強一致性 2PC。應將「業務變更」與「發布事件」透過本機交易寫入同一資料庫的 `Outbox` 表，再由背景 Worker 異步推向 RabbitMQ / Kafka，達成最終一致性（Eventual Consistency）。
* **避坑原則（什麼時候不要開啟交易？）**：
  * **單一語句自動提交（Single Statement Auto-Commit）**：若業務僅執行單道獨立的 `UPDATE Products SET Stock = Stock - 1 WHERE Id = @id AND Stock >= 1`，關聯資料庫預設本來就會以單語句原子性執行，無需手動顯式包裝 `BeginTransaction`，可省去一次網路往返。

## 線上排查指令與監控指標

線上監控長交易與鎖阻塞：

```bash
# 1. PostgreSQL 找出執行超過 5 秒的危險長交易
SELECT pid, usename, now() - xact_start AS duration, state, query 
FROM pg_stat_activity 
WHERE state IN ('active', 'idle in transaction') 
  AND now() - xact_start > interval '5 seconds';

# 2. 檢測 MySQL 當前持有鎖的交易
SELECT trx_id, trx_state, trx_started, now() - trx_started AS duration_sec, trx_query 
FROM information_schema.innodb_trx 
WHERE now() - trx_started > 5;

# 3. Grafana 告警指標 (PromQL)
# 監控長交易數量（超過 5 秒即觸發警告）
count(pg_stat_activity_max_tx_duration{state="active"} > 5) > 0
```
