---
title: "xUnit、NSubstitute 與商業行為測試"
description: "從可觀察的商業結果選測試層級，保留基礎設施整合驗證，避免只檢查 mock 呼叫。"
articleId: "engineering-business-tests"
topic: "engineering"
category: "testing"
order: 1
tags: ["xUnit", "Fact", "Theory", "NSubstitute", "interface", "單元測試", "整合測試", "商業邏輯", "Infrastructure"]
difficulty: "intermediate"
prerequisites: ["architecture-domain-modeling", "architecture-application-patterns"]
relatedArticles: ["data-access-transactions", "dotnet-time-zones", "engineering-metrics-tracing"]
applicableVersions: "以 .NET 10 生態系與本文列出的官方文件核對；套件及資料庫供應商的差異見內文。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-07"
takeaway: "測試保護規則與結果；替身用於必要邊界，真實資料庫行為仍需要整合測試。"
noteDates: ["2026-05-27", "2026-05-28", "2026-06-25"]
sources: [{"title": "xUnit.net：Getting started", "url": "https://xunit.net/docs/getting-started/v3/getting-started"}, {"title": "NSubstitute：Getting started", "url": "https://nsubstitute.github.io/help/getting-started/"}, {"title": "Microsoft Learn：EF Core 測試策略", "url": "https://learn.microsoft.com/en-us/ef/core/testing/choosing-a-testing-strategy"}]
---

## 從失敗會造成什麼後果開始

優先測試「已取消訂單不能付款」「非法數量不能建立」「付款拒絕時不完成訂單」等行為，涵蓋正常、拒絕與重要邊界。測試名稱描述規則，斷言結果與狀態，而不是私有方法或欄位安排。

| 工具 / 層級 | 用途 |
| --- | --- |
| xUnit `[Fact]` | 一個固定情境下的規則 |
| xUnit `[Theory]` | 同一規則搭配多組資料 |
| NSubstitute | 外部 port 的介面替身與可控結果 |
| 真實 provider 整合測試 | SQL 翻譯、mapping、約束、交易與 migration |
| API 測試 | Binding、Authentication、Policy、錯誤契約 |

## 以非法數量測試型別契約

以下測試片段沿用「record 與有效狀態」中的 PositiveQuantity；需放入有 xUnit 依賴及領域型別的測試專案，未在本站建置。xUnit v2 / v3 的 runner 與專案配置不同，要依實際版本選擇。

~~~csharp title="QuantityTests.cs（整合片段）"
using Xunit;

public sealed class QuantityTests
{
    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Quantity_must_be_positive(int value)
    {
        Assert.Throws<ArgumentOutOfRangeException>(
            () => new PositiveQuantity(value));
    }
}
~~~

## 替身隔離真正的外部邊界

NSubstitute 可建立 Substitute.For<IPaymentGateway>()，設定付款拒絕或連線失敗，再呼叫被測試的 Handler，檢查商業結果。介面最直接；class 替身受到 virtual 成員等限制，不宜讓測試逼著領域類別全面開放覆寫。

只設定 mock、呼叫 mock、再確認 mock 被呼叫，是在驗證測試工具。互動斷言僅在「必須寄出一次通知」等外部效果本身就是契約時使用，避免綁死無關的呼叫次數與內部順序。

## 邏輯獨立，基礎設施仍要驗證

Domain 通常不需要 database 或 HTTP；Application 用替身控制必要外部條件。但 EF InMemory 或 SQLite 不會完整重現正式 provider 的 SQL、型別與鎖定。交易、schema 與 provider 行為應用實際引擎的整合測試驗證。

非同步测试要 await，取消使用可控 token，時間用可注入時鐘；不要依靠長時間 sleep 才偶然通過。
