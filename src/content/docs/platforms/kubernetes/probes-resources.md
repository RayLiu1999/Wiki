---
title: "探針、資源與安全更新"
description: "用商品查詢與通知工作分清 startup、readiness、liveness、資源和停止邊界。"
articleId: "kubernetes-probes-resources"
topic: "kubernetes"
category: "k8s-reliability"
order: 4
tags: ["探針、資源與安全更新", "kubernetes"]
difficulty: "intermediate"
learningDepth: "deep"
prerequisites: ["kubernetes-workloads", "dotnet-hosting"]
relatedArticles: ["dotnet-gc-memory", "dotnet-background-services"]
applicableVersions: "以 Kubernetes 現行核心 API 與 Docker 容器模型說明；GKE 限制另見平台文章。"
verifiedWith: "已核對 Kubernetes／Docker 官方概念；叢集操作與環境驗證狀態見獨立實作指南。"
lastReviewed: "2026-10-08"
takeaway: "用商品查詢與通知工作分清 startup、readiness、liveness、資源和停止邊界。"
noteDates: []
sources: [{"title": "Probes", "url": "https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/"}, {"title": "Resource management", "url": "https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/"}, {"title": "Disruptions", "url": "https://kubernetes.io/docs/concepts/workloads/pods/disruptions/"}]
---

API 程序啟動後，可能還沒完成初始化；執行中的程序也可能因記憶體、下游等待或更新而失去服務能力。Kubernetes 需要幾種不同的訊號，不能用一個「健康」端點涵蓋所有行為。

## 三種探針各回答什麼

| 探針 | 問題 | 失敗效果 |
| --- | --- | --- |
| startup | 初始化是否完成？ | 超過門檻後重啟；成功前不執行其他兩種探針 |
| readiness | 現在能承接對應流量嗎？ | 從可用伺服器端點移除，程序仍可運作 |
| liveness | 程序是否需要重新啟動才能恢復？ | 超過門檻後重啟容器 |

商品查詢允許 Redis 停機回資料庫時，Redis 連線失敗不必直接判定 API 不可用。資料庫故障也未必適合觸發所有 Pod 重啟；重啟不能修復外部故障，反而會增加重連壓力。探針應快速、有明確界線，避免做完整購買流程。

## Requests 與 limits

CPU request 參與排程並代表競爭時的資源份額，CPU limit 會限制可用處理量。記憶體 request 用於排程；超過 memory limit 可能導致 OOM kill。記憶體 limit 也要容納 GC heap 以外的原生記憶體、堆疊和其他使用量。

數值先從可測量的小範例開始，再以實際流量、P95 延遲、CPU throttling、RSS 和 OOM 事件調整。高 requests 會影響可排程容量與成本；過低可能在競爭時失去合理容量。

## 更新時如何停止

停止期間 API 應退出可接流量的狀態並處理已收到的請求。Worker 應停止領取新工作，讓已完成交易的結果被確認；無法在時間內完成時，保留可重送的狀態。Host 的停止 timeout、工作取消行為、preStop 時間和 `terminationGracePeriodSeconds` 必須一起核對。

程序收到 SIGTERM 後仍要有對應處理，否則宣告很長的寬限時間也不能證明工作已安全收尾。目前本機 OrderWorker 使用 Console 取消流程，尚未驗證 Kubernetes 停止訊號；平台遷移時需補齊這一點。

## PDB 的範圍

PodDisruptionBudget 限制遵守 Eviction API 的自願中斷，不能保證硬體故障、所有強制刪除或任何形式的不可用。Deployment 自身的 rolling update 要靠更新策略控制，不能只靠 PDB。

驗證更新時，應同時觀察成功率、舊工作收尾和新 Pod 就緒。`rollout status` 通過是平台證據，還要搭配業務請求結果。
