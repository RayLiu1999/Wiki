# 工作筆記整合紀錄

整理日期：2026-10-07。

依使用者提供的每日筆記摘要（46 篇，2026-05-20 至 2026-10-06），把概念併入已有文章與新增主題。原始筆記與技術子頁未直接讀取；日期表示摘要提供的主題脈絡，不能據此宣稱已逐篇驗證原文。技術細節依文章所列的官方文件補充。

## 內容與閱讀結構

| 主題 | 文章數 | 主要整理 |
| --- | --- | --- |
| C# | 25 | 參數、型別、類別、record、查詢模型、非同步與共享狀態 |
| ASP.NET Core | 9 | Binding、DI、HTTP、驗證、Middleware、AOT、gRPC、Dapr |
| 架構設計 | 2 | DDD、分層、Repository、Unit of Work、CQRS、Mediator |
| 資料存取 | 6 | EF、Migration、Dapper、交易、批次、池與鎖、型別對應 |
| .NET 執行環境 | 4 | SDK / NuGet、Hosting、時間與 ID |
| 測試與觀測 | 2 | xUnit / NSubstitute、Runtime / HTTP 指標與跨服務追蹤 |
| 合計 | 48 | 新增 33 篇、補充 9 篇既有文章 |

保留 C# 入門的 15 篇、5 個階段，避免進階主題打散既有閱讀順序。新增 .NET 後端工作實務的 22 篇、5 個階段，依型別邊界、非同步、Web 服務、領域與資料、部署與診斷串接。

`/topics/` 提供全部主題；`/work-notes/` 對照 32 個摘要主題與 5 個校準項目，共 37 組概念。每組保留概念關鍵字、相關日期及文章連結。文章底部另外提供日期脈絡、先備與相關文章。

## 既有文章的補充

nullable 補上輸入邊界與參數傳遞；classes 接上建構與類別設計；collections / LINQ 接上 provider 與實體化；exceptions / disposable 接上 HTTP 與所有權；async / cancellation 接上協調、取消來源與 ConfigureAwait；value-reference-types 補上 struct 參考欄位與淺拷貝。

校準內容包括 ref 與一般指標的差異、with 的淺拷貝、Startup / Generic Host 的持續支援、async 不自動建立執行緒、WaitAsync 與 Wait，以及 None / ContinueOnCapturedContext 的不同。

另外區分資料庫供應商的 tinyint 值域、DI scope 與 Handler scope、DbContext pooling 與 connection pooling、資料庫回滾與記憶體狀態、Proxy 與受管理 pool，以及 API 型態與 AOT 的版本限制。

## 實作與驗證邊界

內容由 Markdown、taxonomy、學習路徑及工作筆記 JSON 維護。Schema 檢查分類屬於主題；catalog 檢查固定網址、重複 ID、文章引用、路徑與日期。建置檢查所有內部連結、錨點、搜尋目錄、主題麵包屑與文章離線路由。

PWA 不再使用只接受 C# 的網址規則，而是從實際輸出的文章頁建立清單，供六個主題使用。主題總覽、筆記對照與兩條路徑加入基本頁預快取；文章仍使用網路優先、最多 40 篇及 30 天的策略。48 篇文章不會因此自動全數保存。

25 個 C# Program.cs 範例以 .NET SDK 10.0.105 / net10.0 / C# 14 比對文章、編譯、執行及輸出。ASP.NET、EF、Dapper、gRPC、Dapr、xUnit、OpenTelemetry 等整合片段未連線或建置，已在版本紀錄與內文清楚標示。

本機完整檢查及瀏覽器驗收結果如下；遠端 CI、正式部署與手機安裝不在本次驗證範圍內。

| 驗證 | 結果 |
| --- | --- |
| 型別、lint、收藏測試、靜態建置 | 通過；63 個頁面、48 篇文章的搜尋目錄、麵包屑及離線路由一致 |
| C# 範例 | 25 個編譯、執行及輸出核對通過 |
| 搜尋 | ConfigureAwait、NoResult、migration、traceparent 找到對應文章 |
| 學習路徑 | 入門 15 篇、實務 22 篇，各 5 階段 |
| 筆記對照 | 8 個段落、37 組概念，來源說明可見 |
| 分類與關聯 | ASP.NET Core「服務與安全」正確顯示 4 篇；文章麵包屑及前後文章維持本主題，相關文章可跨主題 |
| 收藏及更新 | 更新後保留原有測試收藏，新主題與既有 C# 可共同收藏 |
| 新主題離線閱讀 | 停止本機預覽後，六個主題各一篇均能完整重讀；未快取的 Dapr 頁顯示離線提示、保留原網址並列出六篇已快取文章。預覽隨後重新啟動 |
| 手機版排版 | 360 × 844 viewport 下，主題總覽、筆記對照、ConfigureAwait 含表格文章皆無整頁水平溢出；目錄、導覽、標題與收藏按鈕可見。驗證後恢復原尺寸 |

測試建立的兩個收藏已移除，恢復驗證前的空收藏狀態。預覽持續執行於 http://127.0.0.1:4321/，主題總覽留在瀏覽器供使用者檢視。
