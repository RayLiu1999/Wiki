# 電商主題全面改寫與驗收

實作日期：2026-10-08 至 2026-10-09。

本次依電商、.NET 與雲端知識架構重寫網站。讀者可直接理解技術文章，沿電商流程串接知識，再由獨立實作指南準備工具並執行範例。原有 63 篇文章的 articleId、檔名、網址與工作筆記日期對照保留。

## 已完成的內容

| 內容 | 數量與用途 |
| --- | --- |
| 技術文章 | 101 篇、12 個主題；原有 63 篇逐篇補上背景與電商應用，新增 38 篇 |
| .NET 知識地圖 | 10 個領域，保留原定 6 個 P0、4 個 P1；顯示文章深度與學習成果 |
| 雲端知識地圖 | 9 個領域，串接容器、網路、Kubernetes、GCP／GKE、交付與維運 |
| 開始閱讀 | 2 篇，說明閱讀方式與元件責任 |
| 電商專題 | 1 篇總覽、17 個章節，從商品走到交付、擴縮、恢復與成本 |
| 實作指南 | 7 篇，包含總覽、環境準備、快取與訊息、故障演練、容器、kind 與 GKE |
| 學習路徑 | 6 條，保留原有 3 條並增加 .NET 深入、Kubernetes 基礎及 GKE 維運 |

所有 101 篇技術文章均可由知識地圖找到。電商章節、指南與文章用穩定 ID 互相串接，建置時核對引用。導覽、全文搜尋、頁內目錄與離線閱讀涵蓋 27 篇新導讀／章節／指南；搜尋總數為 128 篇。

技術正文中的 `pnpm lab:*` 與 `pnpm test:infrastructure` 操作已移到指南。指南交代儲存庫版本、工具、工作目錄、port、終端機位置、指令作用、預期結果與停止方式。Redis CLI、SQL 與 C# 語意範例仍保留在對應文章，並說明執行前提。

## 範例程式與實作邊界

既有 `examples/infrastructure/` 使用主機上的 API／Console Worker 與 Compose 中的 PostgreSQL、Redis、RabbitMQ。其範圍是商品快取、價格更新、訂單與 Outbox／Inbox，以及資料庫中的模擬通知。通知記錄不等於真實寄信。

新增 `examples/deployment/` 是獨立、固定商品資料的 .NET 10 API，提供 Dockerfile、兩副本 Kubernetes 宣告與選用的 GKE HTTP Gateway／HealthCheckPolicy。API 不連外部資料服務；兩個健康端點只檢查程序本身。它使用 ASP.NET Host 處理停止，不能拿它的測試結果代表既有 Console Worker 已具備 Kubernetes 停止契約。

購物車、登入權限、庫存與模擬付款目前是設計案例。多副本 Worker 的 claim／lease、SIGTERM 收尾、完整業務整合、公開 HTTPS 入口與自動雲端交付仍需後續實作。文章與章節明確標示這些邊界。

## 本次驗證

| 檢查 | 結果與範圍 |
| --- | --- |
| `pnpm check` | 型別、lint、片段核對、4 個收藏資料測試及正式建置通過 |
| `pnpm test:examples` | 29 個 C# Console 範例均編譯、執行並符合預期輸出；包含新增的泛型、struct、await 與非同步釋放 |
| `pnpm test:snippets` | 6 段基礎設施文章程式碼與來源一致 |
| 靜態網站完整性 | 156 個 HTML 頁面、內部連結與錨點通過；128 篇內容的搜尋目錄及 PWA 路由一致 |
| 相容性內容稽核 | 原有 63 篇 ID／網址保留；各篇具有電商應用段落；技術正文不含專案實驗啟動指令 |
| 商品 API 容器 | Linux arm64 映像建置成功；SDK 10.0.401、ASP.NET／.NET runtime 10.0.12；以 `app` 使用者執行 |
| 容器 HTTP 與停止 | 商品 1 回應 200、未知商品 404、兩個健康端點 200；SIGTERM 正常關閉，exit code 0 |
| 瀏覽器閱讀 | 首頁、.NET 地圖、GKE 搜尋、文章→案例→指南連結、程式碼區塊、目錄及離線標示已檢查；版本更新後可重新載入，手機寬度下未出現頁面水平溢出 |

Docker 基底以已核對的多架構 manifest digest 固定，與主機 `global.json` 的 SDK 10.0.105 分別管理。本次專用驗證容器與映像已清理，既有實驗資料保留。

本次沒有重跑 `pnpm test:infrastructure`；基礎設施程式未變動，先前的服務與故障恢復證據見整合紀錄。沒有建立 kind／GKE 叢集、GCP 資源或驗證 amd64 建置，也未執行雲端端到端部署。Kubernetes／GKE 的宣告與指南已核對官方概念，叢集驗證仍需使用實際環境完成。

目前沒有正式網域；sitemap 的 site 未設定提示保留。此次完成本機內容與程式，沒有 push 或公開部署。

## 對應規劃與後續維護

- [電商知識架構](E_COMMERCE_KNOWLEDGE_ARCHITECTURE.md)
- [C#／.NET 學習地圖](CSHARP_DOTNET_LEARNING_MAP.md)
- [雲端部署學習地圖](CLOUD_NATIVE_LEARNING_MAP.md)
- [既有 Redis／RabbitMQ 整合與驗證](REDIS_RABBITMQ_INTEGRATION.md)

新增文章沿用 `src/content.config.ts` 的 schema，避免移動已發布檔名。導讀、電商章節與指南位於 `src/content/handbook/`，各篇維護來源、環境與驗證範圍。後續補實作時，同步更新範例、指南與本紀錄的驗證結果；文件核對不能替代實際執行證據。


## 2026-10-09 資料庫容量延伸

新增 MySQL／PostgreSQL 與 C# 連線、高併發 CRUD、大表查詢、批次、分割、複寫和容量驗證共 11 篇技術文章。資料存取增至 20 篇，網站技術文章共 112 篇；第三份知識地圖有 8 個領域，另有第 7 條路徑、電商資料庫專題與獨立驗證指南。原有 .NET 十領域與優先級、雲端九領域及十七個主線章節保留。

本次 `pnpm check` 通過，建置有 171 個頁面、141 篇搜尋內容與完整 PWA。新增 C# 專案以 .NET SDK 10.0.105 編譯並完成離線設定解析，三段文章程式與來源一致；未連線測試資料庫、執行 CRUD、一億列壓測或雲端恢復。瀏覽器確認地圖→文章→指南、MySQL／PostgreSQL 搜尋、版本更新與手機閱讀。

詳細架構與驗證邊界見 [資料庫容量紀錄](DATABASE_SCALE_KNOWLEDGE_ARCHITECTURE.md)。本次沒有更改既有實驗資料庫 schema、基礎設施程式、Node 依賴或公開部署。
