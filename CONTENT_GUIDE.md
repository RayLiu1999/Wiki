# DevWiki 內容撰寫規範 (CONTENT_GUIDE)

本文件定義 DevWiki 的讀者、文章結構、白話寫作標準、雲端排查格式與正確性原則。新寫或改寫的技術專題都要遵守，並由 `pnpm test:articles` 自動檢查結構。用語定義見 [GLOSSARY.md](GLOSSARY.md)，定位決策見 [ADR 0001](docs/adr/0001-knowledge-base-not-demo-repo.md)。

---

## 1. 定位與讀者

* **目標讀者**：具備 1～3 年開發經驗的 .NET 後端工程師。
* **定位**：DevWiki 是知識庫，不是 demo 庫。價值在於把技術原理講清楚，讀者讀完能把觀念帶回自己的專案；不提供可直接執行的範例專案，也不做執行驗證。
* **主線**：以電商後端串起 C#／.NET、資料、訊息、容器與雲端。雲端以 GKE（GCP）與 EKS（AWS）為準。
* **不做什麼**：
  * 不重寫官方入門語法；語言基礎直接連結 Microsoft Learn。
  * 正文不出現本倉庫專屬的指令（`pnpm`、`lab:*`）或內部類別。讀者不會 clone 本倉庫。

---

## 2. 白話寫作五條

1. **先講是什麼**：開頭用 3～5 句白話說明這個技術是什麼、解決什麼問題、在電商的哪裡會用到。事故情境放進「運作原理」當例子，不當開場。
2. **名詞第一次出現就解釋**：例如「狀態機」「爬山演算法」，第一次出現時附一句白話說明，不只放英文括號。
3. **先講機制再看程式**：先用一段話或一張圖講清楚怎麼運作，再貼程式碼。每段程式前後各有一句說明：這段在做什麼、該注意哪一行。
4. **不用誇張語氣**：不寫「致命」「💣」「絕對禁止」「瞬間 Crash」；改成陳述條件與後果，例如「未捕捉的例外會讓程序結束」。
5. **一段只講一件事**：句子短、段落短。

---

## 3. 技術專題的章節結構

章節固定、依序出現，H2 只用這些標題：

| 章節 | 必要性 | 內容 |
| --- | --- | --- |
| `## 這是什麼` | 每篇，不可省略 | 白話定義、解決什麼問題、在電商的哪裡用到 |
| `## 運作原理` | 每篇 | 機制與圖解，至少一張 Mermaid 圖；事故情境放在這裡當例子 |
| `## 常見錯誤與正確寫法` | 每篇 | 常見寫法與正確寫法對照，程式前後都有說明 |
| `## 使用邊界` | 每篇 | 什麼時候不要用、取捨與替代方案 |
| `## 雲端排查` | 只限雲端排查主題 | 見第 4 節 |

* **雲端排查主題**：資料存取、Redis、RabbitMQ、容器與網路、Kubernetes、GKE、EKS、.NET 執行環境、工程實務。其餘主題（C#、ASP.NET Core、應用安全、架構設計）不寫雲端排查，因為問題不會只在部署環境出現。
* **省略章節**：參考速查若不需要「運作原理」等章節，在 frontmatter 以 `omitSections` 寫明章節與理由。「這是什麼」不能省略。不要為了湊章節寫空泛內容。
* **`articleType`**：深度解析、問題排查、參考速查只是顯示用的標籤，不決定章節。

---

## 4. 雲端排查的格式

依症狀由外往內，分三層，每層再分 GKE 與 EKS 兩個小節；兩邊相同的指令（例如 `kubectl`、dotnet 診斷工具）只寫一次：

1. **叢集層**：`kubectl` 看 Pod、事件、資源用量與探針狀態。
2. **託管服務層**：GKE 用 `gcloud`、Cloud Monitoring 指標與 Cloud Logging 查詢；EKS 用 `aws` CLI、CloudWatch Metrics 與 CloudWatch Logs Insights 查詢。
3. **應用程式層**：在 Pod 內以 `kubectl debug` 搭配 `dotnet-counters`、`dotnet-trace`，或看 OpenTelemetry 指標。

每個指令或指標後面都要接一句「看到什麼數字代表什麼」。不寫本機 `docker` 或裸機 `grep /var/log` 這類指令。

### 部署假設

全站統一以下假設，文章不並列多種部署方式：

| 用途 | GKE（GCP） | EKS（AWS） |
| --- | --- | --- |
| PostgreSQL／MySQL | Cloud SQL，透過 Cloud SQL Auth Proxy 連線 | RDS，透過 RDS Proxy 管理連線 |
| Redis | Memorystore（Redis 相容；產品名依寫作時官方文件） | ElastiCache（Redis／Valkey 相容） |
| RabbitMQ | RabbitMQ Cluster Operator 自建於 GKE | Amazon MQ for RabbitMQ |
| 物件儲存 | GCS：資料庫匯出與備份、商品圖片、Terraform state | S3：同左 |
| Pod 取得雲端權限 | Workload Identity Federation for GKE | EKS Pod Identity |
| 對外流量 | GKE Gateway | AWS Load Balancer Controller |
| 機密 | Secret Manager | AWS Secrets Manager |
| 日誌與指標 | Cloud Logging／Cloud Monitoring | CloudWatch Logs／Metrics |

電商主線只走 GKE；EKS 的差異以連結到 EKS 主題補充。

---

## 5. 正確性：可追溯到官方來源

本站不執行範例，正確性靠「可追溯」：

* 文中出現的每個指令、指標名稱、設定鍵與預設值，都必須能在該篇 `sources` 列出的官方文件裡找到。
* 找不到出處就不寫。不寫「看起來合理」的指標名稱或參數。
* 行為描述標明適用版本（`applicableVersions`）；版本差異大的行為要說明是哪一版開始。
* 程式碼是說明用的片段，不保證能直接編譯；片段上方註明相依套件與命名空間，自訂型別要說明它代表什麼。

---

## 6. Frontmatter 規則

* **標題**：寫成「技術：讀者想解決的問題」，例如「IHttpClientFactory：為什麼 HttpClient 不能每次 new」。不使用「實戰」「生產級」「致命」「三劍客」「終極」。`articleId` 與網址不因改標題而變。
* **`difficulty`**：`beginner`（入門）或 `advanced`（進階），顯示在文章頁與主題列表。
* **`prerequisites`**：最多 2 篇，只列「沒讀過就看不懂本篇」的文章；「讀了會更好」的放 `relatedArticles`。
* **`lastReviewed`**：只在實際改寫或審閱該篇時更新。
* **`sources`**：至少一筆官方文件；見第 5 節。

---

## 7. 圖表

「運作原理」至少一張 Mermaid 圖（時序圖、流程圖或元件圖）。網站會自動繪圖並提供圖表文字。

* 流程圖標籤含括號等特殊字元時，用雙引號包住，例如 `A -->|"呼叫 SaveChanges()"| B`。
* 泛型的角括號用 Mermaid 字元碼，例如 `List#lt;OrderItem#gt;`，避免被當成 HTML 標籤。
* 不要在子圖內以子圖本身連向其成員。
* 新增或修改圖表後，在瀏覽器核對文字、連線、深淺色配色與窄螢幕捲動。

---

## 8. 語言與字數

* 說明文字與註解使用繁體中文；識別字使用英文並遵循 .NET 命名慣例。
* 專有名詞保留標準英文或附中文說明，例如 Cache-Aside（快取旁路）。
* 正文 400～6,000 字（不含程式碼區塊與空白）。每段都要有實質內容，不為字數鋪陳背景。

---

## 9. 改寫過渡期

尚未改成新章節結構的文章列在 `scripts/legacy-articles.json`，暫時不套用第 3、6、7 節的自動檢查。每個主題改寫完成後，把該主題的檔案從清單移除。
