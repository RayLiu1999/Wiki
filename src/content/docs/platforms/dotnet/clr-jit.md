---
title: "CLR、IL、JIT 與程式執行"
description: "從建置到執行分清語言編譯器、Runtime 和機器碼，以及 JIT／AOT 的取捨。"
articleId: "dotnet-clr-jit"
topic: "dotnet"
category: "runtime-performance"
order: 5
tags: ["CLR、IL、JIT 與程式執行", "dotnet"]
difficulty: "intermediate"
learningDepth: "basic"
prerequisites: ["dotnet-sdk-packages"]
relatedArticles: ["aspnet-core-api-styles-aot", "containers-image-runtime"]
applicableVersions: "以 C# 14／.NET 10 說明；框架與供應商差異見內文。"
verifiedWith: "已依官方文件核對概念；文中示意片段未宣稱完成外部服務整合或效能量測。"
lastReviewed: "2026-10-08"
takeaway: "從建置到執行分清語言編譯器、Runtime 和機器碼，以及 JIT／AOT 的取捨。"
noteDates: []
sources: [{"title": "Managed Execution", "url": "https://learn.microsoft.com/en-us/dotnet/standard/managed-execution-process"}, {"title": "Native AOT", "url": "https://learn.microsoft.com/en-us/dotnet/core/deploying/native-aot/"}]
---

## 本篇的 API 背景

商品 API 的 C# 原始碼要先建置，執行時再由平台載入和執行。本篇解釋工具鏈，不需要先啟動電商專案。程式慢、啟動慢與建置失敗是不同問題，先辨識它發生的階段。

## 建置與執行的路徑

~~~text
C# 原始碼
  → 語言編譯器
  → Assembly：IL 與 metadata
  → Runtime 載入、型別與方法處理
  → JIT／其他預先編譯安排
  → CPU 執行機器碼
~~~

SDK 包含開發工具；應用的 target framework 表示目標平台契約；Runtime 提供執行服務。global.json 選 SDK，不能代替所有執行環境和套件版本的管理。

## CLR 提供的責任

Runtime 管理型別資訊、例外、GC、執行緒及與原生程式互動等。JIT 把方法轉成對應 CPU 的機器碼，實際最佳化與分層編譯會因版本和設定而異。診斷時要記錄執行版本、架構、工作負載與是否暖機。

第一次商品查詢可能包含尚未完成的初始化或編譯成本；暖機後的延遲又受資料庫、快取、GC 和流量影響。不能以一次 stopwatch 結果就把所有差異歸給 JIT。

## JIT、ReadyToRun 與 Native AOT

| 方向 | 需要評估 |
| --- | --- |
| 一般 JIT 執行 | Runtime、啟動、暖機與持續最佳化 |
| ReadyToRun | 預先編譯部分程式與產物大小，仍可能有 JIT 工作 |
| Native AOT | 平台特定產物、啟動與記憶體、動態程式和 trimming 相容性 |

API 樣式、反射、序列化、診斷工具與第三方套件要一起驗證。這裡沒有提供效能排名或 AOT 實測；選擇由可重現的建置和部署條件支援。

完成檢查：能把「SDK、編譯器、Assembly、Runtime、JIT、CPU」放到正確位置，再解釋容器映像需要哪種執行環境。
