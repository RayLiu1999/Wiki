---
title: "把小型商品 API 做成容器"
description: "使用獨立部署範例，確認映像建置、port、商品回應與程序停止。"
group: "practice"
order: 4
environment: "host-compose"
verification: "已建置映像並驗證商品 200／404、健康端點、非 root 使用者與 SIGTERM 正常停止；不使用外部服務。"
linkedArticles: ["containers-image-runtime", "dotnet-hosting", "kubernetes-probes-resources"]
prerequisites: ["practice/overview"]
sources: [{"title": "Docker multi-stage", "url": "https://docs.docker.com/build/building/multi-stage/"}, {"title": "Docker stop", "url": "https://docs.docker.com/reference/cli/docker/container/stop/"}, {"title": ".NET images", "url": "https://learn.microsoft.com/en-us/dotnet/core/docker/container-images"}]
---

本篇使用`examples/deployment/ProductApi`，是一個 .NET 10 的獨立 API。它只回傳固定商品與程序識別，沒有資料庫、Redis、訂單或 Worker。根目錄 Dockerfile 則用於 Wiki 網站，這次使用的是部署範例自己的 Dockerfile。

## 前提與工作目錄

使用同一版本的 Wiki 儲存庫、已啟動的 Docker，以及 macOS／Linux shell。所有命令從 Wiki 根目錄執行。建置會拉取官方 .NET 10 SDK 與 ASP.NET 10 runtime 映像，Dockerfile 以 multi-platform manifest digest 固定產物，需要網路及映像架構支援。容器使用自己的 SDK，與主機實驗 global.json 選用的 SDK 分別管理；本範例沒有把主機的 global.json 帶進 build context。

尚未取得範例時，先看[環境準備指南的下載段落](/practice/ecommerce/setup/#取得範例與檢查工具)。只執行容器範例時，主機不需要 Node、pnpm 或 .NET SDK。

如果想先在主機確認，可以使用 .NET SDK：

~~~sh
dotnet run --project examples/deployment/ProductApi --urls http://127.0.0.1:5081
~~~

另一個終端機使用下方 curl 檢查，再以 Ctrl+C 停止。接著容器也使用 5081，執行前確認主機程序已停止。

## 建置與啟動

~~~sh
docker build --file examples/deployment/Dockerfile --tag devwiki-product-api:local examples/deployment
docker run --detach --name devwiki-product-api-learning --publish 127.0.0.1:5081:8080 devwiki-product-api:local
~~~

最後的`examples/deployment`是 build context；Dockerfile 中的 COPY 相對於它。容器內監聽 8080，主機 127.0.0.1:5081 轉送到容器 8080。映像的 USER app 讓程序以非 root 執行。

## 觀察 HTTP 回應

~~~sh
curl http://127.0.0.1:5081/products/1
curl -i http://127.0.0.1:5081/products/999
curl -i http://127.0.0.1:5081/health/live
curl -i http://127.0.0.1:5081/health/ready
docker logs devwiki-product-api-learning
~~~

商品 1 回應 200，包含 id 為 1、name 保溫杯、price 為 120 和 servedBy。servedBy 取自程序環境名稱，容器中通常對應主機名稱。商品 999 回應 404；兩個健康路徑回應 200 與 Healthy，目前都只檢查程序本身，沒有外部服務。

## 停止與清理

~~~sh
docker stop --time 30 devwiki-product-api-learning
docker logs devwiki-product-api-learning
docker inspect --format '{{.State.ExitCode}}' devwiki-product-api-learning
docker rm devwiki-product-api-learning
~~~

`docker stop`先發送停止訊號，再等待寬限。ASP.NET Host 合作停止，日誌應出現應用關閉訊息；正常停止 exit code 為 0。這只驗證小型 API 的停止流程，不代表現有 Console OrderWorker 已通過 SIGTERM 驗證。

保留映像可接著練習 kind。結束全部練習後，可用`docker image rm devwiki-product-api:local`移除自己的示範映像。
