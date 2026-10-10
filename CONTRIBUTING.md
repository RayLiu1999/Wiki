# DevWiki 開發與貢獻指南 (CONTRIBUTING)

本文件專為 **DevWiki 儲存庫維護者與貢獻者** 撰寫，說明本地環境建置、程式碼驗證、CI 檢核與 Infrastructure Lab 操作流程。

> [!IMPORTANT]
> **職責邊界提醒**：
> 本文件所列之所有指令（`pnpm`、`lab:*` 等）僅限於本機開發與 CI 流程使用，**嚴禁**將內部命令寫入公開面向讀者的技術文章內。文章撰寫標準請參閱 [CONTENT_GUIDE.md](CONTENT_GUIDE.md)。

---

## 1. 開發環境需求

* **Node.js**：`>= 22.17.0 < 23`
* **pnpm**：`>= 10.16.0 < 11`
* **.NET SDK**：`10.0.105` 或以上（驗證 C# 與 Infrastructure 範例）
* **Docker / Docker Compose**：v2.20 以上（執行整合測試與實驗容器）

---

## 2. 快速開始

安裝相依套件並啟動開發伺服器：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

開發伺服器預設運行於 `http://127.0.0.1:4321/`。

---

## 3. 本地驗證與 CI 指令

在提交程式碼或發布 PR 之前，請務必執行完整的驗證指令：

| 指令 | 說明 | 涵蓋範圍 |
| :--- | :--- | :--- |
| `pnpm typecheck` | 型別檢查 | Astro 與 TypeScript 嚴格型別檢驗 |
| `pnpm lint` | 靜態程式碼檢查 | ESLint 10 靜態分析 |
| `pnpm test:articles` | 文章規則檢驗 | 檢查文章必要四段式章節、字數規範（400 ~ 6,000 字）與禁止內部雜訊 |
| `pnpm test:snippets` | 片段一致性比對 | 比對文章中的 C# 程式碼區塊與 `examples/` 可編譯源碼是否逐字一致 |
| `pnpm test:examples` | C# 範例執行驗證 | 編譯並執行 `examples/csharp/` 範例，驗證標準輸出 |
| `pnpm test` | 前端單元測試 | 收藏功能（localStorage）容錯與持久化單元測試 |
| `pnpm build` | 靜態網站建置 | 產出 HTML、Pagefind 搜尋索引、Workbox Service Worker 與連結完整性檢驗 |
| **`pnpm check`** | **一鍵完整驗收** | 依序執行上述所有靜態檢核、測試與建置 |

---

## 4. Infrastructure Lab 實驗環境

專案提供基於 Docker 的本地實驗環境，用於驗證 Redis、RabbitMQ 與 PostgreSQL 在真實網路與服務故障下的表現：

```bash
# 啟動實驗容器群（Redis, RabbitMQ, PostgreSQL）
pnpm lab:up

# 查看個別服務紀錄
pnpm lab:redis
pnpm lab:rabbit

# 執行基礎設施整合測試（涵蓋快取失效、交易、重試、死信與重啟恢復）
pnpm test:infrastructure

# 停止並清除實驗容器
pnpm lab:down
```

---

## 5. 程式碼片段提取機制 (Snippets Harness)

為了保證文章中引用的程式碼 100% 可編譯且符合最新語法，本專案採用標記提取機制：

1. 在 `examples/` 中的 C# 檔案中標記範圍：
   ```csharp
   // wiki:start:feature-name
   // 欲呈現在文章中的生產級程式碼...
   // wiki:end:feature-name
   ```
2. 在 `examples/infrastructure/snippets.json` 註冊對應的文章路徑與標記名稱。
3. 執行 `pnpm test:snippets` 驗證文章內的 Markdown 程式碼區塊與源碼完全一致。
