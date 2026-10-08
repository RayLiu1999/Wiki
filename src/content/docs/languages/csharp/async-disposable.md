---
title: "IAsyncDisposable、await using 與資源所有權"
description: "需要等待的清理如何安排，scope、取消與例外時由誰完成釋放。"
articleId: "csharp-async-disposable"
topic: "csharp"
category: "practice"
order: 29
tags: ["IAsyncDisposable、await using 與資源所有權", "csharp"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["csharp-disposable", "csharp-async-await"]
relatedArticles: ["dotnet-background-services", "kubernetes-probes-resources"]
applicableVersions: "以 C# 14／.NET 10 說明；框架與供應商差異見內文。"
verifiedWith: "完整 Console 範例納入 test:examples；外部交易與連線停止另需整合驗證。"
lastReviewed: "2026-10-08"
takeaway: "需要等待的清理如何安排，scope、取消與例外時由誰完成釋放。"
noteDates: []
sources: [{"title": "非同步清理", "url": "https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/implementing-disposeasync"}, {"title": "DI 指南", "url": "https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection-guidelines"}]
---

## 本篇的資源背景

Worker 處理一則訂單事件，可能持有交易、連線或非同步 scope。清理本身若需要等待，就要把完成時間納入工作生命週期。本篇的 `DemoSession` 只印出釋放時機，是教學型別；沒有真的建立資料庫連線。

## 清理與垃圾回收的分工

IDisposable 提供同步清理契約，IAsyncDisposable 提供回傳 ValueTask 的非同步清理契約。GC 管理受管理記憶體，不能代替及時結束交易、歸還連線或完成外部資源清理。

## 完整的最小範例

~~~csharp
await using (var session = new DemoSession())
{
    Console.WriteLine("處理訂單");
}
Console.WriteLine("離開工作範圍");

public sealed class DemoSession : IAsyncDisposable
{
    public async ValueTask DisposeAsync()
    {
        await Task.Yield();
        Console.WriteLine("非同步清理完成");
    }
}
~~~

預期輸出：

~~~text
處理訂單
非同步清理完成
離開工作範圍
~~~

## 所有權與 scope

await using 在正常離開與例外時安排清理；不要先離開 scope，再把使用其中服務的 Task 交給其他程序。DI 建立的服務由相應容器或 scope 管理，取得共用 Singleton 的使用端不應自行任意釋放。

自行建立的資源要明確交接所有權。可繼承的實作還需考慮基底類別與同步／非同步清理協作；sealed 範例刻意讓責任較小。重複釋放、清理失敗和未初始化欄位都需要設計。

## 取消與平台停止

業務 token 已取消，不表示可以略過所有清理。停止期間需要等待的資源操作、Host 停止時間和容器終止寬限應互相配合；強制終止仍可能跳過程式的清理，因此交易回復、訊息重送和冪等不可只相依 finally。

完成檢查：能指出誰建立資源、誰擁有它、何時完成清理，以及如果程序被直接終止，下一次工作如何恢復。
