---
title: "Factory、Builder 與物件建立邊界"
description: "從合法訂單與結帳草稿分清建立入口、組裝步驟與額外抽象的成本。"
articleId: "architecture-creation-patterns"
topic: "architecture"
category: "object-patterns"
order: 5
tags: ["Factory、Builder 與物件建立邊界", "architecture"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["csharp-records-invariants", "architecture-domain-modeling"]
relatedArticles: ["architecture-behavior-patterns", "aspnet-core-dependency-injection"]
applicableVersions: "以 C# 14／.NET 10 說明；框架與供應商差異見內文。"
verifiedWith: "已依官方文件核對概念；文中示意片段未宣稱完成外部服務整合或效能量測。"
lastReviewed: "2026-10-08"
takeaway: "從合法訂單與結帳草稿分清建立入口、組裝步驟與額外抽象的成本。"
noteDates: []
sources: [{"title": "Domain Model", "url": "https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/net-core-microservice-domain-model"}, {"title": "DI", "url": "https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection"}]
---

## 本篇的結帳背景

買家選商品與數量，系統需要建立有效的訂單。這裡比較資料尚在組裝與物件已可使用的時機；付款、庫存與資料庫提交屬於另一些責任。下面的型別是記憶體教學範例。

## 建立入口先回答什麼

建構子適合直接且清楚的建立。靜態 Factory 可以用名稱表達用途、檢查條件或回傳結果；Factory Method 則把建立決策交給可替換的行為。它們不能只因名稱含 Factory 就視為同一種模式。

~~~csharp title="有效建立入口（型別示意）"
public sealed record OrderDraft(int ProductId, int Quantity)
{
    public static OrderDraft Create(int productId, int quantity)
    {
        if (productId <= 0)
            throw new ArgumentOutOfRangeException(nameof(productId));
        if (quantity <= 0)
            throw new ArgumentOutOfRangeException(nameof(quantity));
        return new OrderDraft(productId, quantity);
    }
}
~~~

這個 record 仍有公開建構子，Create 是方便且驗證的入口，並未封住所有建立方式。若業務要求禁止非法狀態，必須設計建構可見性、序列化和修改入口，並用行為測試核對。

## Builder 用在哪個階段

複雜結帳草稿可能逐步加入地址、商品和選項。Builder 累積組裝狀態，Build 時檢查是否完整；最終結果要與 Builder 的可變集合分離，避免 Build 後繼續修改草稿卻改到已建立訂單。

| 方案 | 適合的問題 | 成本 |
| --- | --- | --- |
| 建構子／明確方法 | 參數少、建立規則清楚 | 較容易閱讀與驗證 |
| Factory | 建立用途、實作或結果需要選擇 | 增加建立入口與型別責任 |
| Builder | 多步驟組裝、可選欄位與完整性檢查 | 額外狀態和錯誤時機 |

## 與 DI、EF Core 的關係

DI 組裝服務相依；訂單建立表達領域規則。DI 容器不會自動知道可售庫存或付款狀態。EF Core materialization 與序列化可能有不同建立路徑，要保持型別契約一致。

完成檢查：能指出哪個物件還是草稿、在哪裡成為有效資料，以及誰負責庫存和資料提交。簡單訂單不必先引入 Builder，再尋找需求填滿它。
