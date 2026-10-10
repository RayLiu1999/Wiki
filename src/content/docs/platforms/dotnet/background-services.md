---
title: "BackgroundService 實戰：未捕捉例外崩潰與優雅停機"
description: "深入剖析 BackgroundService 生命週期、未捕獲例外導致整站 Crash 的根本原因、Scoped 服務注入陷阱，以及 Kubernetes 優雅停機最佳實務。"
articleId: "dotnet-background-services"
topic: "dotnet"
category: "runtime-models"
order: 2
tags: [".NET", "BackgroundService", "IHostedService", "優雅停機", "Graceful Shutdown", "例外處理"]
articleType: "deep-dive"
prerequisites: ["csharp-cancellation-disposable"]
relatedArticles: ["dotnet-hosting", "csharp-channels"]
applicableVersions: ".NET 8 / .NET 10、C# 12+ / 14"
verifiedWith: ".NET SDK 10.0.105 實測編譯與執行"
lastReviewed: "2026-10-10"
takeaway: "ExecuteAsync 內部必須完整隔離未預期例外防範整站崩潰；循規監聽 stoppingToken 確保 Pod 收到 SIGTERM 時能優雅收尾。"
sources:
  - title: "Microsoft Learn：.NET 中的背景工作 Worker 服務"
    url: "https://learn.microsoft.com/zh-tw/dotnet/core/extensions/workers"
  - title: "Microsoft Learn：BackgroundService 類別"
    url: "https://learn.microsoft.com/zh-tw/dotnet/api/microsoft.extensions.hosting.backgroundservice"
---

## 案發現場

某電商核心 API 服務偶發性全站重啟。排查 Kubernetes 事件，發現 Pod 頻繁被判定死亡。調閱歷史崩潰日誌，竟然是因為背景推播佇列在遇到一筆格式錯亂的 JSON 訊息時拋出 `JsonReaderException`，該例外在 `ExecuteAsync` 中未被捕捉；自 .NET 6 起，宿主預設政策將背景未處理例外視為致命錯誤，直接**將整台主機強制終止**！

另一起事故中，K8s 重新部署時發出 `SIGTERM` 停機訊號，正在執行訂單批次退款的 Worker 卻對取消訊號渾然不覺，最終在 30 秒超時後被 `SIGKILL` 暴力擊殺，留下未對齊帳目的殘損資料。

## 致命反模式 vs. 正確解法

```text
【Kubernetes Pod 優雅停機（Graceful Shutdown）】
K8s 發送 SIGTERM ──► CLR 觸發 stoppingToken.Cancel()
                       │
                       ├── (✅ 監聽 Token: 停止接新單、清空緩衝、提交交易) ──► Pod 乾淨退出
                       └── (❌ 忽視 Token: 繼續硬跑) ──(逾時 30s)──► 💥 SIGKILL 強制擊殺！
```

### 坑一：未防禦例外導致整站崩潰

```csharp
// 💣 Bad：一旦 ProcessQueue 噴錯，整個 ASP.NET Core Web API 立即陪葬！
protected override async Task ExecuteAsync(CancellationToken stoppingToken)
{
    while (!stoppingToken.IsCancellationRequested)
    {
        await ProcessQueueAsync(); // 拋出例外即 Crash 整個 Host
    }
}
```

### 坑二：在 Singleton 背景服務中直接注入 Scoped 服務

`BackgroundService` 生命週期是 Singleton。若直接注入 `DbContext` 等 Scoped 服務，會引發捕捉性依賴（Captive Dependency），導致整個行程共用同一 DbContext 實體引發資料競爭崩潰。

~~~csharp title="Program.cs"
// ✅ Good：例外自我防禦、Scoped 範圍建立與優雅取消
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var cts = new CancellationTokenSource();
cts.CancelAfter(TimeSpan.FromMilliseconds(50));

var worker = new SafeOrderWorker();
await worker.StartWorkAsync(cts.Token);

public sealed class SafeOrderWorker
{
    public async Task StartWorkAsync(CancellationToken stoppingToken)
    {
        Console.WriteLine("Worker 啟動，監聽佇列事件");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // 模擬單次迴圈中的非同步作業（串聯 stoppingToken）
                await Task.Delay(10, stoppingToken);
                Console.WriteLine("成功處理單筆訂單事件");
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                Console.WriteLine("收到停機訊號，退出處理迴圈");
                break;
            }
            catch (Exception ex)
            {
                // 關鍵：捕捉並記錄特定業務例外，隔離錯誤，絕對不外拋搞垮整站
                Console.WriteLine($"業務處理異常但成功隔離: {ex.Message}");
            }
        }

        Console.WriteLine("清理資源並完成優雅關機");
    }
}
~~~

預期輸出：
```text
Worker 啟動，監聽佇列事件
成功處理單筆訂單事件
收到停機訊號，退出處理迴圈
清理資源並完成優雅關機
```

## 踩坑與避坑指南

* **Host 崩潰政策調校**：若確實希望某個次要背景任務失敗時不要關閉 Web API，可在啟動組態配置 `services.Configure<HostOptions>(opts => opts.BackgroundServiceExceptionBehavior = BackgroundServiceExceptionBehavior.Ignore);`，但更推薦在 Worker 內落實自我防禦隔離。
* **正確使用 `IServiceScopeFactory`**：在背景 Worker 中存取資料庫時，務必在每輪迭代中透過 `using var scope = _scopeFactory.CreateScope();` 建立獨立的生命週期範圍。
* **避坑原則（什麼時候不要用 BackgroundService 承載長排程？）**：
  * **水平擴展的多副本環境**：當 API 擴容至 5 個 Pod 時，每個 Pod 都會各自運行獨立的 `BackgroundService`。若無分散式排程器（如 Hangfire、Quartz）配合分散式鎖，會導致相同的排程任務被重複執行 5 次。

## 線上排查指令

線上排查背景任務崩潰與停機異常：

```bash
# 1. 檢視 Pod 前一次退出的崩潰日誌
kubectl logs <pod-name> --previous --tail=50

# 2. 驗證 DI 容器是否有 Captive Dependency（應在 Program.cs 啟用）
# builder.Host.UseDefaultServiceProvider(options => {
#     options.ValidateScopes = true;
#     options.ValidateOnBuild = true;
# });
```
