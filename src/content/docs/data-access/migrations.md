---
title: "EF Core 資料庫遷移（Migrations）：生產自動遷移死鎖與零停機發布（Expand/Contract）"
description: "深入剖析 Pod 啟動自動 Migrate 死鎖災難、零停機擴展與收縮（Expand/Contract）模式、冪等 SQL 腳本生成與 CI/CD 最佳實務。"
articleId: "data-access-migrations"
topic: "data-access"
category: "database-runtime"
order: 1
tags: ["EF Core", "Migrations", "零停機發布", "Expand-Contract", "DDL", "CI/CD", "Kubernetes"]
articleType: "deep-dive"
prerequisites: ["data-access-ef-core", "dotnet-sdk-packages"]
relatedArticles: ["data-access-pools-locks", "kubernetes-workloads"]
applicableVersions: "EF Core 8 / 10、.NET 8 / 10"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "生產環境嚴禁在 Pod 啟動時自動 Migrate；架構變更一律遵循 Expand/Contract 模式；透過 CI/CD 或 InitContainer 執行冪等 SQL 腳本。"
sources:
  - title: "Microsoft Learn：在生產環境中套用移轉 (Migrations) - EF Core"
    url: "https://learn.microsoft.com/zh-tw/ef/core/managing-schemas/migrations/applying"
  - title: "Microsoft Learn：平行移轉與零停機部署"
    url: "https://learn.microsoft.com/zh-tw/ef/core/managing-schemas/migrations/teams"
---

## 案發現場

某電商核心微服務在 Kubernetes 進行滾動更新時，新版本的 4 個 Pod 同時啟動。由於程式碼在 `Program.cs` 寫了 `await dbContext.Database.MigrateAsync()`，4 個 Pod 幾乎在同一瞬間向資料庫下達了 `CREATE TABLE` 與 `ALTER TABLE` 指令；結果資料庫的元資料鎖（Metadata Lock）爆發嚴重死鎖，遷移歷史表（`__EFMigrationsHistory`）寫入衝突，整個發布宣告卡死。

更致命的是隨後的修復操作：團隊直接將 `Phone` 欄位更名為 `MobilePhone`。在滾動發布的 10 分鐘過渡期內，新 Pod 讀寫新欄位，但承接線上流量的舊 Pod 依然在送出舊欄位查詢，全站 API 噴出數萬筆 `Column 'Phone' does not exist` 錯誤，造成大規模訂單中斷。

## 致命反模式 vs. 正確解法

```text
【零停機 Expand/Contract（擴展與收縮）三階段發布模式】
[階段一：Expand (擴展)] ──► 新增欄位 MobilePhone (允許 NULL) ──► 舊版 Pod 正常運作，新版 Pod 開始寫入
                                                                     │
[階段二：Migrate (切換)] ──► 全量流量切換至新版 Pod ──► 背景資料回填 (Backfill 舊資料到新欄位)
                                                                     │
[階段三：Contract (收縮)] ──► 下次發布確認無舊版相依 ──► 移除舊欄位 Phone (安全零停機完成)
```

### 坑一：在多實例 Pod 啟動時裸跑 MigrateAsync()

多個 Pod 並行執行 DDL 會競爭 `__EFMigrationsHistory` 鎖定，極易引發 DDL 死鎖與資料表毀損。

### 坑二：破壞性變更（Breaking Change）直接一次性發布

直接刪除欄位或更改欄位名稱會破壞正在服務的舊版本相依性，違反 Kubernetes 滾動發布（Rolling Update）的向前相容前提。

~~~csharp title="Program.cs"
// ✅ Good：生產環境資料庫遷移最佳實踐與命令列腳本架構
Console.WriteLine("展示生產級 EF Core 資料庫遷移最佳實踐");

var migrationStrategy = new DatabaseMigrationDeploymentDemo();
migrationStrategy.DisplayDeploymentPlan();

Console.WriteLine("遷移部署架構合規：嚴格脫鉤執行期、保障 Kubernetes 滾動更新零停機");

public sealed class DatabaseMigrationDeploymentDemo
{
    public void DisplayDeploymentPlan()
    {
        // 1. 生成冪等 SQL 腳本（可納入 DBA 審查與版本控制）：
        // 指令：dotnet ef migrations script --idempotent --output bundle.sql
        Console.WriteLine("最佳實務 1：生成帶有 IF NOT EXISTS 防護之冪等 SQL 腳本");

        // 2. 獨立於應用程式 Pod 之外執行：
        // 透過 Kubernetes InitContainer 或獨立 CI/CD Job 執行遷移，保證單一實例執行
        Console.WriteLine("最佳實務 2：透過 Kubernetes InitContainer 或 CI/CD 獨立 Job 執行");

        // 3. 遵從 Expand/Contract 模式：
        Console.WriteLine("最佳實務 3：資料表欄位異動遵從 Expand -> Migrate -> Contract 三階段");
    }
}
~~~

預期輸出：
```text
展示生產級 EF Core 資料庫遷移最佳實踐
最佳實務 1：生成帶有 IF NOT EXISTS 防護之冪等 SQL 腳本
最佳實務 2：透過 Kubernetes InitContainer 或 CI/CD 獨立 Job 執行
最佳實務 3：資料表欄位異動遵從 Expand -> Migrate -> Contract 三階段
遷移部署架構合規：嚴格脫鉤執行期、保障 Kubernetes 滾動更新零停機
```

## 踩坑與避坑指南

* **產生冪等 SQL 腳本（Idempotent Scripts）**：
  在 CI/CD 流水線中，使用 `dotnet ef migrations script --idempotent -o migrate.sql`。生成的 SQL 腳本會為每個遷移段落自動包裝 `IF NOT EXISTS (SELECT 1 FROM __EFMigrationsHistory WHERE ...)`，即使重複執行也不會報錯，且能完整納入 Git 與 DBA 審查流程。
* **PostgreSQL vs. MySQL 的 DDL 行為差異**：
  * **PostgreSQL 支援事務性 DDL**：若遷移中途失敗，整筆結構變更會安全 Rollback，資料庫保持乾淨。
  * **MySQL 不支援事務性 DDL**：一旦 `ALTER TABLE` 中途失敗，資料庫不會回滾，會留下殘缺的表結構，修復成本極高！在 MySQL 執行大表結構變更務必謹慎。
* **避坑原則（什麼時候千萬不要在線上執行直接加欄位？）**：
  * **千萬級歷史大表增加帶有計算預設值的欄位**：若資料庫版本較舊（如 MySQL 5.7），`ALTER TABLE ADD COLUMN` 會強制鎖死整張表並重建 B-Tree 磁碟檔數十分鐘。應確認資料庫支援 Instant DDL（如 MySQL 8.0 / PostgreSQL 11+）或採用外部無鎖工具（如 `gh-ost`、`pt-online-schema-change`）。

## 線上排查指令與監控指標

線上排查遷移阻塞與鎖定：

```bash
# 1. 檢視 PostgreSQL 當前持有 DDL 排他鎖的 Session
SELECT pid, usename, granted, mode, query 
FROM pg_locks l 
JOIN pg_stat_activity a ON l.pid = a.pid 
WHERE mode = 'AccessExclusiveLock';

# 2. 檢驗 MySQL 元資料鎖（MDL）等待狀況
SELECT * FROM performance_schema.metadata_locks WHERE lock_status = 'PENDING';

# 3. Grafana 告警指標 (PromQL)
# 檢測是否有長期處於 Exclusive 鎖定狀態的資料庫連線
count(pg_locks_count{mode="AccessExclusiveLock"} > 0) > 0
```
