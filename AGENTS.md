# AGENTS.md

DevWiki：繁體中文的軟體知識庫靜態 PWA（Astro 7 + Starlight、Pagefind、Workbox、Mermaid），以電商後端為主線，從 C#／.NET 寫到 GKE。網站不需資料庫、帳號或機密。

完整說明以這三份為準，動手前先讀相關的一份：

- [README.md](README.md)：功能、啟動方式、PWA 行為、發布
- [CONTRIBUTING.md](CONTRIBUTING.md)：環境、驗證指令、Infrastructure Lab、片段提取機制
- [CONTENT_GUIDE.md](CONTENT_GUIDE.md)：讀者設定、四段式文章結構、程式碼與寫作規範

`docs/archive/` 是歷史紀錄，其中的篇數與功能可能已過時，不要當成現行規格。

## 環境

- Node `>=22.17.0 <23`、pnpm `>=10.16.0 <11`；安裝用 `pnpm install --frozen-lockfile`。
- .NET SDK 依 [global.json](global.json)（10.0.105 feature band），`pnpm check` 與 C# 範例需要。
- Docker／Compose v2.20+：容器驗證與 Infrastructure Lab 需要。
- `pnpm dev` 用 4321 埠；正式預覽用 `pnpm build && pnpm preview --port 4322`，兩者不要共用埠（Service Worker 快取會互相干擾）。停止背景預覽：`node scripts/astro.mjs preview stop`。

## 專案結構

| 位置 | 內容 |
| --- | --- |
| `src/content/docs/<主題>/` | 技術專題（`docs` collection），目錄與檔名決定網址 |
| `src/content/handbook/{start,ecommerce,practice}/` | 導讀、電商章節、實作指南（`handbook` collection），各目錄的 `overview.md` 為入口 |
| `src/content.config.ts` | 兩個 collection 的 frontmatter schema |
| `src/lib/taxonomy.ts` | 主題與分類定義 |
| `src/lib/catalog.ts` | handbook 路由映射 |
| `src/pwa/`、`scripts/build-pwa.mjs` | Service Worker 與預快取清單 |
| `scripts/` | 建置、驗證、Lab 腳本 |
| `examples/csharp/` | 8 個完整 C# 範例，`expected.json` 登錄預期輸出 |
| `examples/infrastructure/` | Redis／RabbitMQ／PostgreSQL 實驗，`snippets.json` 登錄文章片段 |
| `examples/database-connections/`、`examples/deployment/` | 連線範例、K8s／GKE 宣告（未實際連線或部署驗證） |
| `dist/`、`.astro/` | 建置產物，不要手動編輯 |

## 驗證

改完後依變更範圍執行，回報時如實說明跑了哪些、沒跑哪些：

- 一般變更：`pnpm check`（型別、lint、片段核對、文章規則、單元測試、C# 範例、正式建置）。
- 只改文章、沒有 .NET SDK 時：至少跑 `pnpm test:articles` 與 `pnpm build`，並說明 `test:examples` 未執行。
- 改到 `examples/infrastructure/`：另跑 `pnpm test:infrastructure`（需 Docker）。
- 改到 Dockerfile、`docker/nginx.conf`、快取標頭：`docker compose up --build --detach --wait` 後跑 `pnpm test:container`。
- 新增或修改 Mermaid 圖：須在瀏覽器核對文字、連線、深淺色與窄螢幕捲動。

## 撰寫技術文章的硬性規則

- `articleId` 發布後不可更改；`prerequisites`、`relatedArticles` 使用 `articleId`。handbook 的 `prerequisites` 則用 `group/slug`，`linkedArticles` 用 `articleId`。
- 正文採四段式：`## 案發現場`、`## 致命反模式 vs. 正確解法`、`## 踩坑與避坑指南`、`## 線上排查指令`。不適用的章節以 `omitSections` 寫明理由，不要灌水湊章節。
- 正文 400～6,000 字（不含程式碼區塊與空白），由 `pnpm test:articles` 檢查。
- **正文不可出現本倉庫專屬內容**：`pnpm`、`lab:*` 指令，或 `LabDiagnostics`、`LabJson` 等內部類別。讀者不會 clone 本倉庫；啟動步驟、port、觀察結果寫在 `practice` 實作指南。
- `verifiedWith` 只寫實際做過的驗證，不可把文件核對寫成編譯或連線驗證，並註明未執行範圍。
- 程式碼使用 .NET 10／C# 慣用寫法：DI、`ILogger`、`CancellationToken`、`Meter`、官方 SDK，不寫假類別。
- 8 篇 C# 完整範例文章：第一個 C# 區塊用 `~~~csharp` 圍欄，內容須與 `examples/csharp/` 的 `.cs` 一致。
- 登錄於 `snippets.json` 的片段：修改時兩邊同步，來源以 `// wiki:start:<marker>` / `// wiki:end:<marker>` 標記。
- Mermaid：含括號的標籤用雙引號包住；泛型角括號用 `#lt;`、`#gt;`。
- 用語：說明用繁體中文，識別字用英文並遵循 .NET 命名慣例，專有名詞保留英文或附中文說明。

## 新增主題時

依序更新：`src/lib/taxonomy.ts`、實際內容、[astro.config.mjs](astro.config.mjs) 的 Starlight sidebar、`scripts/build-pwa.mjs` 的基本頁預快取清單。主題入口頁由共用路由產生，不需另寫。

## 修改功能或篇數後

README 的篇數與功能列表、CONTRIBUTING 的驗證範圍要同步更新。

## Commit

使用 Conventional Commits，scope 為主題或區域，描述用繁體中文，例如：`feat(redis): …`、`fix(wiki): …`、`docs(wiki): …`、`refactor(audit): …`。
