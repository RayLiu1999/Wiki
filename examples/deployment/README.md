# 商品 API 部署範例

這是獨立的 .NET 10 部署教學程式。`GET /products/1` 回傳保溫杯、價格 120 與 `servedBy` 程序識別；其他商品為 404。`/health/live` 和 `/health/ready` 僅確認程序可回應，不測資料庫或其他相依。沒有訂單、庫存、Redis 或 RabbitMQ。

Dockerfile 使用官方 .NET 10 SDK 建置、ASP.NET 10 runtime 執行，兩個基底都固定到已核對的 multi-platform manifest digest，容器以非 root 的 `app` 使用者監聽 8080。Kubernetes 宣告使用兩個副本和專用 Namespace；資源數值供本機學習，GKE Autopilot 可能按政策調整。

完整操作與環境前提在網站的「容器化商品 API」「本機 Kubernetes」「GKE 學習環境」三份實作指南。原始內容位於 `src/content/handbook/practice/`。本目錄的映像與根目錄提供 Wiki 的 Dockerfile 各有用途。

`gateway.yaml` 是 GKE Gateway Controller 的 HTTP 學習入口，會涉及雲端負載平衡資源；需要已啟用 Gateway API 的 GKE 叢集及相應權限。它沒有設定網域、HTTPS 憑證或正式流量政策，請依指南核對前提與清理。

本次建置實際使用 SDK 10.0.401 與 ASP.NET／.NET runtime 10.0.12（Linux arm64），HTTP 商品／健康與 SIGTERM 停止通過。kind 及 GKE 尚未執行叢集驗證；amd64 架構的建置仍需在對應環境核對。
