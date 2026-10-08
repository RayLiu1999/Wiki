---
title: "EF Core 樂觀並行與庫存競爭"
description: "從兩人修改商品理解版本比對、衝突結果，以及交易和並行控制的分工。"
articleId: "data-access-concurrency"
topic: "data-access"
category: "transactions"
order: 9
tags: ["EF Core 樂觀並行與庫存競爭", "data-access"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["data-access-tracking", "data-access-transactions"]
relatedArticles: ["csharp-thread-safety", "kubernetes-autoscaling"]
applicableVersions: "以 C# 14／.NET 10 說明；框架與供應商差異見內文。"
verifiedWith: "已依官方文件核對概念；文中示意片段未宣稱完成外部服務整合或效能量測。"
lastReviewed: "2026-10-08"
takeaway: "從兩人修改商品理解版本比對、衝突結果，以及交易和並行控制的分工。"
noteDates: []
sources: [{"title": "EF Core 並行控制", "url": "https://learn.microsoft.com/en-us/ef/core/saving/concurrency"}, {"title": "EF Core 交易", "url": "https://learn.microsoft.com/en-us/ef/core/saving/transactions"}]
---

## 本篇的多人背景

兩位店主都載入同一版商品，其中一位先改價，另一位晚些提交。API 必須決定是否接受覆蓋、要求重讀，或依規則合併。買家同時購買最後一件商品是另一個需要並行設計的用例。

## 版本比對的機制

EF Core 的 concurrency token 保存載入時版本，更新時把原始版本加進條件。如果預期更新一列但沒有匹配資料，SaveChanges 會以 DbUpdateConcurrencyException 表達衝突。新增資料撞唯一約束通常是 provider 的約束例外，應分開處理。

以下用現有 `products` 的欄位示意版本比對；$1 是新價格，$2 是商品 ID，$3 是讀取時的版本。現有實驗改價 API 沒有採用這個版本條件，這是設計示例。

~~~sql
UPDATE products
SET price = $1, version = version + 1
WHERE id = $2 AND version = $3;
~~~

沒有匹配可能是版本已改或資料已移除；用例需判斷適合的回應，不能一律無限重試。

## 衝突策略

| 選擇 | 使用條件 | 必須核對 |
| --- | --- | --- |
| 拒絕並要求重讀 | 使用者需要知道資料變了 | 新版本、錯誤與重新提交規則 |
| 重讀後重算 | 操作可按目前狀態重算 | 重試次數、交易與業務有效性 |
| 合併 | 領域允許明確的合併規則 | 欄位來源與是否違反不變量 |

SQL Server rowversion 的映射是供應商特定功能。應用自行管理 token 時，哪些修改會換版本需要一個統一入口，避免部分更新忘記換版本。

## 庫存需要另一份規則

避免超賣可以設計「庫存足夠才原子扣減」或版本比對後提交；訂單、明細、庫存與 Outbox 的成功範圍一起決定交易。資料庫交易不等於每個競爭結果都符合規則，單一程序的 lock 也不能保護其他 Pod。

可重現的驗證應讓兩個獨立工作讀到同一版，再競爭提交，核對成功數、剩餘庫存、訂單和事件。這篇提供設計與失敗分析，沒有宣稱現有實驗已完成庫存或多 Pod 驗證。
