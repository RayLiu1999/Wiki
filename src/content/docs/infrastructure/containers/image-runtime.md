---
title: "映像、容器與 .NET 程序"
description: "從建置產物到執行中的程序，理解映像分層、設定、權限與停止訊號。"
articleId: "containers-image-runtime"
topic: "containers"
category: "container-basics"
order: 1
tags: ["映像、容器與 .NET 程序", "containers"]
difficulty: "intermediate"
learningDepth: "basic"
prerequisites: []
relatedArticles: ["kubernetes-workloads", "dotnet-background-services"]
applicableVersions: "以 Kubernetes 現行核心 API 與 Docker 容器模型說明；GKE 限制另見平台文章。"
verifiedWith: "已核對 Kubernetes／Docker 官方概念；叢集操作與環境驗證狀態見獨立實作指南。"
lastReviewed: "2026-10-08"
takeaway: "從建置產物到執行中的程序，理解映像分層、設定、權限與停止訊號。"
noteDates: []
sources: [{"title": "Docker multi-stage build", "url": "https://docs.docker.com/build/building/multi-stage/"}, {"title": "Docker container overview", "url": "https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-a-container/"}, {"title": "Microsoft .NET container images", "url": "https://learn.microsoft.com/en-us/dotnet/core/docker/container-images"}]
---

容器部署回答的是：同一個 API，如何在另一台機器使用一致的執行環境啟動？映像是檔案系統與啟動設定的版本化產物，容器則是以該映像啟動的隔離程序。容器共享主機核心，並不各自攜帶一套完整作業系統。

## 從程式到映像

.NET SDK 負責還原、編譯與 publish；ASP.NET runtime 負責執行發布產物。Multi-stage Dockerfile 讓建置階段使用 SDK，最終映像只帶執行環境與產物。映像較小，仍需要管理基底版本、安全更新與相容性。

| 元件 | 保存什麼 | 商品 API 的例子 |
| --- | --- | --- |
| Image | 唯讀分層、預設命令與設定 | 某次 commit 建出的 API |
| Container | 程序、暫時可寫層與資源使用 | 正在處理查詢的 API 實例 |
| Volume | 獨立於容器可寫層的資料 | 本機 PostgreSQL 實驗資料 |
| Registry | 映像版本與存取控制 | GCP Artifact Registry |

容器重建會失去可寫層。正式訂單不能只寫在 API 容器檔案裡；使用外部資料庫，或由有明確儲存責任的服務保存。刪除映像和刪除 volume 也是不同操作。

## API 與 Worker 如何啟動

API 需要監聽明確的 port；Worker 主要連向資料庫和 Broker，不必因為容器化就暴露 HTTP port。`EXPOSE` 是映像的資訊，沒有自動替主機或 Kubernetes 建立對外路由。容器內的 `localhost` 指向自身；另一個容器裡的 Redis 要透過服務名稱或可達端點連線。

採用執行形式的啟動命令，例如 `ENTRYPOINT ["dotnet", "ProductApi.dll"]`，可以讓 .NET 程序直接收到停止訊號。程序收到 SIGTERM 後，仍需由 Host 和工作實作合作，停止接新工作、等待或取消進行中工作，再釋放資源。

## 執行時才提供設定

商品 API 的映像不應把每個環境的資料庫密碼烤進分層。環境變數、設定掛載與身分授權在執行時提供；建置機密則使用建置工具的 secret 機制。`.dockerignore` 要排除 `.env`、Git、相依快取和本機輸出，避免無關內容進入 build context。

使用非 root 使用者並確認工作目錄、寫入位置與 port 權限。限制 CPU／記憶體並不能代替程序內的併發和連線上限，兩者會共同影響穩定性。

## 在電商案例中使用

先把無狀態商品查詢 API 做成映像，驗證 HTTP 回應與停止，再部署兩個副本。這一步只驗證部署流程；庫存一致性、登入和可靠訊息仍由各自的業務與資料設計負責。[容器實作指南](/practice/ecommerce/containers/)提供獨立的小型 API、完整命令及驗證範圍。
