---
title: "11 容器化與程序邊界"
description: "先建立可重複啟動的商品 API，再理解相依與資料如何配置。"
group: "ecommerce"
order: 11
linkedArticles: ["containers-image-runtime", "containers-compose", "dotnet-hosting", "dotnet-background-services", "networking-request-path", "dotnet-clr-jit", "dotnet-reflection"]
prerequisites: ["ecommerce/testing-observability"]
sources: [{"title": "Docker multi-stage build", "url": "https://docs.docker.com/build/building/multi-stage/"}, {"title": ".NET container images", "url": "https://learn.microsoft.com/en-us/dotnet/core/docker/container-images"}]
---

本機能執行的程式，要搬到其他環境，需要可追溯的產物與啟動方式。容器映像保存執行環境與應用產物；資料庫、機密與環境設定則各自管理。

## 先容器化最小的服務

先把只回傳固定商品的小型 API 放進容器，確認它能啟動、回應和停止，再加入資料庫、Redis 與 RabbitMQ 這些相依服務。一次把整個訂單系統和雲端資源搬進容器，出問題時很難判斷是哪一層造成的。

## 映像和執行設定

用 SDK 階段 publish，再以 runtime 階段執行。映像有明確 tag／digest、非 root 使用者與啟動命令。容器內監聽 8080，主機發布到另一個 port；`EXPOSE` 只描述資訊，對外轉送由執行環境設定。

使用容器名或可達端點連下游；把主機的 localhost 搬到容器設定，會改成指向自身。訂單資料也不寫在容器可丟棄的檔案層。

## 停止也是契約

平台停止容器時，程序要收到 SIGTERM 並配合取消。API 收尾既有請求；Worker 停止領取新工作，完成交易後確認，來不及完成的工作保留重送途徑。Dockerfile 的命令形式與 Host 的停止流程都需要核對。

## 怎麼確認做對了

映像建置後，在容器裡啟動 API，查詢商品與健康端點都有正確回應；送出停止訊號後，程序在期限內收尾結束，沒有被平台強制終止。
