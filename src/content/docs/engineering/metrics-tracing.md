---
title: "Runtime 指標、RPS 與分散式追蹤"
description: "串起 .NET、HTTP、OpenTelemetry 與 W3C Trace Context，分清指標、trace 和本地 request id。"
articleId: "engineering-metrics-tracing"
topic: "engineering"
category: "observability"
order: 2
tags: [".NET Runtime", "GC", "ThreadPool", "HTTP", "RPS", "OpenTelemetry", "Activity.Current", "traceparent", "tracestate", "W3C", "trace", "metrics"]
difficulty: "intermediate"
prerequisites: ["csharp-async-await", "aspnet-core-middleware"]
relatedArticles: ["aspnet-core-http-client-factory", "aspnet-core-grpc", "data-access-pools-locks"]
applicableVersions: "以 .NET 10 生態系與本文列出的官方文件核對；套件及資料庫供應商的差異見內文。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-07"
takeaway: "指標告訴你整體趨勢，trace 串起單次工作；先統一量測範圍，再解讀數字。"
noteDates: ["2026-07-17", "2026-10-06"]
sources: [{"title": "Microsoft Learn：內建 .NET 指標", "url": "https://learn.microsoft.com/en-us/dotnet/core/diagnostics/built-in-metrics"}, {"title": "Microsoft Learn：分散式追蹤 instrumentation", "url": "https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing-instrumentation-walkthroughs"}, {"title": "OpenTelemetry：.NET Instrumentation", "url": "https://opentelemetry.io/docs/languages/dotnet/instrumentation/"}, {"title": "W3C：Trace Context", "url": "https://www.w3.org/TR/trace-context/"}]
---

## 先看流量、延遲與資源

HTTP 可觀察請求數、active requests、錯誤及延遲分布；runtime 可看 allocation、GC 時間 / 次數、heap、ThreadPool thread / queue 等。不同 .NET 版本使用的 counters 與 meters 名稱可能不同，採集前對照目前文件。

RPS 是某個範圍內的請求率，例如累積完成請求數在 60 秒增加 6000，平均是 100 requests/s。需處理 process 重啟造成 counter 歸零，並明確區分單 Pod、全部服務、入口請求與重試次數。多 Pod 的 p95 不能直接平均成全系統 p95。

## Trace Context 跨服務傳播

W3C traceparent 包含 version、trace-id、parent-id 與 flags；tracestate 傳遞供應商相關狀態。HTTP / gRPC instrumentation 注入與擷取這些 context，讓下游 span 保留同一條 trace 的關係。

Activity.Current 表示目前 ambient Activity，會隨非同步執行內容流動，但可能為 null。TraceId 與 span id、HttpContext.TraceIdentifier 的意義不同；不要每一層重新建立獨立 trace-id，也不要把 request id 當作必須完全相同的 trace context。

## 用 ActivitySource 補商業步驟

下面為方法片段；需在應用程式生命週期保留 ActivitySource，並配置 listener / OpenTelemetry pipeline。未在本站接上 exporter 或驗證跨服務追蹤。

~~~csharp title="商業操作片段"
using System.Diagnostics;

// OrderDiagnostics.Source 是由應用程式生命週期保留的 ActivitySource：
using var activity = OrderDiagnostics.Source.StartActivity("orders.confirm", ActivityKind.Internal);
activity?.SetTag("orders.operation", "confirm");
// await 真正的商業操作；activity 在 using 結束時停止。
~~~

沒有 listener 或未被採樣時，StartActivity 可能回傳 null。OpenTelemetry 的 AddSource 需要與 source 名稱一致，ASP.NET Core / HttpClient instrumentation 與 OTLP exporter 也需對應套件及設定。

## 避免量測本身成為問題

metrics label 使用有界維度，例如 route template、status class；不要把每筆訂單 id、使用者 id 或 trace-id 放進 metric labels。trace tag 與 log 也避免秘密與不必要個資。

遇到延遲時，先用 metrics 找時間窗與受影響服務，再用 trace 看 HTTP、gRPC、資料庫及等待段，最後核對 log。採樣、匯出失敗與時鐘差異會影響可見性，沒有 trace 不等於沒有執行過。
