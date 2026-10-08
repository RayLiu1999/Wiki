---
title: "SLO、錯誤預算與可行動告警"
description: "從商品查詢和通知完成時間定義品質，再用證據建立告警。"
articleId: "engineering-slo-alerts"
topic: "engineering"
category: "operations"
order: 6
tags: ["SLO、錯誤預算與可行動告警", "engineering"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["engineering-metrics-tracing"]
relatedArticles: ["kubernetes-autoscaling", "engineering-recovery-cost"]
applicableVersions: "依 2026-10-08 的 Google Cloud／Kubernetes 官方文件核對；可用功能、地區與費率以實際平台為準。"
verifiedWith: "已核對官方概念與責任範圍；未建立 GCP 資源、執行正式部署或量測雲端成本。"
lastReviewed: "2026-10-08"
takeaway: "從商品查詢和通知完成時間定義品質，再用證據建立告警。"
noteDates: []
sources: [{"title": "SRE service level objectives", "url": "https://sre.google/sre-book/service-level-objectives/"}, {"title": "SRE alerting on SLOs", "url": "https://sre.google/workbook/alerting-on-slos/"}]
---

Pod 都是 Running，買家仍可能查不到商品；Queue 數量不大，某些通知卻可能已經延遲很久。維運指標應從使用者結果開始，再接到程序和基礎設施的證據。

## SLI 與 SLO

SLI 是可量測的服務品質，例如符合條件的商品查詢中，成功且在目標時間內完成的比例。SLO 是某個觀察窗口內希望達到的目標。定義時要說明請求範圍、成功條件、測量位置、窗口與排除條件。

本篇的比例與時限都是設計練習；本站沒有正式流量，也沒有實測 SLA。不要將示意數值直接複製為正式承諾。

| 用例 | 候選 SLI | 分析時要核對 |
| --- | --- | --- |
| 商品查詢 | 成功率、延遲分布 | 快取命中與回源是否分開觀察 |
| 建立訂單 | 合法請求提交成功率、延遲 | 驗證拒絕和系統錯誤如何分類 |
| 背景通知 | 在期限內完成的比例 | 起點是訂單提交還是 Broker 接收 |
| 事件處理 | 最老未完成工作的年齡 | Outbox 和 Queue 要一起看 |

## 錯誤預算

錯誤預算表達觀察窗口內可以容忍多少未達目標的結果。它把品質目標與變更節奏連在一起，但需要團隊事先定義預算耗盡時的行動，而不是只畫一張圖。

Burn rate 表示預算消耗速度。不同長短窗口可以幫助辨識快速大範圍故障與持續的小幅惡化，實際閾值應按流量、目標與可行動性設計。

## 告警如何讓人能處理

每個告警要有影響範圍、查詢連結、負責人和 runbook。使用者品質告警用來判定服務影響；CPU、RSS、池等待和重試量則提供診斷線索。僅因短暫 CPU 升高就呼叫值班者，可能沒有可行動內容。

通知逾時時，先檢查 Outbox 未發布年齡，再看 Broker 待處理／未 Ack 工作、Consumer 成功率與死信。單一 Queue 為空，可能只是發布器尚未把資料庫工作送出。

## 演練與修訂

停止相依服務、錯誤事件和更新測試確認告警會觸發、能指向責任，並在恢復後解除。每次事件記錄時間、業務影響與修復證據，再調整閾值和操作說明。具體情境見 [日常維運章節](/projects/ecommerce/operations/)。
