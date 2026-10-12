# DevWiki 開發與貢獻指南 (CONTRIBUTING)

本文件專為 **DevWiki 儲存庫維護者與貢獻者** 撰寫，說明本地環境建置、程式碼驗證、CI 檢核與 Infrastructure Lab 操作流程。

> [!IMPORTANT]
> **職責邊界提醒**：
> 本文件所列之所有指令（`pnpm`、`lab:*` 等）僅限於本機開發與 CI 流程使用，**嚴禁**將內部命令寫入公開面向讀者的技術文章內。文章撰寫標準請參閱 [CONTENT_GUIDE.md](CONTENT_GUIDE.md)。

---

## 1. 開發環境需求

* **Node.js**：`>= 22.17.0 < 23`
* **pnpm**：`>= 10.16.0 < 11`
* **.NET SDK**：`10.0.105` 或同一 feature band 的更新 patch，依 [global.json](global.json) 的 `latestPatch` 選版（執行 `pnpm check`、C# 與 Infrastructure 範例）
* **Docker / Docker Compose**：v2.20 以上（執行整合測試與實驗容器）

---

## 2. 快速開始

安裝相依套件並啟動開發伺服器：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

開發伺服器預設運行於 `http://127.0.0.1:4321/`。

正式 PWA 與 Pagefind 搜尋須先建置，再使用另一個連接埠預覽：

```bash
pnpm build
pnpm preview --port 4322
```

開啟 `http://127.0.0.1:4322/`。`pnpm build` 只需 Node／pnpm；完整 `pnpm check` 另需 .NET SDK。停止背景預覽可使用 `node scripts/astro.mjs preview stop`。

---

## 3. 本地驗證與 CI 指令

在提交程式碼或發布 PR 之前，請務必執行完整的驗證指令：

| 指令 | 說明 | 涵蓋範圍 |
| :--- | :--- | :--- |
| `pnpm typecheck` | 型別檢查 | Astro 與 TypeScript 嚴格型別檢驗 |
| `pnpm lint` | 靜態程式碼檢查 | ESLint 10 靜態分析 |
| `pnpm test:articles` | 文章規則檢驗 | 檢查必要四段式章節、正文 400～6,000 字（不含程式碼區塊與空白）與禁止內部雜訊；目前 91 篇皆適用，舊文章豁免清單為空 |
| `pnpm test:snippets` | 片段一致性比對 | 比對 `examples/infrastructure/snippets.json` 登錄的六段文章 C# 與來源；不編譯或執行 |
| `pnpm test:examples` | C# 範例執行驗證 | 比對 8 篇 C# 文章的第一個 C# 區塊與 `examples/csharp/` 來源，再編譯、執行並核對 `expected.json` 的輸出 |
| `pnpm test` | 單元測試 | 文章規則驗證器，以及收藏功能（localStorage）容錯與持久化 |
| `pnpm build` | 靜態網站建置 | 產出 HTML、Pagefind 搜尋索引、Workbox Service Worker 與連結完整性檢驗 |
| **`pnpm check`** | **一鍵完整驗收** | 依序執行型別、lint、片段核對、文章規則、單元測試、C# 範例與正式建置 |

`pnpm check` 不包含下列環境驗證，依變更範圍另行執行：

| 指令 | 前提與驗證範圍 |
| :--- | :--- |
| `pnpm test:container` | 先以根目錄 `docker compose up --build --detach --wait` 啟動網站；核對路由、搜尋／PWA 資源、快取標頭與 404 |
| `pnpm test:infrastructure` | .NET SDK 與 Docker；建立隔離 Redis／RabbitMQ／PostgreSQL 環境，編譯範例並驗證服務與故障恢復 |
| `dotnet run --project examples/database-connections/ConnectionPatterns.csproj -- --validate` | .NET SDK；編譯並解析 driver 設定，不建立資料庫連線 |

[GitHub Actions](.github/workflows/check.yml) 配置網站驗收、C# 範例、網站容器與基礎設施整合四個 job。資料庫範例的離線設定解析不在這些 job 中；CI 保留網站產物，沒有自動正式部署。

---

## 4. Infrastructure Lab 實驗環境

專案提供基於 Docker 的本地實驗環境，用於驗證 Redis、RabbitMQ 與 PostgreSQL 在真實網路與服務故障下的表現：

```bash
# 啟動實驗容器群（Redis, RabbitMQ, PostgreSQL）
pnpm lab:up

# 執行 Redis 與 RabbitMQ 的 .NET 示範程式
pnpm lab:redis
pnpm lab:rabbit

# 執行基礎設施整合測試（涵蓋快取失效、交易、重試、死信與重啟恢復）
pnpm test:infrastructure

# 停止並移除手動實驗容器與網路，保留資料 volume
pnpm lab:down
```

`pnpm test:infrastructure` 使用獨立 Compose project、隨機本機 port 與全新 volume，結束時移除自己的容器與 volume；不使用手動實驗的資料。API 與 Worker 分別使用 `pnpm lab:api`、`pnpm lab:worker` 啟動，完整操作與驗證範圍見 [實驗 README](examples/infrastructure/README.md)。

---

## 5. 程式碼片段提取機制 (Snippets Harness)

基礎設施片段透過標記提取機制，核對已登錄的文章程式碼與範例來源一致：

1. 在 `examples/` 中的 C# 檔案中標記範圍：
   ```csharp
   // wiki:start:feature-name
   // 欲呈現在文章中的生產級程式碼...
   // wiki:end:feature-name
   ```
2. 在 `examples/infrastructure/snippets.json` 註冊對應的文章路徑與標記名稱。
3. 執行 `pnpm test:snippets` 驗證文章內的 Markdown 程式碼區塊與源碼完全一致。

此機制目前涵蓋六段基礎設施片段，編譯與實際服務行為由 `pnpm test:infrastructure` 驗證。C# 的八個完整範例另由 `pnpm test:examples` 核對；其他文章片段須在 `verifiedWith` 記錄實際驗證方式與未執行範圍。
