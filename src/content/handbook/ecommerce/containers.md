---
title: "11 容器化與程序邊界"
description: "先建立可重複啟動的商品 API，再理解相依與資料如何配置。"
group: "ecommerce"
order: 11
environment: "reading"
verification: "已有獨立商品 API 的映像與 HTTP／停止驗證；業務實驗與叢集部署範圍另見指南。"
linkedArticles: ["containers-image-runtime", "containers-compose", "dotnet-hosting", "dotnet-background-services"]
prerequisites: ["ecommerce/testing-observability"]
sources: [{"title": "Docker multi-stage build", "url": "https://docs.docker.com/build/building/multi-stage/"}, {"title": ".NET container images", "url": "https://learn.microsoft.com/en-us/dotnet/core/docker/container-images"}]
---

本機能執行的程式，要搬到其他環境，需要可追溯的產物與啟動方式。容器映像保存執行環境與應用產物；資料庫、機密與環境設定則各自管理。

## 三種範例的角色

網站根目錄的 Dockerfile 用來提供 Wiki 靜態網站。快取與訊息實驗由主機執行 API／Worker，Compose 啟動 PostgreSQL、Redis 和 RabbitMQ。容器部署指南另外提供固定商品回應的小型 API，用來觀察 HTTP、探針與停止。

這三者的 port、資料與啟動命令各有用途。先從獨立 API 學部署，就能避免把整個訂單系統和雲端資源一次混在一起。

## 映像和執行設定

用 SDK 階段 publish，再以 runtime 階段執行。映像有明確 tag／digest、非 root 使用者與啟動命令。容器內監聽 8080，主機發布到另一個 port；`EXPOSE` 只描述資訊，對外轉送由執行環境設定。

使用容器名或可達端點連下游；把主機的 localhost 搬到容器設定，會改成指向自身。訂單資料也不寫在容器可丟棄的檔案層。

## 停止也是契約

平台停止容器時，程序要收到 SIGTERM 並配合取消。API 收尾既有請求；Worker 停止領取新工作，完成交易後確認，來不及完成的工作保留重送途徑。Dockerfile 的命令形式與 Host 的停止流程都需要核對。

## 可以觀察的結果

建置映像，啟動商品 API，查詢固定商品與健康端點，再停止容器。指南提供的回應會含服務程序識別，讓後續 Kubernetes 多副本觀察有明確線索。[進入容器指南](/practice/ecommerce/containers/)。
