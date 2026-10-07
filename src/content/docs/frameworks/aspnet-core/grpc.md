---
title: "gRPC、HTTP/2 與負載平衡"
description: "理解多工連線與單次 RPC 的分配，選擇 L7 proxy 或 client-side load balancing。"
articleId: "aspnet-core-grpc"
topic: "aspnet-core"
category: "integration"
order: 8
tags: ["gRPC", "HTTP/2", "多工", "client-side load balancing", "GrpcChannel", "DNS", "round_robin", "L7"]
difficulty: "intermediate"
prerequisites: ["aspnet-core-http-client-factory", "csharp-async-await"]
relatedArticles: ["aspnet-core-dapr", "engineering-metrics-tracing"]
applicableVersions: "以 .NET 10 生態系與本文列出的官方文件核對；套件及資料庫供應商的差異見內文。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-07"
takeaway: "HTTP/2 可在同一連線多工；只分配 TCP 連線不保證每個 RPC 均勻分配。"
noteDates: ["2026-09-14", "2026-09-29"]
sources: [{"title": "Microsoft Learn：gRPC client-side load balancing", "url": "https://learn.microsoft.com/en-us/aspnet/core/grpc/loadbalancing?view=aspnetcore-10.0"}, {"title": "Microsoft Learn：gRPC 效能", "url": "https://learn.microsoft.com/en-us/aspnet/core/grpc/performance?view=aspnetcore-10.0"}]
---

## 連線與 RPC 不是同一層

一般 .NET gRPC 使用 Protocol Buffers 定義服務與訊息，透過 HTTP/2 傳遞。多個 RPC 可共享連線上的不同 stream；stream 上限仍可能造成排隊，不是無限併發。

L4 load balancer 主要分配連線。同一連線的 RPC 常落在同一個後端，其他 Pod 不一定平均接到流量。L7 proxy 可理解 RPC 並分配；client-side load balancing 則由 client resolver 取得後端位址，再為每次 RPC 選擇端點。

## 用可重用 channel 保存分配狀態

下列為 Grpc.Net.Client 設定片段，需可解析的多端點 DNS、TLS 憑證與 gRPC 服務，未連線執行。該功能要求 .NET 5 以上及 Grpc.Net.Client 2.45.0 以上；選用套件時另核對目前版本。

~~~csharp title="Client 設定（整合片段）"
using Grpc.Core;
using Grpc.Net.Client;
using Grpc.Net.Client.Configuration;

var channel = GrpcChannel.ForAddress("dns:///orders.example.com:443",
    new GrpcChannelOptions
    {
        Credentials = ChannelCredentials.SecureSsl,
        ServiceConfig = new ServiceConfig
        {
            LoadBalancingConfigs = { new RoundRobinConfig() }
        }
    });
// 依服務產生的 client 建構子使用這個 channel；重用至應用程式結束再釋放。
~~~

只回傳一個服務虛擬 IP 的 DNS，不會自動變成 client 可見的多 Pod 位址。需一起確認 service discovery、resolver 更新與故障移除。

## 每個呼叫仍有自己的生命週期

傳遞 deadline 與 cancellation，記錄 RPC status、延遲及 retries。已建立的 streaming RPC 仍維持在同一端點，訊息不會逐筆 round-robin；更換端點或重試也需尊重操作的冪等性。
