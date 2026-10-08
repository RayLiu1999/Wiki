---
title: "EF Core Change Tracking 與查詢選擇"
description: "用改價流程分清 Entity 狀態、identity resolution、讀取與提交。"
articleId: "data-access-tracking"
topic: "data-access"
category: "querying"
order: 8
tags: ["EF Core Change Tracking 與查詢選擇", "data-access"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["data-access-ef-core"]
relatedArticles: ["data-access-concurrency", "aspnet-core-dependency-injection"]
applicableVersions: "以 C# 14／.NET 10 說明；框架與供應商差異見內文。"
verifiedWith: "已依官方文件核對概念；文中示意片段未宣稱完成外部服務整合或效能量測。"
lastReviewed: "2026-10-08"
takeaway: "用改價流程分清 Entity 狀態、identity resolution、讀取與提交。"
noteDates: []
sources: [{"title": "Tracking 與 No-tracking", "url": "https://learn.microsoft.com/en-us/ef/core/querying/tracking"}, {"title": "Change Tracking", "url": "https://learn.microsoft.com/en-us/ef/core/change-tracking/"}]
---

## 本篇的改價背景

店主載入商品、修改單價並提交。EF Core 的 DbContext 會管理某些 Entity 狀態；另一種讀取用途是直接顯示商品清單。本篇描述 EF Core 用法；現有 Redis 實驗使用 Npgsql SQL，不因為引用此篇就變成 EF Core 專案。

## Tracker 保存什麼

Entity 有 Added、Unchanged、Modified、Deleted、Detached 等狀態。追蹤查詢會讓 Context 管理實體與原值，SaveChanges 根據狀態產生更新；查到資料、改了記憶體與提交資料庫是三個不同步驟。

同一 Context 的 tracking query 對同一鍵具有 identity resolution，通常取得同一個追蹤實例。Context 若長期保留，原有實體可能影響之後查詢看到的資料，不能把它當成跨請求的最新資料快取。

## 讀取情境的選擇

| 查詢方式 | 目的 | 要理解的成本 |
| --- | --- | --- |
| Tracking | 載入後修改並由 Context 提交 | 狀態、原值與持有時間 |
| AsNoTracking | 只讀清單或不需更新 | 不由這個 Context 追蹤；重複鍵可能產生不同物件 |
| AsNoTrackingWithIdentityResolution | 只讀但希望結果內共用同鍵實例 | 以獨立 tracker 做結果整理，另有成本 |

DTO 投影可只選需要的欄位；投影中若仍包含 Entity，是否被追蹤要看查詢形狀，不能只看外層是匿名物件。

## 更新與斷線輸入

API 傳入的 DTO 不應直接全部標成 Modified，否則可能覆蓋買家不能修改的欄位。載入、驗證可修改範圍、修改及提交各有責任。重複 attach 相同鍵、把舊 Context 帶到另一個工作、並行使用 Context，都會增加錯誤風險。

回到部署：每個 request 或 Worker 工作建立適當 scope；擴大副本後需同時核對連線池與資料庫容量。變更追蹤處理程序內狀態，庫存並行仍需資料庫策略。
