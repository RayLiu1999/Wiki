---
title: "ThreadPool、阻塞與飢餓診斷"
description: "理解執行資源和等待的關係，用多個指標定位 API 變慢的原因。"
articleId: "dotnet-threadpool"
topic: "dotnet"
category: "runtime-performance"
order: 7
tags: ["ThreadPool、阻塞與飢餓診斷", "dotnet"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["csharp-async-await", "csharp-thread-safety"]
relatedArticles: ["dotnet-profiling", "kubernetes-autoscaling"]
applicableVersions: "以 C# 14／.NET 10 說明；框架與供應商差異見內文。"
verifiedWith: "已依官方文件核對概念；文中示意片段未宣稱完成外部服務整合或效能量測。"
lastReviewed: "2026-10-08"
takeaway: "理解執行資源和等待的關係，用多個指標定位 API 變慢的原因。"
noteDates: []
sources: [{"title": "Managed Thread Pool", "url": "https://learn.microsoft.com/en-us/dotnet/standard/threading/the-managed-thread-pool"}, {"title": "飢餓診斷", "url": "https://learn.microsoft.com/en-us/dotnet/core/diagnostics/debug-threadpool-starvation"}]
---

## 本篇的流量背景

大量買家同時查商品，API 一部分時間在計算，一部分在等資料庫。本篇把 CPU 飽和、同步等待與 ThreadPool 資源不足分開。使用 async 不會讓昂貴 SQL 或 CPU 工作消失。

## Pool 管理的是執行資源

ThreadPool 重用工作執行緒處理排程工作，非同步延續也可能需要它執行。I/O 等待可以讓呼叫端暫停，讓執行緒處理其他工作；`.Result`、`.Wait()` 或同步 I/O 可能把執行緒留在等待中。

Task 表達作業，不代表專用執行緒；Task.Run 對 CPU 工作有用途，卻可能讓伺服器增加排隊與切換。可用執行緒的調整、Runtime 策略和容器資源要按版本判斷。

## 飢餓與 CPU 飽和的線索

| 觀察 | 需要一起核對 |
| --- | --- |
| 請求延遲增加 | CPU、ThreadPool queue／thread、完成率 |
| 執行緒增多但 CPU 不高 | stack、同步等待、鎖和外部 I/O |
| CPU 持續接近可用上限 | profiler 熱路徑、序列化與計算量 |
| Worker 積壓 | 外部服務、處理並行、ACK、資料庫池與排程 |

這些是診斷方向，不能靠一個 queue 指標直接宣佈根因。先鎖定同一時間窗，再取 trace、stack 與相依延遲。

## 改善前後的比較

將同步等待改成 await、縮短持鎖範圍、限制工作量，或改善 SQL，對不同根因有不同效果。設定更多執行緒可能只是移動瓶頸；增加 Pod 還需核對資料庫連線和 broker 容量。

固定輸入、並行度、資料與暖機條件，記錄請求率、p95／p99、錯誤、CPU、thread 和等待。若沒有這些證據，就保留為假設，避免把某個設定寫成通用最佳值。
