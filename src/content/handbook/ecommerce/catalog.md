---
title: "01 商品、價格與領域模型"
description: "先定義商品和價格語意，再決定 DTO、實體和值物件。"
group: "ecommerce"
order: 1
linkedArticles: ["csharp-syntax-traps", "csharp-value-reference-types", "architecture-domain-modeling", "architecture-creation-patterns", "data-access-large-table-queries"]
prerequisites: ["ecommerce/overview"]
sources: [{"title": "Microsoft modern web application architecture", "url": "https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures"}]
---

店家販售保溫杯，現在單價 120 元。買家今天下單、明天店家調價，昨天的訂單仍應保留當時成交內容。這個需求先決定資料語意，再影響 C# 型別與資料保存方式。

## 哪些資料會改變

商品有穩定識別和可變名稱、價格、上架狀態。訂單明細保存下單時的名稱、單價與數量快照，避免歷史訂單跟著商品更新。商品 API 回應是對外 DTO；領域實體則維持業務規則，兩者不一定相同。

| 資料 | 語意 | 常見型別選擇 |
| --- | --- | --- |
| 商品 | 持續追蹤同一個商品 | 具識別的 class |
| 金額 | 數值加幣別及合法範圍 | 有明確相等性和值域的值物件 |
| 查詢回應 | 對外資料形狀 | DTO／record |
| 訂單明細 | 歷史交易快照 | 訂單一致性邊界內的資料 |

## 規則放在哪裡

價格不能為負、數量必須大於零、未上架商品不能建立新訂單。輸入格式由 API 驗證，業務規則由用例或領域維護，資料庫再以約束保護必要的不變量。公開 setter、`required` 或 record 的 `with` 都不會自動執行業務驗證。

struct 的 `default` 可能產生不符合金額規則的值；如果使用值型別，必須處理預設狀態。Factory 可統一建立條件，但也要確認其他建構途徑是否會繞過。

## 延伸到多賣家

先單店，未來商品加入 sellerId 時，資料查詢、寫入權限和訂單拆分都會改變。應記錄目前「一個店家」的假設，避免把賣家、物流與結算偷偷混進第一階段。

## 可檢驗的結果

價格更新後，新的查詢顯示新價格，既有訂單快照不變；不合法金額與數量被拒絕。

## 資料庫延伸

查價與商品列表流量增加時，延伸閱讀[資料庫容量專題](/projects/ecommerce/database-capacity/)，先核對查詢範圍、投影與索引。
