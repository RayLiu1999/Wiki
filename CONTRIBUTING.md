# DevWiki 開發與貢獻指南 (CONTRIBUTING)

本文件說明本地環境、網站檢查與 CI。文章寫作標準見 [CONTENT_GUIDE.md](CONTENT_GUIDE.md)，用語見 [GLOSSARY.md](GLOSSARY.md)。

> [!IMPORTANT]
> 本文件的指令（`pnpm` 等）只用於本機開發與 CI，不可寫進給讀者看的技術專題。

DevWiki 是知識庫，不是 demo 庫：倉庫不含可執行範例專案，也不對文章程式碼做執行驗證。原因見 [ADR 0001](docs/adr/0001-knowledge-base-not-demo-repo.md)。

---

## 1. 開發環境需求

* **Node.js**：`>= 22.17.0 < 23`
* **pnpm**：`>= 10.16.0 < 11`
* **Docker / Docker Compose**：v2.20 以上，只在以容器啟動網站或執行 `pnpm test:container` 時需要

---

## 2. 快速開始

```bash
pnpm install --frozen-lockfile
pnpm dev
```

開發伺服器預設運行於 `http://127.0.0.1:4321/`。

正式 PWA 與 Pagefind 搜尋須先建置，再用另一個連接埠預覽：

```bash
pnpm build
pnpm preview --port 4322
```

開啟 `http://127.0.0.1:4322/`。停止背景預覽可使用 `node scripts/astro.mjs preview stop`。

---

## 3. 本地檢查與 CI

提交前執行完整檢查：

| 指令 | 說明 | 涵蓋範圍 |
| :--- | :--- | :--- |
| `pnpm typecheck` | 型別檢查 | Astro 與 TypeScript 嚴格型別檢驗 |
| `pnpm lint` | 靜態程式碼檢查 | ESLint 10 靜態分析 |
| `pnpm test:articles` | 文章規則 | 章節結構與順序、運作原理的 Mermaid 圖、雲端排查適用範圍、標題、先備知識數量、正文 400～6,000 字與禁止的內部雜訊 |
| `pnpm test` | 單元測試 | 文章規則驗證器，以及收藏功能（localStorage）容錯與持久化 |
| `pnpm build` | 靜態網站建置 | HTML、Pagefind 搜尋索引、Workbox Service Worker 與連結完整性 |
| **`pnpm check`** | **一鍵完整檢查** | 依序執行型別、lint、文章規則、單元測試與正式建置 |

改到 `Dockerfile`、`docker/nginx.conf` 或快取標頭時，另外以容器驗證：

```bash
docker compose up --build --detach --wait
pnpm test:container
```

[GitHub Actions](.github/workflows/check.yml) 配置網站驗收與網站容器兩個 job，保留網站產物，沒有自動正式部署。

---

## 4. 改寫舊文章

尚未改成新章節結構的文章列在 `scripts/legacy-articles.json`，暫時不套用新規則。改寫一個主題時：

1. 依 [CONTENT_GUIDE.md](CONTENT_GUIDE.md) 改寫該主題的每一篇，更新 `lastReviewed`。
2. 把這些檔案從 `scripts/legacy-articles.json` 移除。
3. 執行 `pnpm check`，通過後以一個 commit 提交該主題。
