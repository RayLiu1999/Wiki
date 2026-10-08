---
title: "準備主機與 Compose 實驗環境"
description: "取得範例，確認工具、工作目錄、服務 port 和各快捷指令的用途。"
group: "practice"
order: 1
environment: "host-compose"
verification: "本機教學實驗；實際服務、程序與預期結果見內文。"
linkedArticles: ["containers-compose", "dotnet-sdk-packages"]
prerequisites: ["practice/overview"]
sources: [{"title": "Node releases", "url": "https://nodejs.org/en/download"}, {"title": "pnpm installation", "url": "https://pnpm.io/installation"}, {"title": ".NET installation", "url": "https://learn.microsoft.com/en-us/dotnet/core/install/"}, {"title": "Docker Compose startup", "url": "https://docs.docker.com/compose/how-tos/startup-order/"}]
---

本指南使用這份 Wiki 儲存庫中的`examples/infrastructure`。API 和 Worker 是主機上的 .NET 程序；Docker 只啟動 PostgreSQL、Redis 和 RabbitMQ。指令使用 macOS／Linux 的 shell；Windows 可使用已配置 Docker 與 .NET 的 WSL 環境。

## 取得範例與檢查工具

使用與本站內容相同版本的儲存庫。第一次取得專案可在自己的開發目錄執行：

~~~sh
git clone https://github.com/RayLiu1999/Wiki.git
cd Wiki
~~~

如果正在閱讀本機開發中的網站，使用提供這個網站的同一份專案即可。從 GitHub 下載時，先確認所選版本包含要練習的範例；新指南與程式須一起發布，不能直接混用較早版本。

後續所有`pnpm`與範例檔案命令，都在包含`package.json`的 Wiki 根目錄執行。確認 Node 22.17.0、pnpm 10.16.0、.NET SDK 10.0.105 及已啟動的 Docker／Compose 2.20 以上：

~~~sh
node --version
pnpm --version
dotnet --version
docker version
docker compose version
pnpm install --frozen-lockfile
~~~

.NET 依根目錄`global.json`允許相同 feature band 的 patch 更新。初次還原和拉取映像需要網路；工具缺少時，先依官方安裝來源完成設定，再繼續。

## 服務和 port

| 程序 | 位置 | 預設連線位置 |
| --- | --- | --- |
| PostgreSQL 18.6 | 容器 | 127.0.0.1:15432 |
| Redis 8.2.10 | 容器 | 127.0.0.1:16379 |
| RabbitMQ 4.3.6 | 容器 | AMQP 5673；管理頁 15673 |
| OrderApi | 主機 | http://127.0.0.1:5080 |
| OrderWorker | 主機 | 連接上面三個服務，不提供商品 HTTP 入口 |

若 port 已被佔用，將`.env.example`複製成`.env`調整，並同步使用調整後網址。範例帳密和 port 綁定只供本機學習。

~~~sh
cp examples/infrastructure/.env.example examples/infrastructure/.env
pnpm lab:up
~~~

保留已有`.env`設定時，直接啟動即可。RabbitMQ 管理頁是`http://127.0.0.1:15673/`，登入資料見自己的設定，使用`devwiki` vhost。

## 快捷指令到底做什麼

| 指令 | 實際用途 |
| --- | --- |
| pnpm lab:up／lab:down | 啟動或停止 devwiki-labs 的 Compose 服務，down 保留 volume |
| pnpm lab:redis | 編譯與執行 RedisDemo 小範例 |
| pnpm lab:rabbit | 編譯與執行 RabbitMqDemo 小範例 |
| pnpm lab:api | 編譯與啟動 OrderApi，持續運作 |
| pnpm lab:worker | 編譯與啟動 OrderWorker，持續處理事件 |
| pnpm lab:redis-cli | 進入實驗 Redis 容器中的 CLI |
| pnpm test:infrastructure | 建立隔離環境驗證行為和故障窗口 |

這些別名由`package.json`呼叫實驗管理腳本，再啟動對應工具或 .NET 專案。離開儲存庫根目錄，pnpm 就無法找到相同定義。

## 資料與停止

新的 PostgreSQL volume 初始化商品 1「C# 實務筆記」價格 100 元。既有 volume 會保留之前更新的價格與訂單，修改初始化 SQL 不會升級已有資料。

API／Worker 以 Ctrl+C 停止，`pnpm lab:down`停止容器並保留資料。需要重設時先停止兩個 .NET 程序，再確認只刪自己的實驗資料：

~~~sh
docker compose --env-file examples/infrastructure/.env --project-name devwiki-labs --file examples/infrastructure/compose.yaml down --volumes
pnpm lab:up
~~~

這個重設會刪除 devwiki-labs 的商品、訂單與佇列資料。一般練習不需要重設；保留資料時，依下一篇說明解讀首次快取來源。
