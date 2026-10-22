# C#／.NET 深入學習地圖

| 項目 | 內容 |
| --- | --- |
| 版本 | 0.3 |
| 日期 | 2026-10-09（Asia/Taipei） |
| 狀態 | 十領域已加入網站；原定 P0／P1 保留，實際驗證另列 |
| 來源 | 使用者提供的十個領域與 P0／P1 優先級 |
| 現況 | 12 個主題、112 篇文章；新增資料庫容量專題的八個深入領域 |
| 整體架構 | [DevWiki 全面知識架構](E_COMMERCE_KNOWLEDGE_ARCHITECTURE.md) |
| 部署與維運 | [Docker、Kubernetes 與 GKE 知識地圖](CLOUD_NATIVE_LEARNING_MAP.md) |

## 1. 在 Wiki 中的角色

這份地圖是語言、框架、Runtime 與後端工程的完整學習入口。電商專題依功能引用它；目前十二個技術主題繼續作為文章的主要歸檔方式。

```text
C#／.NET 知識地圖：按領域與深度學習
                   ↓ 引用同一份文章
技術知識文章：概念、最小範例、取捨與延伸
                   ↑ 引用同一份文章
電商專題：按商品、購物車、訂單、付款與通知學習
                   ↓ 需要跟做時
實作指南：環境、命令、預期結果與排錯
```

本地圖維持原定十個領域與 P0／P1，電商專題另依功能與部署階段組織。每篇知識文章有主要概念責任，可被多個領域、電商章節與雲端部署章節引用。

Kubernetes／GKE 的容器、編排、平台權限、交付與維運由雲端地圖負責，本地圖持續深入應用程式內的行為。第 10 節整理兩份地圖的責任接點。

每個領域下安排數個學習單元，單元連到基礎文章、深入篇與相關實作。例如：

```text
D01 C# 型別系統
├─ 值與參考語意：class／struct、複製、相等性
├─ record 與有效狀態
├─ interface 與型別契約
├─ 泛型：使用 → 自訂與約束 → 協變／逆變
├─ nullable：值型別 → 參考型別與編譯器分析
└─ 參數傳遞：預設語意 → ref/out/in → 別名與唯讀
```

## 2. 使用者的必學清單與優先級

保留原始清單的優先級，六個 P0 領域、四個 P1 領域。P0／P1 是內容補寫與學習投入的優先順序；先備知識、文章難度及電商功能需要的深度另外記錄。

| 識別 | 領域 | 優先級 | 必學知識 |
| --- | --- | --- | --- |
| D01 | C# 型別系統 | P0 | class、struct、record、interface、generic、nullable、ref/out/in |
| D02 | OOP 與語言特性 | P0 | virtual、abstract、sealed、override、delegate、event、extension method |
| D03 | 物件建立與設計模式 | P1 | Factory、Builder、Strategy、Decorator、DI、Options Pattern |
| D04 | 非同步與並行 | P0 | async/await、Task、ValueTask、CancellationToken、lock、SemaphoreSlim |
| D05 | 生命週期與資源管理 | P0 | Singleton、Scoped、Transient、IDisposable、IAsyncDisposable、GC |
| D06 | ASP.NET Core | P0 | Middleware、Routing、Model Binding、Filter、Authentication、Authorization |
| D07 | 資料存取 | P0 | EF Core、DbContext、LINQ、Transaction、Tracking、Concurrency |
| D08 | Infrastructure | P1 | HttpClientFactory、Redis、Message Queue、BackgroundService、Connection Pool |
| D09 | Runtime 與效能 | P1 | CLR、JIT、ThreadPool、GC、Memory、Reflection、Profiling |
| D10 | 架構與工程實務 | P1 | DDD、Clean Architecture、CQRS、AOP、Testing、Observability |

清單的範圍涵蓋 C#／.NET 後端生態系，入口名稱採「C#／.NET 後端知識地圖」。HttpClientFactory 的主要 .NET API 以 `IHttpClientFactory` 說明；Message Queue 先以既有 RabbitMQ 作為具體實例。

## 3. 現有內容涵蓋與缺口

「已有基礎」表示文章有概念說明或最小範例。「局部涉及」表示只有片段或交叉提及。「待新增」表示需要建立主要文章。這些狀態用於內容盤點，深入目標仍需另外驗收。

| 領域 | 現有涵蓋 | 深入學習的主要缺口 |
| --- | --- | --- |
| D01 型別系統 | class、值／參考語意、record、interface、nullable、ref/out/in 已有基礎；generic 以集合使用為主 | struct 的選擇與預設狀態、相等性與 boxing；自訂泛型、約束、協變／逆變；參數別名與唯讀語意 |
| D02 OOP 與語言特性 | class-design、interfaces、delegates、extensions-attributes 已涵蓋所列關鍵字與基本案例 | 動態分派與成員隱藏、組合與繼承的選擇、委派與事件生命週期、非同步回呼及擴充方法解析 |
| D03 物件建立與設計模式 | DI／Options 已有基礎；Factory、Builder、Strategy、Decorator 缺少專門的設計比較 | 四種模式的問題、完整範例、使用條件與成本；DI 組裝點與 Options 的獨立深入篇 |
| D04 非同步與並行 | async/await、Task、ValueTask、取消、lock、SemaphoreSlim、WhenAll、Channel 已有基礎 | await／狀態機、例外與取消傳播、CPU／I/O 工作、同步內容、重入與競爭、可觀察的併發案例 |
| D05 生命週期與資源管理 | IDisposable 與 DI 生命週期已有基礎；IAsyncDisposable 局部涉及；GC 主要作為對照與指標出現 | 非同步釋放的完整範例、資源所有權、scope 與背景工作、Dispose／GC／finalization 的責任 |
| D06 ASP.NET Core | Middleware、Model Binding、Authentication／Authorization 已有基礎；Routing 與 Filter 局部涉及 | Routing 的匹配與 endpoint；MVC Filter 與 Endpoint Filter 的位置與差異；完整請求流程及資源授權 |
| D07 資料存取 | EF Core、DbContext、LINQ、交易已有基礎；Tracking 主要是 AsNoTracking 與回滾說明 | 狀態追蹤、identity resolution、關聯查詢成本；樂觀並行、衝突處理與 provider 差異 |
| D08 Infrastructure | IHttpClientFactory、Redis、RabbitMQ、Hosting 與連線池有相關文章；BackgroundService 有實作程序 | 後台工作獨立深入篇、scope／停止／錯誤處理、連線所有權與池；文章操作與完整實作入口 |
| D09 Runtime 與效能 | JIT／AOT、Reflection／Attribute 局部涉及；ThreadPool／GC 有診斷提及 | CLR／IL／執行流程、GC 機制、配置與保留、ThreadPool 飢餓、Reflection 成本、Profiling 工作流程 |
| D10 架構與工程實務 | DDD、分層、CQRS、測試與觀測已有基礎；Clean Architecture 與 AOP 的部分責任有交叉說明 | Clean Architecture 的依賴與組裝、AOP／橫切機制比較、架構取捨、行為與整合驗證的完整案例 |

Runtime 與效能是目前最明顯的新內容區塊。現有 .NET 主題主要是 SDK、Hosting、時間與識別碼，需要擴充 Runtime 原理與效能診斷的內容分類。

## 4. 各領域的深入學習目標

下列是在原清單上補充的深入範圍。相關電商案例與新篇名均為規劃，實作與驗證狀態需在編寫後記錄。

### D01 C# 型別系統（P0）

- 學習單元：class／struct／record 的選擇、身分與值相等性、複製與參考欄位、readonly 與有效狀態；interface 作為型別契約；generic 的建立、約束及型別變異；nullable 的值型別與參考型別語意；ref/out/in 的參數行為。
- 深入目標：可以根據資料語意選型別，說明複製、相等、預設值與修改入口；區分泛型參數的 in/out 和方法參數的 in/out。
- 電商案例：商品 Entity、金額 Value Object、訂單 DTO、查詢結果與正數數量。
- 主要既有文章：`csharp-value-reference-types`、`csharp-classes`、`csharp-records-invariants`、`csharp-interfaces`、`csharp-collections`、`csharp-nullable`、`csharp-parameter-passing`。

泛型深入篇從使用集合延伸到自訂型別、約束與協變／逆變，分別提供最小可編譯範例。[C# 泛型官方說明](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/types/generics)。

### D02 OOP 與語言特性（P0）

- 學習單元：virtual／abstract／sealed／override、成員隱藏、介面與繼承、組合；delegate／Lambda／閉包；event 的訂閱、發布與解除；extension method 的解析與使用邊界。
- 深入目標：能預測不同參考型別下呼叫哪個行為，判斷需要的替換點，並管理事件與非同步回呼的生命週期。
- 電商案例：替換通知方式、價格計算行為與商品清單轉換；程序內 event 和跨程序的訂單訊息分別介紹。
- 主要既有文章：`csharp-class-design`、`csharp-interfaces`、`csharp-delegates`、`csharp-extensions-attributes`。

### D03 物件建立與設計模式（P1）

- 學習單元：直接建構與 Factory、Factory Method 的比較；Builder 組裝複雜輸入；Strategy 替換演算法；Decorator 增加行為；DI 的 composition root 與依賴方向；Options Pattern 的繫結、驗證、快照與更新。
- 深入目標：能指出需求中的變動點，選擇建立或組合方式，說明額外抽象的成本；可畫出服務建立與設定供應的關係。
- 電商案例：訂單建立、結帳請求組裝、運費規則、商品查詢的快取裝飾與 Redis 設定。運費等擴充情境在章節中標示範圍。
- 主要既有文章：`aspnet-core-dependency-injection`、`architecture-application-patterns`；設計模式需要補充主要文章。

DI 的基本解析與服務生命週期先放進 D05 及 Web API 起步路徑；本領域負責更深入的物件組裝、模式選擇與設定設計。

### D04 非同步與並行（P0）

- 學習單元：async/await 的狀態機與延續、Task／ValueTask 的契約與成本、例外與取消、WhenAll、CPU／I/O 工作、同步內容；lock／SemaphoreSlim、共享狀態、限制同時執行數與 Channel。
- 深入目標：能畫出呼叫、等待與完成的順序，說明取消與例外如何傳播，並用明確的資料所有權及控制方式處理競爭。
- 電商案例：並行讀取商品資料、取消 API 請求、限制外部服務呼叫與通知背景處理。
- 主要既有文章：`csharp-async-await`、`csharp-async-coordination`、`csharp-cancellation`、`csharp-configure-await`、`csharp-thread-safety`、`csharp-channels`。

ThreadPool 的建立、排程與診斷原理由 D09 展開；本領域連到理解非同步所需的基礎。[.NET Managed Thread Pool](https://learn.microsoft.com/en-us/dotnet/standard/threading/the-managed-thread-pool)。

### D05 生命週期與資源管理（P0）

- 學習單元：Singleton／Scoped／Transient 的建立、持有與釋放；服務捕捉與 scope；IDisposable／using；IAsyncDisposable／await using；資源所有權、SafeHandle 與 finalization 基本責任；GC 的回收範圍。
- 深入目標：可說明資源由誰擁有、何時釋放、scope 何時結束；能觀察成功、例外與取消下的清理結果。
- 電商案例：每個 request 的 DbContext、Worker 每次訊息的 scope、HTTP response、Redis 及 RabbitMQ 長時間連線。
- 主要既有文章：`csharp-disposable`、`aspnet-core-dependency-injection`、`dotnet-hosting`、`aspnet-core-http-client-factory`。

GC 管理受管理記憶體，外部資源有明確的清理責任；本領域先學這個邊界，D09 再深入 GC 與記憶體診斷。[GC 基礎](https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/fundamentals)、[Dispose 實作](https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/implementing-dispose)。

### D06 ASP.NET Core（P0）

- 學習單元：完整 HTTP 請求流程、Middleware 與短路、Routing 與 endpoint、Model Binding 與驗證、Controller Filter／Endpoint Filter、Authentication／Authorization 與資源權限。
- 深入目標：能按請求順序說明每一個階段的責任，選擇適合的位置處理錯誤、驗證與共同行為，解釋拒絕請求的結果。
- 電商案例：商品查詢、建立訂單的輸入邊界、店主修改商品、買家查詢自己的訂單。
- 主要既有文章：`aspnet-core-middleware`、`aspnet-core-model-binding`、`aspnet-core-authentication`、`aspnet-core-api-styles-aot`。

MVC Filter 需放在 action invocation pipeline 的背景中說明，再與 Middleware 及 Minimal API 的 Endpoint Filter 比較。[ASP.NET Core Filters](https://learn.microsoft.com/en-us/aspnet/core/mvc/controllers/filters?view=aspnetcore-10.0)。

### D07 資料存取（P0）

- 學習單元：EF Core 模型、DbContext 與 scope、LINQ 翻譯、延遲執行、投影與分頁、Tracking／狀態變更／identity resolution、Transaction、Concurrency、關聯查詢與 provider 差異。
- 深入目標：能閱讀產生的 SQL，說明查詢與提交的時間，處理多人修改與衝突，分辨程序內同步、資料庫交易及並行控制。
- 電商案例：商品清單、訂單明細、價格更新、扣庫存、訂單與 Outbox 一起提交。
- 主要既有文章：`csharp-linq`、`csharp-query-abstractions`、`data-access-ef-core`、`data-access-transactions`、`data-access-pools-locks`、`data-access-migrations`。

Concurrency 新篇需提供可重現的衝突，明確說明 concurrency token、衝突結果與處理選擇，並記錄實際資料庫供應商。[EF Core 並行控制](https://learn.microsoft.com/en-us/ef/core/saving/concurrency)。

2026-10-09 加入 [C# 與 MySQL／PostgreSQL 資料庫架構](DATABASE_SCALE_KNOWLEDGE_ARCHITECTURE.md)：D07 深入 driver、CRUD、隔離與大表查詢；D08 管理全程序連線池與故障；D09 量測工作量及等待。SQL 與 schema 的實際驗證依文章標示，未宣稱已完成上億列測試。

### D08 Infrastructure（P1）

- 學習單元：IHttpClientFactory／Handler／連線管理、Redis 快取、RabbitMQ 訊息、BackgroundService 與 Host 啟停、scope、停止 token、Connection Pool 與池耗盡。
- 深入目標：能辨識呼叫或處理所在的程序，管理外部連線與背景工作，解釋超時、故障、重送與停止時的可觀察結果。
- 電商案例：付款模擬服務、商品快取、訂單通知、Outbox 發布與訊息消費。
- 主要既有文章：`aspnet-core-http-client-factory`、`aspnet-core-http-resilience`、`dotnet-hosting`、`data-access-pools-locks`、六篇 Redis 與六篇 RabbitMQ 文章。

共通問題集中介紹；Redis、RabbitMQ、HTTP 與資料庫的連線、可靠性及池行為，分別引用各技術文章。

### D09 Runtime 與效能（P1）

- 學習單元：CLR／IL／JIT 的執行流程、JIT／AOT 比較、ThreadPool 與飢餓、GC roots／世代／LOH、配置與保留、boxing、Memory 與 buffer、Reflection／Attribute、Profiling 與量測流程。
- 深入目標：能依證據分辨 CPU、等待、配置、記憶體保留與池耗盡，使用基準與 profiler 比較調整前後，記錄測試條件及適用範圍。
- 電商案例：商品查詢的配置量、訂單 API 延遲、Worker 積壓與事件訂閱保留；原理也使用更小的獨立範例說明。
- 主要既有文章：`aspnet-core-api-styles-aot`、`csharp-extensions-attributes`、`csharp-configure-await`、`engineering-metrics-tracing`；Runtime 原理與 Profiling 需要新增主要文章。

基礎涵蓋後，依需要加入 Span／Memory／ArrayPool 等更深入的記憶體操作；範例與量測數據需標示 .NET 版本、工作負載及診斷工具版本。

### D10 架構與工程實務（P1）

- 學習單元：DDD 的通用語言、Entity／Value Object／Aggregate、Clean Architecture 的依賴方向與組裝、CQRS、AOP 與橫切處理的機制及邊界、Testing 與 Observability。
- 深入目標：能從商業規則找一致性邊界，說明模式與分層的取捨；選擇對應的行為、整合與故障驗證，並追查一次用例的經過。
- 電商案例：訂單狀態與金額、商品讀取與訂單寫入、Outbox／Inbox、通知重送、追蹤同一筆訂單的處理。
- 主要既有文章：`architecture-domain-modeling`、`architecture-application-patterns`、`architecture-communication-boundaries`、`architecture-outbox-inbox`、`engineering-business-tests`、`engineering-cache-messaging-tests`、`engineering-metrics-tracing`。

Clean Architecture 與 AOP 補專門的概念及比較篇。每篇使用足夠小的問題比較方案，並在各章檢查點引入測試與觀測。

## 5. 跨領域概念的主要責任

| 概念 | 主要學習責任 | 其他領域如何引用 |
| --- | --- | --- |
| interface | D01：型別契約；D02：多型、繼承與組合選擇 | D03／D10 引用契約與依賴方向 |
| DI | D05：基本解析與服務生命週期；D03：composition root 與建立設計 | D06／D08 引用 request 與 Worker 的 scope |
| Options Pattern | D03：設定供應、驗證及更新；D05：各 Options 型別的生命週期 | D06／D08 使用同一份主要文章 |
| GC | D05：回收與資源清理責任；D09：內部機制、配置與診斷 | D10 的觀測文章連到對應指標的原理 |
| ThreadPool | D09：排程、資源與診斷 | D04 引用必要原理；D08 引用 Worker 的影響 |
| LINQ | C# 文章：集合與列舉語意；D07：資料庫翻譯、追蹤與成本 | 商品、訂單查詢章節引用兩種執行背景 |
| AOP／橫切行為 | D10：概念、機制比較與取捨 | D06 的 Filter／Middleware、D03 的 Decorator 提供具體實作 |
| Connection Pool | 各技術的主要文章：HTTP、資料庫及相應連線行為 | D05 解釋所有權；D08 整合管理；D09 診斷瓶頸 |

不同責任可拆成不同文章；同一段概念正文維持單一主要來源。C# event 的程序內通知語意與 RabbitMQ 的跨程序事件，在案例圖中清楚標示。

## 6. 學習順序與深度

### 保留入門暖身

既有的環境、變數、流程控制、方法、集合、例外等入門內容，繼續由 C# 入門路徑提供。第一次接觸 C# 的讀者先從該路徑開始，再進入本地圖。

### P0 核心深入路徑

| 階段 | 主要領域 | 學習關係 |
| --- | --- | --- |
| 1 型別與物件行為 | D01 → D02 | 先理解資料、契約與呼叫，再學替換與組合 |
| 2 資源與非同步 | D05 基本清理 → D04 → D05 非同步清理 | 先 using／所有權，再 await／取消，最後 await using |
| 3 Web 與服務組裝 | D05 服務生命週期 → D06 | 先 scope 與 DI 基礎，再讀 HTTP 請求管線與權限 |
| 4 資料與一致性 | D07 | 用 DbContext、LINQ、Tracking、交易與並行處理完成用例 |

### P1 系統設計與效能路徑

| 階段 | 主要領域 | 學習關係 |
| --- | --- | --- |
| 1 邊界與設計選擇 | D10 架構基礎 → D03 | 先理解商業規則與依賴方向，再比較物件建立與行為組合 |
| 2 外部與背景工作 | D08 → D10 可靠通訊及整合驗證 | 串起 HTTP、Redis、RabbitMQ、Host 與一致性問題 |
| 3 原理與效能診斷 | D09 → D10 完整觀測 | 從 Runtime 原理、量測與 profiler 解釋診斷結果 |

P1 中若有目前功能需要的基本概念，例如 DI／Options、測試與簡單觀測，就在電商章節提供必要先讀連結；完整深入篇按原定 P1 規劃。學習優先級、先備順序與章節需求各自記錄。

每個領域使用三種深度：

| 深度 | 內容標準 |
| --- | --- |
| 基礎 | 能辨識用途與語意，讀懂最小完整範例 |
| 深入 | 能解釋機制、邊界、失敗情況與取捨，重現關鍵行為 |
| 情境應用 | 能在電商用例中選擇方案，檢查結果並診斷問題 |

這是內容規劃維度。現有 difficulty 的 beginner／intermediate 繼續表示閱讀難度，實作內容模型時再決定優先級與深度的保存方式。

## 7. 與電商章節的關聯

| 電商章節 | 主要引用領域 | 關鍵串接 |
| --- | --- | --- |
| 商品模型 | D01、D02 | 型別、相等性、有效狀態與行為契約 |
| 商品 API | D05、D06、D07 | 服務建立 → 請求邊界 → 查詢與提交 |
| 買家與店主 | D06、D10 | 建立身分 → 判斷權限 → 檢查資料歸屬 |
| 購物車與金額 | D01、D02、D10 | 集合 → 金額與數量規則 → 明細快照 |
| 下單與庫存 | D04、D07、D10 | 多人競爭 → 資料庫一致性 → 商業結果驗證 |
| 模擬付款 | D03、D06、D07、D08、D10 | 設定與外部呼叫 → 狀態與冪等 → 失敗處理 |
| 商品快取 | D01、D04、D05、D07、D08、D09、D10 | 資料與連線 → 快取流程 → 併發 → 量測與診斷 |
| 背景通知 | D04、D05、D08、D10 | 非同步 → scope → 訊息處理 → 故障恢復 |
| 可靠事件 | D07、D08、D10 | 本地交易 → Outbox／Inbox → 重送與冪等 |
| 測試與全流程觀測 | D05、D08、D09、D10 | 啟停與資源 → Runtime 診斷 → 行為及全流程追查 |
| 容器、K8s 與 GKE 部署 | D04、D05、D06、D08、D09 | 程序與設定 → 啟停與連線 → 容器資源與平台整合 |
| 多 Pod、交付與維運 | D07、D08、D09、D10 | 資料與訊息一致性 → 容量與更新 → 診斷及恢復 |

## 8. 補寫順序

### 第一批：補齊 P0 深入缺口

- 泛型型別與方法、約束及協變／逆變。
- struct、record、相等性與有效狀態的深入比較。
- await／Task 的執行、例外與取消流程。
- IAsyncDisposable、await using 與 scope／資源所有權。
- Routing 與 endpoint；Filter 與 Middleware 的責任比較。
- EF Core Change Tracking 與 Concurrency。

已有基礎文章先整理為入口，再評估延伸為深入篇或補寫獨立篇；新篇保持單一問題與明確學習目標。

### 第二批：完成 P1 設計與運作

- Factory／Builder 與 Strategy／Decorator 的比較和完整小範例。
- DI 組裝與 Options 的深入篇。
- BackgroundService 的啟停、scope、錯誤與取消。
- Clean Architecture、AOP 與既有 DDD／CQRS 的關聯。
- Redis／RabbitMQ 的網站閱讀背景與實作入口同步改善。

### 第三批：補上 Runtime 與效能的主要文章

- CLR／IL／JIT 與執行流程。
- GC／記憶體配置與保留。
- ThreadPool 與飢餓診斷。
- Reflection／Attribute 的機制與成本。
- Profiling、基準比較與瓶頸定位。

第二、三批均維持 P1，可依當前學習問題交錯編寫。Testing 與 Observability 的基本檢查點隨各批內容加入。

## 9. 發布與涵蓋驗收

- 十個領域的使用者必學項目都能連到主要文章，或明確標示待補。
- 入門提及、深入解釋、情境應用、示意片段與已執行範例各自說明。
- 一篇文章指定主要問題與先備知識，跨領域正文以連結引用。
- 每個深入單元有「讀者能解釋或重現什麼」的完成條件。
- 可編譯／執行的程式與預期結果一起維護；原理推論與實際量測結果分開記錄。
- 從知識地圖、技術分類或電商章節進入同一篇文章，都能理解局部背景。
- 所有新入口隨完整內容發布；本文件的提案與涵蓋盤點持續依實際文章更新。

## 10. 與 Kubernetes／GKE 的責任接點

| .NET 領域 | 應用程式需要理解的事情 | 雲端地圖接續的事情 |
| --- | --- | --- |
| D04 非同步與並行 | CancellationToken、正在執行的工作、程序內同步與跨程序一致性 | 平台終止訊號、縮容、多份程序與訊息重送 |
| D05 生命週期與資源 | request／訊息 scope、服務所有權、Dispose 與 Host 停止 | Pod／Container 生命週期、探針、更新與停止時間 |
| D06 ASP.NET Core | HTTP 請求、錯誤結果、Authentication／Authorization 與資源權限 | Service／Gateway／TLS；K8s RBAC、Google IAM 與工作負載身分 |
| D07 資料存取 | DbContext、交易、Tracking、Concurrency、連線池與 Migration | 全部副本的連線容量、Cloud SQL 整合、資料更新與新舊版本相容 |
| D08 Infrastructure | Redis／RabbitMQ／HTTP 連線、BackgroundService、Outbox／Inbox 與重試 | 外部端點、Secret、Worker 擴縮、Outbox 競爭與依賴容量 |
| D09 Runtime 與效能 | GC、ThreadPool、記憶體配置、CPU、等待與 Profiling | CPU／Memory requests／limits、Pod 指標、OOM 與擴縮結果 |
| D10 架構與工程實務 | 模組邊界、可靠通訊、行為驗證、可觀測性與部署相容性 | CI/CD、IaC、Trace 串接、SLO、告警、版本升級與恢復 |

Singleton 的生命週期屬於程序內的服務實例，資料庫交易與業務規則另外處理多份程序的競爭；這些概念在主要知識篇講清楚，再由多 Pod 情境引用。既有 Outbox／Inbox 與整合測試的證據也要標示實際環境，新增多副本與 GKE 情境後另行驗證。

容器與平台只是增加執行條件，型別、模式、非同步、資源及 Runtime 的深入目標仍完整保留。讀者可以先學 .NET，再沿著同一個商品／訂單／通知案例學部署與維運。
