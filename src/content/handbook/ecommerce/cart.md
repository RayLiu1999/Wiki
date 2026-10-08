---
title: "04 購物車與共享狀態"
description: "用購物車討論集合、期限、並行更新與結帳時的重新驗證。"
group: "ecommerce"
order: 4
environment: "reading"
verification: "電商設計案例；本章描述規則與方案，尚未提供完整業務實作。"
linkedArticles: ["csharp-collections", "redis-data-types-ttl", "redis-concurrency", "csharp-thread-safety", "data-access-concurrency"]
prerequisites: ["ecommerce/identity"]
sources: [{"title": "Redis data types", "url": "https://redis.io/docs/latest/develop/data-types/"}]
---

買家把兩個保溫杯加入購物車，晚一點再結帳。這段時間價格與庫存可能改變。購物車代表購買意圖，還不是庫存保留或已成立訂單。

## 保存哪些資料

以買家或匿名購物車識別保存商品 ID、數量與更新時間。畫面可以顯示當時報價，但結帳時重新讀取價格、庫存與上架狀態，並讓買家確認變更。

集合通常按商品 ID 合併數量；重複點擊加入和並行更新要有明確語意。例如「設為 2 個」與「增加 2 個」是不同命令，重送後的結果也不同。

## 資料庫或 Redis

資料庫適合需要較長保存、審計或跨裝置穩定恢復的購物車。Redis 可以用 Hash 等模型與 TTL 管理短期狀態，但必須定義過期、持久化、故障與買家可接受的資料遺失。

程序內 Dictionary 只屬於某個 API 實例。在多 Pod 下，下一次請求可能到另一實例，因此共享購物車不能僅放在 Singleton。

## 並行與期限

兩個裝置同時更新，可以使用版本條件、原子操作或一致性協定。程序內 lock 只處理同一個程序的競爭。TTL 是狀態期限，是否每次存取延長應依產品規則決定；它不會保留商品庫存。

購物車合併、登入前後轉換與到期行為，也需有明確規則，避免匿名資料直接覆蓋已登入狀態。

## 驗證案例

同一商品重複加入後數量符合命令語意；兩裝置競爭不會悄悄丟失更新；到期時畫面說明已過期；結帳前價格改變可以辨識並重新確認。現有實驗沒有購物車端點，本章用於討論共享狀態設計。
