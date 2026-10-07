# DevWiki 軟體知識庫

以繁體中文整理軟體知識的靜態 PWA，目前提供 6 個主題、48 篇文章。介面沿用已確認的「書頁閱讀」設計，預設淺色與紫色點綴，提供深色切換。

## 開始使用

需求：Node 22.17.0、pnpm 10.16.0。驗證 C# 範例另需 .NET SDK 10.0.105（同一 feature band 的更新 patch 亦可）。

~~~sh
pnpm install --frozen-lockfile
pnpm dev
~~~

開發伺服器的網址會顯示在終端機。完整 PWA 與 Pagefind 搜尋需以正式建置預覽：

~~~sh
pnpm check
pnpm preview --port 4321
~~~

開啟 http://127.0.0.1:4321/。網站不需要帳號、資料庫或環境機密。開發模式使用文章內容索引提供搜尋；正式建置使用 Pagefind。開發伺服器不註冊 Service Worker，避免舊快取干擾熱更新；開發與正式預覽請使用不同連接埠。

Astro 7 的正式預覽會在背景執行。停止本專案的預覽可使用 node scripts/astro.mjs preview stop。

## Docker Compose 啟動

需求：已啟動的 Docker 引擎與 Docker Compose v2.20 以上。可使用 Docker Desktop 或 OrbStack；主機不需要另行安裝 Node、pnpm 或 .NET。

~~~sh
docker compose up --build --detach --wait
~~~

開啟 http://127.0.0.1:8080/。Compose 建立 devwiki 專案，透過 Node 22.17.0／pnpm 10.16.0 建置完整網站，再由 Nginx 提供 dist/，包含 Pagefind、Service Worker 與圖示。容器通過首頁 HTTP 健康檢查後，啟動指令才會完成。

預設只綁定本機 127.0.0.1。變更主機連接埠可使用：

~~~sh
WIKI_PORT=8081 docker compose up --build --detach --wait
~~~

修改文章或程式後，重新執行啟動指令即可建置並替換容器。讀者的本機收藏存放於瀏覽器；網址的協定、主機或連接埠改變時，會使用另一份瀏覽器儲存空間。需要 PWA 安裝與離線功能時，使用本機 localhost／127.0.0.1，或透過具 HTTPS 的反向代理提供正式網域。

~~~sh
# 查看狀態與記錄
docker compose ps
docker compose logs --follow wiki

# 停止並移除本專案的容器與網路
docker compose down
~~~

容器以非 root 使用者執行，網站檔案唯讀。HTML、搜尋索引與 sw.js 使用 no-cache，Astro 雜湊資源使用長期快取；不存在的網址保留 HTTP 404 並提供本站錯誤頁。

已有 Node／pnpm 時，可執行 pnpm test:container 驗證正在運行的容器。自訂網址時使用 WIKI_URL=http://127.0.0.1:8081 pnpm test:container。GitHub Actions 也會建置並啟動容器，驗證文章、搜尋與 PWA 資源、快取標頭、轉址及 404。

設定檔為 [compose.yaml](compose.yaml)、[Dockerfile](Dockerfile) 與 [Nginx 設定](docker/nginx.conf)。建置採用 [Docker 多階段建置](https://docs.docker.com/build/building/multi-stage/)與[官方 Nginx 映像](https://hub.docker.com/_/nginx)；Node 與 Nginx 的基底映像固定版本，升級時一併重新建置及驗證。

## 已提供功能

- C# 25 篇、ASP.NET Core 9 篇、架構設計 2 篇、資料存取 6 篇、.NET 執行環境 4 篇、測試與觀測 2 篇。
- 保留 15 篇的 C# 入門路徑，另提供 22 篇的 .NET 後端工作實務路徑。
- 工作筆記概念對照頁，保留使用者提供摘要的相關日期、概念與文章對應；未直接匯入原始 46 篇筆記。
- Markdown 內容、固定文章網址、版本資料、先備知識、相關文章與官方來源。
- 頁內目錄、C# 語法標色與程式碼複製。
- 繁體中文及英文技術名詞的 Pagefind 全文搜尋、搜尋快捷鍵與無結果提示。
- 深淺色模式、鍵盤導覽與手機排版。
- 本機收藏，儲存在同一瀏覽器的 localStorage；尚未提供跨裝置同步。
- PWA 圖示、Manifest、安裝說明、已快取文章的離線閱讀與版本更新提示。

## 編寫文章

文章位於 src/content/docs/ 下各主題目錄。複製一篇既有文章，依 src/content.config.ts 的 schema 填入資料。articleId 在發布後保持穩定；檔名決定網址，不依分類變動。設定 draft: true 的內容不進入正式輸出與導覽。

文章包含摘要、核心概念、常見誤解、適用版本、最近審閱日期與官方來源。可執行 C# 範例提供完整程式與預期輸出；需要框架、資料庫或外部服務的片段明確標記整合前提與未執行範圍。verifiedWith 不可把文件核對寫成實際編譯或連線驗證。

prerequisites、relatedArticles 與 src/lib/learning-paths.ts 使用穩定 articleId。筆記對照位於 src/data/work-notes.json，文章的 noteDates 記錄相關日期。建置檢查主題目錄、分類、重複 ID、文章引用、學習路徑與日期對照。

新增主題時，擴充 src/lib/taxonomy.ts，加入實際內容、Starlight sidebar 與基本頁預快取清單；主題入口由共用路由產生。PWA 的文章路由由實際建置頁面收集，不再限於 C#。

## 驗證指令

| 指令 | 用途 |
| --- | --- |
| pnpm typecheck | Astro 與 TypeScript 嚴格型別檢查 |
| pnpm lint | JavaScript、TypeScript 與建置腳本的靜態檢查 |
| pnpm test | 收藏資料的損壞、持久化與儲存失敗行為 |
| pnpm test:container | 對已啟動的容器驗證文章路由、搜尋／PWA 資源、快取標頭與 404 |
| pnpm build | 靜態頁面、Pagefind、Workbox，以及連結與產物完整性檢查 |
| pnpm check | 依序執行型別、lint、單元測試與正式建置 |
| pnpm test:examples | 比對文章與範例程式，編譯並執行 25 個 C# 範例、核對輸出 |
| pnpm icons | 從本站 SVG 識別產生 PWA 與 Apple 圖示 |

Astro 型別檢查也檢查 .astro 元件；ESLint 負責獨立腳本與模組。CI 保留靜態建置產物，沒有自動正式部署。

## PWA 行為

Workbox 的獨立建置步驟會在 Pagefind 建好後執行。基本頁面、本站樣式、腳本與圖示在 Service Worker 安裝時預快取；每篇文章使用網路優先策略，成功讀取後快取。

文章顯示「可離線閱讀」前，網站會等待 Service Worker 控制頁面，確認文章 HTML 已在目前版本快取中。離線說明頁只列出實際快取文章。尚未快取的路由在無法連線時顯示離線說明，並保留原網址；恢復連線後重新整理即可重試。

文章快取上限為 40 篇、30 天。瀏覽器可自行清除快取；網站不能保證永久保存。全文搜尋需要網路；裝置離線時，搜尋會降為已快取文章的標題與摘要比對。外部參考來源仍需要連線。

更新會先準備新版基本資源，再顯示提示。讀者按下「更新並重新載入」才啟用等待中的版本，保留所在網址與本機收藏。切換時清理舊文章快取，因此新版文章需要重新閱讀並快取。

## 發布與回復

原始碼存放於公開 GitHub 儲存庫 [RayLiu1999/Wiki](https://github.com/RayLiu1999/Wiki)，本機 origin 已連至該儲存庫，預設分支為 main。

網站尚未設定正式網域或託管平台。可將完整 dist/ 發布到任何支援 HTTPS 與目錄 index.html 的靜態託管平台。必須整包發布，包含 pagefind/、sw.js、_astro/ 和 icons/。

正式網域確認後，在 astro.config.mjs 設定 site 以產生 sitemap；目前建置會略過 sitemap 並顯示提示。

不要把所有找不到的網址重新導向首頁。保留 404.html 的正常 404 行為；Service Worker 負責網路失敗時的離線提示。

建議讓 sw.js 與 HTML 使用需要重新驗證的快取設定；具內容雜湊的 _astro/ 資源可使用長期快取。每次部署保存上一版完整產物。回復時重發上一版整包，讓 Service Worker 偵測並提示切換。

正式公開發布前仍需確認網域、託管平台、內容授權，以及 Android Chrome / iOS Safari 的實際安裝體驗。

完整規劃見 [專案規劃書](docs/PROJECT_PLAN.md)，歷史驗收見 [首版實作與驗收紀錄](docs/IMPLEMENTATION.md)，本次整理見 [工作筆記整合紀錄](docs/WORK_NOTES_INTEGRATION.md)。
