---
title: "GC、記憶體配置、保留與容器限制"
description: "分清配置速度、存活物件、GC 回收與外部資源，建立記憶體問題的診斷順序。"
articleId: "dotnet-gc-memory"
topic: "dotnet"
category: "runtime-performance"
order: 6
tags: ["GC、記憶體配置、保留與容器限制", "dotnet"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["csharp-cancellation-disposable", "dotnet-clr-jit"]
relatedArticles: ["dotnet-profiling", "kubernetes-probes-resources"]
applicableVersions: "以 C# 14／.NET 10 說明；框架與供應商差異見內文。"
verifiedWith: "已依官方文件核對概念；文中示意片段未宣稱完成外部服務整合或效能量測。"
lastReviewed: "2026-10-08"
takeaway: "分清配置速度、存活物件、GC 回收與外部資源，建立記憶體問題的診斷順序。"
noteDates: []
sources: [{"title": "GC 基礎", "url": "https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/fundamentals"}, {"title": "GC 效能", "url": "https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/performance"}, {"title": "Memory 與 Span 指南", "url": "https://learn.microsoft.com/en-us/dotnet/standard/memory-and-spans/memory-t-usage-guidelines"}]
---

## 本篇的商品查詢背景

API 每次查商品可能建立 DTO、字串和序列化 buffer；快取、事件訂閱與 Singleton 也可能長時間持有物件。這些情境分別影響配置量和存活記憶體。本篇提供機制與診斷方法，沒有宣稱量測目前實驗的 heap。

## GC 回收的條件

GC 追蹤從 roots 可以到達的受管理物件；仍有可達參考的物件不能因為「用完了」就被回收。世代是對存活及回收成本的安排，LOH 與其他記憶體區域則有不同特性，細節需依 Runtime 和設定核對。

Dispose 清理資源和 GC 回收記憶體是不同責任。連線、交易和 handle 的及時釋放，需要對應的所有權契約；強制 GC.Collect 不能取代設計或診斷。

## 配置與保留分別觀察

| 現象 | 優先證據 | 可能的下一步 |
| --- | --- | --- |
| 配置率高、回收頻繁 | allocation、GC 次數／時間、熱路徑 | 減少重複字串、投影與 buffer 配置 |
| 負載結束後仍持續成長 | heap、存活物件與 root path | 查快取上限、事件訂閱和長命容器 |
| 程序 RSS 大於 managed heap | 程序及原生記憶體、執行緒等 | 核對 native allocation 和平台計算範圍 |
| 容器 OOM | 容器限制、工作負載與事件 | 核對總用量，並查配置和保留原因 |

單一截圖不足以證明 leak。先定義相同負載的開始、暖機、停止及觀察時間，再比較變化。

## Memory、Span 與池化

Span 表示一段記憶體的存取視圖，Memory 提供適合跨非同步邊界的形式。buffer 的所有者與有效期間要明確；向池借出的陣列可能比要求的長，歸還後不能繼續使用，敏感內容的清理也需設計。

池化和少配置不等於全部情境更快。高頻商品查詢若需要改善，先找到熱路徑，再比較同等輸入與結果下的配置量、延遲和記憶體持有。

## 接回 Kubernetes

Memory request 用於資源安排，limit 與程序可用資源影響容器行為；managed heap 只是總用量的一部分。調高 limit 可改善某些資源不足，仍需找出資料是否無界累積。Pod 重啟會重設單程序資料，也會打斷正在執行的工作。
