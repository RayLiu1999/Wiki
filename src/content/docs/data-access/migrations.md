---
title: "Migration 與部署 Bundle"
description: "把模型差異轉成可檢閱的部署步驟，理解 SQL script、migration bundle 與正式環境風險。"
articleId: "data-access-migrations"
topic: "data-access"
category: "database-runtime"
order: 2
tags: ["EF Core", "Migration", "migration bundle", "efbundle", "idempotent script", "schema", "部署"]
difficulty: "intermediate"
prerequisites: ["data-access-ef-core", "dotnet-sdk-packages"]
relatedArticles: ["data-access-transactions", "data-access-pools-locks"]
applicableVersions: "以 .NET 10 生態系與本文列出的官方文件核對；套件及資料庫供應商的差異見內文。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-07"
takeaway: "Migration 是待審查的資料庫變更程式；產生成功不等於正式資料安全。"
noteDates: ["2026-06-04", "2026-10-05", "2026-10-06"]
sources: [{"title": "Microsoft Learn：套用 Migration", "url": "https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/applying?tabs=dotnet-core-cli"}, {"title": "Microsoft Learn：管理 Migration", "url": "https://learn.microsoft.com/en-us/ef/core/managing-schemas/migrations/managing"}]
---

## 模型差異與資料變更分開檢查

Migration 記錄模型版本之間的差異與 Up / Down 操作；snapshot 幫助產生下一次差異。工具可能把改名推斷成刪除再新增，或產生會鎖住大表的操作，必須檢查 SQL 與既有資料。

新增必要欄位時，常需先允許過渡狀態、分批回填，再收緊約束。註解也應隨 migration 持久化，避免只留在 C# 原始碼中。

## 部署產物的選擇

| 方式 | 用途 | 注意事項 |
| --- | --- | --- |
| SQL script | DBA 或部署流程先檢閱 | 對照來源與目標 migration，檢查 provider 語法 |
| Idempotent script | 依 migration history 決定待套用步驟 | 不等於每個自訂 SQL 都安全可重跑 |
| Migration bundle | 可交付的命令列 artifact | 依平台建置，確認 runtime / self-contained、設定與權限 |
| 開發時 database update | 本機迭代 | 不直接視為正式環境部署策略 |

## 產生 Bundle 的示意指令

以下需在含 EF Core Design 工具、有效 model 及 provider 的專案執行。本網站沒有建立或套用這些產物。

~~~bash title="在實際 EF 專案執行"
dotnet ef migrations script --idempotent
dotnet ef migrations bundle --self-contained --runtime linux-x64
~~~

Bundle 用受控部署工作執行，必要設定來自環境或安全的 configuration；避免把正式連線字串寫進版本控制或 build log。多個 Pod 同時啟動時各自跑 migration，會增加競爭與部署耦合，通常以獨立部署步驟處理。

## 驗證與恢復

在代表性的資料量與版本上驗證 apply、資料結果與應用程式相容性。Down 不保證找回被刪資料；先準備備份與實際可執行的恢復方案。部署期若新舊版本同時運作，schema 變更需保有過渡相容性。
