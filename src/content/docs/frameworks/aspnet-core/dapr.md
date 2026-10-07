---
title: "Dapr Sidecar 與 .NET 服務通訊"
description: "分清應用程式、sidecar 與遠端服務的協定，理解服務呼叫和其他 building blocks。"
articleId: "aspnet-core-dapr"
topic: "aspnet-core"
category: "integration"
order: 9
tags: ["Dapr", "sidecar", "DaprClient", "HTTP", "gRPC", "服務整合", "pub/sub"]
difficulty: "intermediate"
prerequisites: ["aspnet-core-grpc", "aspnet-core-http-client-factory"]
relatedArticles: ["engineering-metrics-tracing", "data-access-pools-locks"]
applicableVersions: "以 .NET 10 生態系與本文列出的官方文件核對；套件及資料庫供應商的差異見內文。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-07"
takeaway: "應用程式到本地 sidecar，以及遠端 sidecar 到服務，是不同的通訊段。"
noteDates: ["2026-09-14", "2026-09-29"]
sources: [{"title": "Dapr：.NET SDK", "url": "https://docs.dapr.io/developing-applications/sdks/dotnet/"}, {"title": "Dapr：DaprClient 使用方式", "url": "https://docs.dapr.io/developing-applications/sdks/dotnet/dotnet-client/dotnet-daprclient-usage/"}, {"title": "Dapr：Service invocation overview", "url": "https://docs.dapr.io/developing-applications/building-blocks/service-invocation/service-invocation-overview/"}]
---

## Sidecar 把哪些責任放在外面

Dapr 為服務提供 service invocation、pub/sub、state 等 building blocks。應用程式呼叫本地 sidecar 的 HTTP / gRPC API，sidecar 再依配置與其他服務或基礎設施互動。

服務本身暴露 HTTP API，不代表 .NET SDK 到 sidecar 的每個呼叫都使用 HTTP；反過來，SDK 透過 gRPC 通訊，也不代表遠端服務一定是 gRPC。應分別確認每一段協定與功能支援。

## 配置端點與資源生命週期

.NET SDK 可使用 DAPR_HTTP_ENDPOINT / DAPR_GRPC_ENDPOINT，或對應的 port 環境變數。依官方指南一起設定所需的 HTTP 與 gRPC 端點，避免假設所有 building blocks 都走同一協定。

DaprClient 持有網路資源，通常透過 DI 依應用程式生命週期管理，避免每次工作都重建。Service invocation 可使用原生 HTTP / gRPC client 搭配 Dapr routing；SDK 的特定 helper 是否保留或標示 obsolete，需依實際套件版本核對。本篇不固定一個可能已變更的 helper API。

## 服務可靠性仍需設計

確認 app-id、app-port、sidecar 健康與 component 設定，再檢查 trace propagation。Dapr 不會自動讓跨服務呼叫成為資料庫交易，也不會讓重試的副作用恰好執行一次；timeout、重試、冪等與訊息重複仍需明確契約。

Sidecar 的連線與應用程式中的資料庫連線池也不是同一件事。若要評估瓶頸，分開量測應用程式、sidecar、網路與資料庫的等待。本篇是概念指南，未啟動 Dapr runtime。
