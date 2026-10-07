---
title: "DateTimeOffset、UTC 與時區"
description: "區分時間點、當地日曆時間與時區規則，避免 Unix 單位和日光節約時間的誤用。"
articleId: "dotnet-time-zones"
topic: "dotnet"
category: "time-identifiers"
order: 3
tags: ["DateTimeOffset", "DateTime", "UTC", "Unix timestamp", "DST", "日光節約時間", "TimeZoneInfo", "時區"]
difficulty: "intermediate"
prerequisites: ["csharp-variables"]
relatedArticles: ["dotnet-identifiers", "data-access-type-mapping", "engineering-metrics-tracing"]
applicableVersions: "以 .NET 10 生態系與本文列出的官方文件核對；套件及資料庫供應商的差異見內文。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-07"
takeaway: "Offset 能標示時間點，不能代表完整時區；未來排程還需要所在地的時區規則。"
noteDates: ["2026-05-27", "2026-06-08", "2026-07-01"]
sources: [{"title": "Microsoft Learn：日期時間型別選擇", "url": "https://learn.microsoft.com/en-us/dotnet/standard/datetime/choosing-between-datetime"}, {"title": "Microsoft Learn：轉換時區", "url": "https://learn.microsoft.com/en-us/dotnet/standard/datetime/converting-between-time-zones"}, {"title": "Microsoft Learn：DateTimeOffset.ToUnixTimeSeconds", "url": "https://learn.microsoft.com/en-us/dotnet/api/system.datetimeoffset.tounixtimeseconds?view=net-10.0"}]
---

## 先決定資料的時間意義

已發生事件通常需要唯一時間點，可用 DateTimeOffset 並在儲存及交換時採 UTC。生日等日曆日期可用 DateOnly；「每週一當地上午九點」則需要本地時間及 time zone id，不能永久固定成某個 UTC offset。

DateTimeOffset 包含日期時間與 offset，能換算同一時間點；offset +08:00 不會告訴你它屬於哪個時區或未來會不會切換 DST。

## 將時間點轉成 UTC 與 Unix

以下為 .NET API 片段，未單獨納入可執行範例驗證。

~~~csharp title="時間轉換片段"
var local = new DateTimeOffset(2026, 7, 1, 9, 0, 0, TimeSpan.FromHours(8));
DateTimeOffset utc = local.ToUniversalTime();
long seconds = utc.ToUnixTimeSeconds();
DateTimeOffset restored = DateTimeOffset.FromUnixTimeSeconds(seconds);
// local 與 restored 表示相同時間點；UTC 時刻為 2026-07-01 01:00:00 +00:00。
~~~

Unix seconds 與 milliseconds 差 1000 倍；欄位註解及 API 契約要寫清楚單位。不要用目前當地時區去猜一個沒有 offset 的舊字串。

## 日光節約時間的缺口與重疊

切換 DST 時，有些本地時間不存在，有些會對應到兩個時間點。可用 TimeZoneInfo 的 IsInvalidTime、IsAmbiguousTime 檢查，再依商業規則選擇拒絕、調整或指定 offset。

跨 Windows / Linux 部署時，核對 time zone id 格式、ICU / tzdata 與規則版本；不要自行用固定加減小時取代 TimeZoneInfo。時區規則可能更新，未來排程與歷史顯示要分別設計。

測試時間相關規則時，注入時鐘或 TimeProvider，涵蓋日界線、DST 與秒 / 毫秒單位，避免依賴測試機器的目前時間與所在地。
