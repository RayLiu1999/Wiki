---
title: "17 SLO、還原與成本管理"
description: "把買家結果、事件年齡、還原演練和資源費用轉成日常工作。"
group: "ecommerce"
order: 17
environment: "reading"
verification: "電商設計案例；具體的跟做環境與已驗證範圍見實作指南。"
linkedArticles: ["engineering-slo-alerts", "engineering-recovery-cost", "engineering-metrics-tracing", "kubernetes-autoscaling"]
prerequisites: ["ecommerce/delivery"]
sources: [{"title": "SRE objectives", "url": "https://sre.google/sre-book/service-level-objectives/"}, {"title": "Cloud recovery planning", "url": "https://docs.cloud.google.com/architecture/dr-scenarios-planning-guide"}, {"title": "Budgets", "url": "https://docs.cloud.google.com/billing/docs/how-to/budgets"}]
---

系統上線後的目標，是持續讓買家查詢、提交訂單和得到可解釋的結果。節點正常只是部分證據，還要看服務品質、資料恢復與實際資源使用。

## 定義使用者品質

商品查詢的成功率與延遲、合法訂單提交率、通知在期限內完成比例，都是候選 SLI。先確定測量起點、範圍、窗口和排除規則，再協商 SLO 與錯誤預算。

這裡沒有實測正式目標數值。目標應依產品需求與容量證據建立，再用可行動告警與 runbook 連接到日常維護。

## 事件延遲的診斷

通知慢先檢查最老未發布 Outbox，再看 Broker ready／unacked、Consumer 處理與死信。只有 Queue 為空，可能代表事件根本還沒發布。日誌和 Trace 關聯事件及業務識別，Metrics 則保留有限維度。

## 還原演練

備份要在隔離環境實際還原，核對訂單、Outbox、Inbox 與通知結果。資料庫和 Broker 恢復到不同時點時，可能出現重送或遺漏，需要穩定識別和對帳規則。

記錄恢復所需時間與可恢復資料時間點，核對 RTO／RPO 目標。容器重啟成功不能代替磁碟損壞、誤刪或跨區域恢復演練。

## 成本與清理

追蹤運算、負載平衡、資料庫、磁碟、網路和觀測保存成本。alerts-only 預算是通知；適用範圍內的 spend cap 預算則另有觸發與服務暫停機制，需按實際方案核對。

學習環境結束後，按清單確認叢集、IP、負載平衡器、磁碟、Registry 與外部服務，保留需要的資料並驗證清理結果。日常營運把這些動作與權責放進同一份 runbook。
