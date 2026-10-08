---
title: "Profiling 與瓶頸定位的工作流程"
description: "從可重現的商品負載出發，依指標、trace 和記憶體證據驗證改善。"
articleId: "dotnet-profiling"
topic: "dotnet"
category: "runtime-performance"
order: 9
tags: ["Profiling 與瓶頸定位的工作流程", "dotnet"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["dotnet-gc-memory", "dotnet-threadpool", "engineering-metrics-tracing"]
relatedArticles: ["engineering-slo-alerts", "data-access-sql-foundations"]
applicableVersions: "以 C# 14／.NET 10 說明；框架與供應商差異見內文。"
verifiedWith: "已依官方文件核對概念；文中示意片段未宣稱完成外部服務整合或效能量測。"
lastReviewed: "2026-10-08"
takeaway: "從可重現的商品負載出發，依指標、trace 和記憶體證據驗證改善。"
noteDates: []
sources: [{"title": "dotnet-counters", "url": "https://learn.microsoft.com/en-us/dotnet/core/diagnostics/dotnet-counters"}, {"title": "dotnet-trace", "url": "https://learn.microsoft.com/en-us/dotnet/core/diagnostics/dotnet-trace"}, {"title": "診斷工具", "url": "https://learn.microsoft.com/en-us/dotnet/core/diagnostics/tools-overview"}]
---

## 本篇的問題背景

買家說商品查詢變慢，團隊需要知道時間花在 CPU、資料庫、快取、鎖或排程。本篇提供診斷流程和工具角色，沒有附上現有實驗的效能資料；實測必須連同環境保存。

## 先定義量測範圍

記錄應用版本、.NET、CPU 架構、容器資源、資料量、快取冷／熱狀態、並行請求及負載時間。平均值、尾端延遲、錯誤率和吞吐量各自表達不同結果。

使用相同測試條件重現一次，再對照單程序、整個服務與外部服務。多個 Pod 的 p95 不能直接平均成全系統 p95。

## 工具提供不同證據

| 工具或資料 | 用來回答 |
| --- | --- |
| dotnet-counters／應用 meters | 哪個時間窗的 CPU、配置、GC、queue 或請求異常？ |
| dotnet-trace／profiler | 程式花時間在哪些呼叫及排程？ |
| dump／GC 資料 | 哪些物件仍存活，從哪些 root 保留？ |
| OpenTelemetry trace | 一筆查詢的 HTTP、資料庫和等待段如何串接？ |
| 資料庫 query plan | 哪個查詢與索引造成成本？ |

工具、診斷權限和容器 attach 方式需要版本對應。採樣與匯出也有成本，不把缺少 trace 當成未執行的證據。

## 用一個假設推進

例如假設商品 DTO 建立過多配置，就先看 allocation 和 profiler；若大部分時間在 SQL 等待，改 buffer 未必改善。調整一個有證據的原因，再用相同結果契約比較，避免一次更動多個因素失去歸因。

微型 benchmark 適合比較局部操作，端到端負載用來確認真正的 API 行為。量測程式也需要正確性，不能用略過授權或移除一致性機制換來看似漂亮的數字。

完成檢查：能提供假設、測試條件、證據、調整與前後比較，以及仍未解釋的限制。
