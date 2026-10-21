---
title: "03 買家登入與資料權限"
description: "讓買家查看自己的購物車與訂單，分清驗證身分和授權資源。"
group: "ecommerce"
order: 3
linkedArticles: ["aspnet-core-authentication", "aspnet-core-middleware", "gke-workload-identity"]
prerequisites: ["ecommerce/product-api"]
sources: [{"title": "ASP.NET Core authorization", "url": "https://learn.microsoft.com/en-us/aspnet/core/security/authorization/introduction?view=aspnetcore-10.0"}]
---

買家登入後要查看自己的訂單。只有「有登入」不足以保護資料，還要核對這筆訂單是否屬於目前使用者。未來賣家角色同樣需要限制到對應商品與店家。

## 身分如何進入用例

Authentication 驗證 cookie 或 token 等憑證，建立使用者 principal；Authorization 再依 policy、角色、claim 或實際資源決定能否操作。API 不應相信請求 body 自己提供的 buyerId，而應從已驗證身分與伺服器規則取得所有者。

清單查詢以買家範圍過濾，單筆資源核對 ownership，更新動作再驗證當下權限。資源授權和資料庫約束各自保護不同邊界。

## 使用者與平台身分

買家 token 用於電商權限；Pod 的 ServiceAccount 用於平台；Google Cloud IAM 用於雲端資源。這三者不能互相代替。把 Worker 配成有權讀取機密，不會因此取得代表買家下單的授權。

## 失敗與回應

未帶有效憑證和已登入但沒有權限，分別需要清楚的回應政策。決定是否隱藏資源存在時，要讓契約保持一致，避免利用不同錯誤訊息推斷其他買家的訂單。

跨站請求、cookie 設置、token 期限與更新方式取決於前端與身份提供者架構，應按實際認證機制設計。日誌保留操作識別與必要審計資料，避免保存完整 token 或個人敏感內容。

## 驗證案例

買家 A 可以讀取自己的訂單，買家 B 無法讀取或修改 A 的訂單；偽造 buyerId 也不能改變所有者。
