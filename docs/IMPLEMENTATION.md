# DevWiki 首版實作與驗收紀錄

日期：2026-10-07。版本：0.1.0。本機首版已完成，尚未公開部署。

## 設計與範圍

介面依已確認的「書頁閱讀」設計製作：清爽淺色、紫色點綴、充足留白，文章使用閱讀欄與頁內目錄，另提供深色切換與手機排版。品牌暫名 DevWiki。

首版提供首頁、C# 知識地圖、五階段學習路徑、15 篇完整文章、本機收藏、搜尋、離線閱讀說明與 404 頁面。內容以 Markdown 與 Git 維護，無須帳號、API 或資料庫。

15 篇主題涵蓋環境入門、變數、流程控制、方法、class、值與參考型別、介面與多型、nullable、泛型集合、委派與事件、LINQ、例外、IDisposable、async/await、CancellationToken。每篇記錄版本、範例驗證環境、審閱日期與 Microsoft Learn 來源。

## 固定版本與檔案配置

| 項目 | 本機驗證版本 |
| --- | --- |
| Node.js | 22.17.0 |
| pnpm | 10.16.0 |
| Astro | 7.3.6 |
| Starlight | 0.42.5 |
| Pagefind | 1.5.2 |
| Markdown / remark | 7.3.0 |
| TypeScript | 5.9.3 |
| ESLint / typescript-eslint | 10.11.0 / 8.71.0 |
| Workbox | 7.4.1 |
| .NET SDK / C# | 10.0.105 / 14 |

包含 Starlight 使用的 Pagefind 在內，套件版本由 pnpm-lock.yaml 鎖定。套件相容性已以實際安裝、型別檢查及正式建置核對。

| 路徑 | 職責 |
| --- | --- |
| src/content/docs/languages/csharp/ | Markdown 文章與資料 |
| src/content.config.ts | 文章 schema 與語系內容集合 |
| src/lib/catalog.ts | 分類、文章索引與引用檢查 |
| src/components/overrides/ | Starlight 閱讀版面 |
| src/pages/ | 首頁、主題、路徑、收藏、離線說明 |
| src/scripts/site.ts | 搜尋、收藏、分類、目錄、主題切換 |
| src/pwa/ | Service Worker 與安裝、更新、離線狀態 |
| public/ | Manifest、SVG 識別與 PWA 圖示 |
| examples/csharp/ | 可執行範例、共用專案與預期輸出 |
| scripts/ | Astro 指令、PWA 建置、產物與範例檢查 |
| .github/workflows/check.yml | 網站與 C# 範例 CI；尚未在遠端執行 |

## 搜尋、收藏與 PWA

正式版使用 Pagefind 全文搜尋。開發模式使用文章全文的 JSON 索引，避免依賴正式產物。搜尋結果以文字插入 DOM，提供無結果與載入失敗提示；支援 Cmd/Ctrl+K 與 Esc。

收藏以穩定 articleId 寫入 localStorage，只在寫入成功後更新狀態。損壞、重複、已移除的文章 ID，以及瀏覽器禁止儲存或空間不足的狀況都有對應處理。本機收藏尚未跨裝置同步。

基本頁面、樣式、腳本與圖示預快取；文章 HTML 使用網路優先，成功快取後才顯示「可離線閱讀」。上限 40 篇、30 天。未快取頁面在網路失敗時顯示離線說明，保留原網址。快取不能保證永久保存，瀏覽器可自行清除。

全文搜尋需要網路；navigator.onLine 判定離線時，改為比對已快取文章的標題、摘要與標籤。這項降級尚待真正斷網的裝置驗收。外部來源仍需連線。

建置內容雜湊作為快取版本。新版基本資源準備好後先提示，讀者點選更新才啟用。網址與收藏保留，舊版文章快取清理後須重新閱讀以建立新版快取。

最後一次完整建置產生 21 個 HTML 頁面，PWA 預快取 18 個基本資源，約 214.6 KB。這不包含按需快取的文章 HTML 或全文搜尋索引。

## 已完成驗證

| 驗證 | 結果與範圍 |
| --- | --- |
| pnpm check | 型別、lint、4 個收藏測試、正式建置通過；Astro 34 個檔案無錯誤、警告或提示 |
| 產物檢查 | 21 個 HTML 的主要標題、語言、重複 ID、內部連結與頁內錨點檢查通過；搜尋與 PWA 產物存在 |
| pnpm test:examples | 15 個範例與文章一致，均通過編譯、執行與預期輸出核對 |
| 搜尋到文章 | 「非同步」找到 async/await 並可開啟全文；「泛型」「C#」「async」「Task」「nullable」「LINQ」找到對應文章 |
| 無搜尋結果 | 不存在的概念顯示可理解的提示 |
| 本機收藏 | 收藏後進入收藏頁、重新整理仍保留；取消收藏可更新 |
| 主題分類 | 實務分類顯示 4 篇，網址保留分類，重新整理仍套用 |
| 學習路徑 | 五階段列出 15 篇，從第一篇入口可開啟實際文章 |
| 手機排版 | 360px 視窗下首頁、主題頁與代表性文章無頁面橫向溢出；文章目錄可見 |
| 閱讀互動 | 目錄連到正確章節；程式碼複製按鈕顯示成功回饋 |
| 主題模式 | 淺色、深色文字與程式碼已查看；切換後重新整理保留偏好 |
| 基本鍵盤操作 | Cmd+K 可開啟搜尋並聚焦輸入欄，Esc 可關閉；Enter 可由導覽連結開啟首頁 |
| 離線文章 | 停止本機預覽伺服器後，async/await 文章可重新開啟與重新整理，樣式正常 |
| 未快取文章 | 同樣條件下，CancellationToken 文章顯示離線說明，原文章網址保留 |
| 連線恢復 | 預覽伺服器重新啟動後，原網址重新整理可載入 CancellationToken 文章 |
| 版本更新 | 從舊版偵測到新建置，顯示提示；點選更新後重新載入，文章網址與收藏保留 |

瀏覽器驗證使用 Codex 內建瀏覽器，沒有改動使用者的系統網路設定。停止本機伺服器模擬的是來源無法連線，並非所有平台的飛航模式。複製功能只驗證到網站成功回饋，未以外部編輯器貼上核對剪貼簿。

建置目前會提示 sitemap 因未設定 site 而略過；正式網域決定後再設定 astro.config.mjs 的 site。正式站網址尚未假設或發布。

## 上線前尚待驗收

- Android Chrome 與 iOS Safari 的真實安裝、主畫面啟動及飛航模式閱讀。
- Chrome、Edge、Safari、Firefox 主要流程與完整鍵盤、焦點走查。
- 真正離線的搜尋降級、儲存空間不足、快取過期與裝置清除資料。
- 全新環境以 lockfile 重現建置；遠端 CI 實際執行。
- 固定行動裝置條件下的 LCP、CLS；尚未量測效能分數。
- 正式名稱、網域、託管平台、內容授權、發布與回復演練。

讀取與快取失敗時的提示已實作；這些未驗收項目不以本機測試推定通過。

## 本機操作與發布

~~~sh
pnpm install --frozen-lockfile
pnpm dev
~~~

完整 PWA 與 Pagefind 預覽：

~~~sh
pnpm check
pnpm preview --port 4321
~~~

開啟 http://127.0.0.1:4321/。Astro 7 的預覽伺服器會在背景執行；需要停止時：

~~~sh
node scripts/astro.mjs preview stop
~~~

發布時將完整 dist/ 部署到支援 HTTPS 與目錄 index.html 的靜態平台，包含 pagefind/、sw.js、_astro/ 與 icons/。保留真正 404，避免將全部路由改寫為首頁。每次保存上一版整包產物，回復時整包重發。完整操作原則見 [README](../README.md)。
