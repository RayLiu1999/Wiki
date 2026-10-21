# AGENTS.md

DevWiki：用繁體中文白話解釋軟體技術原理與取捨的知識庫，靜態 PWA（Astro 7 + Starlight、Pagefind、Workbox、Mermaid）。以電商後端為主線，從 C#／.NET 寫到 GKE 與 EKS。它是知識庫，不是 demo 庫：沒有可執行範例專案，也不做執行驗證（[ADR 0001](docs/adr/0001-knowledge-base-not-demo-repo.md)）。

動手前先讀相關的一份：

- [CONTENT_GUIDE.md](CONTENT_GUIDE.md)：白話五條、章節結構、雲端排查格式、部署假設、正確性原則
- [GLOSSARY.md](GLOSSARY.md)：本站用語（技術專題、電商章節、雲端排查、官方來源等），寫作與溝通都用這些詞
- [CONTRIBUTING.md](CONTRIBUTING.md)：環境、檢查指令、改寫舊文章的流程
- [README.md](README.md)：功能、啟動方式、PWA 行為、發布
- [docs/adr/](docs/adr/)：架構決策；改變定位或流程前先讀

`docs/archive/` 是歷史紀錄，篇數與功能可能已過時，不要當成現行規格。

## 環境

- Node `>=22.17.0 <23`、pnpm `>=10.16.0 <11`；安裝用 `pnpm install --frozen-lockfile`。不需要 .NET SDK。
- Docker／Compose v2.20+：只在容器驗證網站時需要。
- `pnpm dev` 用 4321 埠；正式預覽用 `pnpm build && pnpm preview --port 4322`，兩者不要共用埠（Service Worker 快取會互相干擾）。停止背景預覽：`node scripts/astro.mjs preview stop`。

## 專案結構

| 位置 | 內容 |
| --- | --- |
| `src/content/docs/<主題>/` | 技術專題（`docs` collection），目錄與檔名決定網址 |
| `src/content/handbook/{start,ecommerce}/` | 導讀與電商章節（`handbook` collection），各目錄的 `overview.md` 為入口 |
| `src/content.config.ts` | 兩個 collection 的 frontmatter schema |
| `src/lib/taxonomy.ts` | 主題與分類定義 |
| `src/lib/catalog.ts` | handbook 路由映射、難度與文章類型標籤 |
| `src/pages/practice/ecommerce/` | 已移除的實作指南舊網址的轉址頁 |
| `src/pwa/`、`scripts/build-pwa.mjs` | Service Worker 與預快取清單 |
| `scripts/lib/article-rules.mjs` | 文章規則（章節、雲端排查主題、標題、先備知識、字數） |
| `scripts/legacy-articles.json` | 尚未改寫成新結構、暫時豁免規則的文章 |
| `dist/`、`.astro/` | 建置產物，不要手動編輯 |

## 檢查

改完後依變更範圍執行，回報時如實說明跑了哪些、沒跑哪些：

- 一般變更：`pnpm check`（型別、lint、文章規則、單元測試、正式建置）。
- 改到 Dockerfile、`docker/nginx.conf`、快取標頭：`docker compose up --build --detach --wait` 後跑 `pnpm test:container`。
- 新增或修改 Mermaid 圖：在瀏覽器核對文字、連線、深淺色與窄螢幕捲動。

## 撰寫技術專題的硬性規則

- 章節依序為 `## 這是什麼`、`## 運作原理`、`## 常見錯誤與正確寫法`、`## 使用邊界`；雲端排查主題（資料存取、Redis、RabbitMQ、容器、網路、Kubernetes、GKE、.NET、工程實務）再加 `## 雲端排查`。速查可用 `omitSections` 寫明理由省略章節，但「這是什麼」不能省略。
- 照白話五條寫：先講是什麼、名詞第一次出現就解釋、先講機制再貼程式、不用誇張語氣、段落短。
- **正確性靠官方來源**：指令、指標名稱、設定鍵與預設值都要能在該篇 `sources` 找到；找不到就不寫，不可編造看起來合理的名稱。
- 雲端排查分叢集／託管服務／應用程式三層，每層分 GKE、EKS 小節，並遵守 CONTENT_GUIDE 的部署假設表。
- 「運作原理」至少一張 Mermaid 圖。含括號的標籤用雙引號包住；泛型角括號用 `#lt;`、`#gt;`。
- 標題寫成「技術：讀者想解決的問題」，不用「實戰」「生產級」「致命」「三劍客」「終極」。
- `articleId` 發布後不可更改。`prerequisites` 最多 2 篇且只列必讀；其餘放 `relatedArticles`。handbook 的 `prerequisites` 用 `group/slug`，`linkedArticles` 用 `articleId`。
- `difficulty` 為 `beginner` 或 `advanced`；`lastReviewed` 只在實際改寫或審閱時更新。
- 正文 400～6,000 字（不含程式碼區塊與空白）。
- **正文不可出現本倉庫專屬內容**：`pnpm`、`lab:*` 指令或內部類別。
- 程式碼是說明用片段，使用 .NET 10／C# 慣用寫法（DI、`ILogger`、`CancellationToken`、`Meter`、官方 SDK），上方註明相依套件與命名空間。
- 改寫完一個主題，把它的檔案從 `scripts/legacy-articles.json` 移除。

## 新增主題時

依序更新：`src/lib/taxonomy.ts`、實際內容、[astro.config.mjs](astro.config.mjs) 的 Starlight sidebar、`scripts/build-pwa.mjs` 的基本頁預快取清單；屬於雲端排查範圍的主題，同時加進 `scripts/lib/article-rules.mjs` 的 `cloudTopics`。主題入口頁由共用路由產生，不需另寫。

## 修改功能或篇數後

README 的篇數與功能列表、CONTRIBUTING 的檢查範圍要同步更新。

## Commit

使用 Conventional Commits，scope 為主題或區域，描述用繁體中文，例如：`feat(redis): …`、`fix(wiki): …`、`docs(wiki): …`、`refactor(wiki): …`。每個 commit 都要通過 `pnpm check`。
