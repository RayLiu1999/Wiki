---
title: "Compose 與本機服務邊界"
description: "分清主機程序、容器網路、port 映射、volume 和服務就緒。"
articleId: "containers-compose"
topic: "containers"
category: "container-environments"
order: 2
tags:
  - "Compose 與本機服務邊界"
  - "containers"
difficulty: "intermediate"
learningDepth: "deep"
prerequisites:
  - "containers-image-runtime"
relatedArticles: []
applicableVersions: "以 Docker Compose v2 及 Docker 容器模型說明；.NET 10。"
verifiedWith: "已核對 Docker Compose 官方概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-10"
takeaway: "分清主機程序、容器網路、port 映射、volume 和服務就緒。"
sources:
  - title: "Compose networking"
    url: "https://docs.docker.com/compose/how-tos/networking/"
  - title: "Compose startup order"
    url: "https://docs.docker.com/compose/how-tos/startup-order/"
---

## 案發現場

在現代雲原生微服務開發中，Docker Compose 是本機一鍵拉起相依基礎設施（API、PostgreSQL、Redis、RabbitMQ）的標準工具。然而，剛接觸容器化開發的工程師，常會深陷以下兩類典型的「環境啟動崩潰」：

事故現場一：**`depends_on` 的「假就緒」連線拒絕**。
開發者撰寫了 Compose 檔案，並在 `api` 服務配置了 `depends_on: [postgres]`。然而每次執行 `docker compose up`，API 容器在 2 秒內直接 CrashLoop 退出：
```text
Npgsql.NpgsqlException (0x80004005): Connection refused (postgres:5432)
   at Npgsql.Internal.NpgsqlConnector.ConnectAsync(...)
```
工程師困惑地抱怨：「我明明已經寫了 `depends_on: postgres`，為什麼 API 還會抱怨資料庫拒絕連線？」。
真相是：**Docker Compose 預設的 `depends_on` 僅代表「PostgreSQL 容器進程已經被啟動（Process Running）」，完全不管資料庫引擎是否已經完成磁碟初始化、跑完復原日誌並準備好接受連線！** 在這短短 2~5 秒的資料庫啟動空窗期內，API 嘗試連線必定直接被拒絕。

事故現場二：**網路邊界混淆（Localhost 迷思）**。
工程師在 `appsettings.Development.json` 中配置了連線字串：`Host=localhost;Port=5432`。
當 API 以本機程序（`dotnet run`）執行時一切正常；但當 API 本身也被打包放進 Docker Compose 運行時，立刻噴出 `Connection refused`。
因為在容器的網路名稱空間（Network Namespace）中，**容器內部的 `localhost` 指向的是該容器自己**，而不是主機，也不是其他容器！

---

## 反模式與正確解法

### 反模式一：陽春 depends_on 缺乏健康檢查探針

單純寫 `depends_on: - postgres`，無法解決資料庫、Broker 啟動時間差引發的競態條件。

### 正確解法一：利用 service_healthy 與健康檢查探針

在被依賴的服務上定義 `healthcheck`，並讓上游服務等待其達到 `condition: service_healthy`：

```yaml
# 正確解法：生產級本機微服務環境 docker-compose.yml
services:
  postgres:
    image: postgres:18-alpine
    container_name: dev-postgres
    environment:
      POSTGRES_USER: app_user
      POSTGRES_PASSWORD: dev_password
      POSTGRES_DB: ecommerce_db
    ports:
      - "5432:5432" # 僅供主機上的 pgAdmin 或本機 IDE 存取
    volumes:
      - postgres-data:/var/lib/postgresql/data # 具名 Volume 持久化資料！
    networks:
      - backend-net
    # 關鍵：定義健康檢查探針
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app_user -d ecommerce_db"]
      interval: 3s
      timeout: 3s
      retries: 5
      start_period: 5s

  redis:
    image: redis:8-alpine
    container_name: dev-redis
    ports:
      - "6379:6379"
    networks:
      - backend-net
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 3s
      timeout: 3s
      retries: 3

  api:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: dev-ecommerce-api
    environment:
      ASPNETCORE_ENVIRONMENT: Development
      # 關鍵：容器間通訊使用服務名稱（Service Name）作為 DNS 主機名！
      ConnectionStrings__DefaultDatabase: "Host=postgres;Port=5432;Database=ecommerce_db;Username=app_user;Password=dev_password"
      ConnectionStrings__Redis: "redis:6379"
    ports:
      - "8080:8080"
    networks:
      - backend-net
    # 關鍵：嚴格等待所有相依服務達到真正「健康就緒」狀態！
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

networks:
  backend-net:
    driver: bridge

volumes:
  postgres-data: # 宣告具名 Volume，容器刪除後測試資料不遺失
```

---

### 反模式二：未掛載具名 Volume 導致測試資料重啟即失

直接使用匿名容器執行 PostgreSQL，每次執行 `docker compose down`，昨天辛苦建立的測試訂單與使用者帳號全數被抹除。

### 正確解法二：具名 Volume（Named Volumes）隔離持久化

在 Compose 最底層宣告 `volumes: [postgres-data]`，Docker 會在主機專屬目錄中妥善保存資料庫檔案，即使多次執行 `down` 與 `up`，資料依然完整保留。

---

## 踩坑與避坑指南

### 1. 容器存取宿主機（Host Machine）服務的特殊位址
- **現象**：API 運行在容器內，需要存取運行在宿主機本地（非容器）的某個本機服務（例如主機上用 npm 跑的 Mock Server）。
- **踩坑點**：容器內無法透過 `localhost` 存取宿主機。
- **規則**：
  - 在 Docker Desktop（macOS / Windows）中，使用特殊 DNS 名稱：**`host.docker.internal`**。
  - 在 Linux 環境下，需在 Compose 的 service 區塊加上：
    ```yaml
    extra_hosts:
      - "host.docker.internal:host-gateway"
    ```

### 2. Bind Mount 檔案目錄權限衝突（Permission Denied）
- 若將主機本地目錄直接掛載進容器（例如掛載日誌目錄 `./logs:/app/logs`）：
- **踩坑點**：若容器內部是以非 Root 使用者（如前面提到的 UID 1654 `$APP_UID`）執行，而主機目錄擁有者為 UID 1000 或 Root，容器會因權限不足拋出 `UnauthorizedAccessException: Access to the path is denied`。
- **解法**：在主機預先建立該目錄並調整權限，或優先使用 Docker Named Volume 取代 Bind Mount。

---

## 線上排查指令

### 1. 檢視 Compose 服務啟動順序與真實健康狀態

```bash
docker compose ps
```
**健康狀態解讀：**
- `running (healthy)`：代表服務已啟動且通過 healthcheck，準備好接受流量！
- `running (health: starting)`：正在啟動中，依賴它的服務會安全等待。
- `running (unhealthy)`：探針連續失敗，需排查日誌。

### 2. 檢測容器間 DNS 解析與網路連通性

若懷疑 API 連不上 PostgreSQL，直接在 API 容器內部執行網路探測：
```bash
# 測試是否能解析 postgres 服務名稱並連通 5432 連接埠
docker compose exec api nc -zv postgres 5432
```
若輸出 `postgres (172.x.x.x:5432) open`，代表容器網路完全暢通！

### 3. 查看特定健康檢查失敗的詳細日誌

```bash
# 檢查特定容器最近 5 次 healthcheck 的輸出結果與錯誤訊息
docker inspect --format='{{json .State.Health}}' dev-postgres
```
