---
title: ".NET 時間與時區實務：DateTime 陷阱與跨時區結算"
description: "深入剖析 DateTimeKind 隱形換算偏差、跨時區帳務結算差額、夏令時間切換地雷，以及 TimeProvider 可測試時間架構。"
articleId: "dotnet-time-zones"
topic: "dotnet"
category: "time-identifiers"
order: 1
tags: [".NET", "DateTime", "DateTimeOffset", "時區", "TimeProvider", "跨時區結算", "夏令時間"]
articleType: "deep-dive"
prerequisites: ["csharp-syntax-traps"]
relatedArticles: ["dotnet-identifiers", "dotnet-hosting"]
applicableVersions: ".NET 8 / .NET 10、C# 12+ / 14"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "所有業務時間戳一律使用 DateTimeOffset 並以 UTC 儲存；純日期與純時間使用 DateOnly/TimeOnly；時間相依邏輯依賴 TimeProvider。"
sources:
  - title: "Microsoft Learn：在 DateTime、DateTimeOffset、TimeSpan 和 TimeZoneInfo 之間做選擇"
    url: "https://learn.microsoft.com/zh-tw/dotnet/standard/datetime/choosing-between-datetime"
  - title: "Microsoft Learn：TimeProvider 類別"
    url: "https://learn.microsoft.com/zh-tw/dotnet/api/system.timeprovider"
---

## 案發現場

某跨境電商在月初結算全球銷售報表時，財務端核對出高達上百萬元的跨日帳目偏差；另一起重大事故中，歐美市場切換夏令時間（Daylight Saving Time, DST）當天，每日早晨 09:00 定時發送折價券的排程 Worker，因硬性累加 24 小時在同一天內被重複觸發兩次，導致數萬張高額折價券超發。

排查原因：後端系統隨處充斥 `DateTime.Now`，在存入資料庫時丟失了時區資訊（轉換為 `DateTimeKind.Unspecified`）；且缺乏對夏令時間切換日「當天僅有 23 小時或 25 小時」的邊界防護。

## 致命反模式 vs. 正確解法

```text
【跨時區時間標準流動】
用戶端 (台灣 UTC+8) ──► 傳輸 ISO 8601 (2026-10-10T20:00:00+08:00)
                              │
                              ▼
資料庫與核心中台 ──────► 一律以 UTC 儲存 (2026-10-10T12:00:00Z)
                              │
                              ▼
報表與帳單展示 ────────► 依租戶指定 IANA 時區精確轉譯 (如 Asia/Taipei)
```

### 坑一：濫用 DateTime.Now 儲存時間戳

`DateTime.Now` 嚴重依賴主機本機時區。當服務搬遷至預設 UTC 的 Linux 容器時，存入資料庫的時間會莫名少 8 小時。

### 坑二：使用 TimeSpan.FromHours(24) 計算跨日排程

夏令時間開始當天只有 23 小時，結束當天有 25 小時。直接累加 24 小時會導致時間漂移或重複執行。

~~~csharp title="Program.cs"
// ✅ Good：運用 DateTimeOffset、IANA 時區轉換與 TimeProvider
var provider = TimeProvider.System;

// 1. 取得全局絕對時間點（強制 UTC）
DateTimeOffset utcNow = new(2026, 10, 10, 3, 26, 0, TimeSpan.Zero);
Console.WriteLine($"目前 UTC 時間戳: {utcNow:yyyy-MM-ddTHH:mm:ssZ}");

// 2. 依業務指定時區進行展示轉換（支援跨平台 IANA / Windows 時區識別碼）
string targetTimeZoneId = OperatingSystem.IsWindows() ? "Taipei Standard Time" : "Asia/Taipei";
TimeZoneInfo localZone = TimeZoneInfo.FindSystemTimeZoneById(targetTimeZoneId);
DateTimeOffset userLocalTime = TimeZoneInfo.ConvertTime(utcNow, localZone);

Console.WriteLine($"目標時區時間: {userLocalTime:yyyy-MM-dd HH:mm:ss zzz}");

// 3. 純日期使用 DateOnly，免除時區與時間戳干擾
DateOnly businessDate = DateOnly.FromDateTime(userLocalTime.DateTime);
Console.WriteLine($"業務結算日: {businessDate:yyyy-MM-dd}");
~~~

預期輸出：
```text
目前 UTC 時間戳: 2026-10-10T03:26:00Z
目標時區時間: 2026-10-10 11:26:00 +08:00
業務結算日: 2026-10-10
```

## 踩坑與避坑指南

* **抽象可測試時間架構（TimeProvider）**：.NET 8+ / .NET 10 引進 `System.TimeProvider`。生產環境注入 `TimeProvider.System`，單元測試時注入 `FakeTimeProvider`，即可精確快轉時間驗證逾時與夏令邊界，徹底告別全域靜態 `DateTime.UtcNow` 難以測試的惡夢。
* **避坑原則（什麼時候千萬不要用 `DateTimeOffset`？）**：
  * **純日期（如生日、國定假日）或營業時間（如每日 09:00 開門）**：此類業務語意不屬於「時間軸上的絕對單一瞬間」。若硬帶時區，在不同國家使用者查看時會因時差跨日，應強制採用 .NET 6+ 引進的 `DateOnly` 與 `TimeOnly`。

## 線上排查指令

線上檢查主機時區與資料庫時間偏差：

```bash
# 1. 檢視 Linux 容器內部時間與時區設定
timedatectl || cat /etc/timezone

# 2. 檢查 PostgreSQL 或 MySQL 欄位型態是否保留 UTC 資訊
# PostgreSQL: 必須為 timestamptz (timestamp with time zone)
# MySQL: 推薦 bigint (毫秒戳) 或 UTC datetime
```
