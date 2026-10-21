---
title: "映像、容器與 .NET 程序"
description: "從建置產物到執行中的程序，理解映像分層、設定、權限與停止訊號。"
articleId: "containers-image-runtime"
topic: "containers"
category: "container-basics"
order: 1
tags:
  - "映像、容器與 .NET 程序"
  - "containers"
difficulty: "advanced"
prerequisites: []
relatedArticles:
  - "kubernetes-workloads"
  - "dotnet-background-services"
applicableVersions: "以 Kubernetes 現行核心 API 與 Docker 容器模型說明；.NET 10。"
lastReviewed: "2026-10-10"
takeaway: "從建置產物到執行中的程序，理解映像分層、設定、權限與停止訊號。"
sources:
  - title: "Docker multi-stage build"
    url: "https://docs.docker.com/build/building/multi-stage/"
  - title: "Docker container overview"
    url: "https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-a-container/"
  - title: "Microsoft .NET container images"
    url: "https://learn.microsoft.com/en-us/dotnet/core/docker/container-images"
---

## 案發現場

在許多團隊將 .NET 應用程式容器化並部署至 Kubernetes 的過程中，常會遭遇以下兩類經典的生產事故：

事故現場一：**鏡像肥大與冷啟動延遲**。
初學者撰寫的 `Dockerfile` 往往只用一個階段，把完整的 .NET SDK（包含了編譯器、Roslyn、除錯工具與 NuGet 快取）全部打包進最終映像檔。產出的 Docker 鏡像體積高達 **1.2GB**。每次 CI/CD 流水線推送鏡像需要數分鐘，而在 Kubernetes 發生節點自動擴容（Cluster Autoscaler）時，新節點拉取映像檔需要 3~5 分鐘，嚴重拖垮了系統應對流量突波的彈性擴容速度。更糟糕的是，完整的 SDK 留在生產容器內，大幅增加了 CVE 安全漏洞的受攻擊面（Attack Surface）。

事故現場二：**優雅關閉（Graceful Shutdown）完全失效**。
在 Kubernetes 滾動更新新版本時，舊 Pod 收到 `SIGTERM` 準備下線。原本程式碼中寫了平滑處理（等待正在執行的金流扣款完成），但**每次 Pod 總是卡滿 30 秒，隨後被 Kubernetes 發送 `SIGKILL` 暴力砍死**！未處理完的資料庫交易被強制中斷，留下嚴重的髒資料。
排查發現，`Dockerfile` 寫成了：
```dockerfile
ENTRYPOINT dotnet MyApp.dll
```
這種「Shell 格式」導致 Docker 在容器內啟動了 `/bin/sh -c "dotnet MyApp.dll"` 作為 **PID 1**。當 Kubernetes 發送 `SIGTERM` 訊號給 PID 1 時，`/bin/sh` 根本不會將終止訊號轉發給底層的 `dotnet` 子程序！.NET 應用程式完全不知道自己即將被砍，直到 30 秒逾時後遭整機強制終止。

---

## 反模式與正確解法

### 反模式一：單階段建置與使用 Root 最高權限運行

```dockerfile
# 致命反模式：單階段建置 + 巨大 SDK + 預設 Root 身分
FROM mcr.microsoft.com/dotnet/sdk:10.0
WORKDIR /app
COPY . .
RUN dotnet publish -c Release -o out
ENTRYPOINT ["dotnet", "out/MyApp.dll"] # 容器以 root 身分運行，違反安全合約！
```

### 正確解法一：多階段建置（Multi-stage Build）與非 Root Chiseled 映像

利用多階段建置將「編譯環境」與「執行環境」徹底分離。編譯階段使用功能完整的 SDK 映像檔；執行階段則採用極簡的 **Ubuntu Chiseled** 或 **Alpine** 運行時映像檔（不含 Shell、不含套件管理器），並以非 Root 身分（`USER $APP_UID`）執行，**鏡像體積驟降至 110MB，CVE 漏洞減少 90%**：

```dockerfile
# 正確解法：生產級 .NET 10 安全輕量多階段 Dockerfile

# ==================== 階段 1：編譯建置環境 ====================
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# 關鍵最佳化：先拷貝專案檔並執行依賴還原（充分利用 Docker Layer 快取！）
COPY ["src/Ecommerce.Api/Ecommerce.Api.csproj", "src/Ecommerce.Api/"]
COPY ["src/Ecommerce.Domain/Ecommerce.Domain.csproj", "src/Ecommerce.Domain/"]
RUN dotnet restore "src/Ecommerce.Api/Ecommerce.Api.csproj"

# 拷貝剩餘原始碼並編譯發布
COPY . .
WORKDIR "/src/src/Ecommerce.Api"
RUN dotnet publish "Ecommerce.Api.csproj" \
    -c Release \
    -o /app/publish \
    /p:UseAppHost=false

# ==================== 階段 2：極簡無特權生產運行環境 ====================
# 使用微軟官方提供的 Chiseled 映像檔（基於極簡 Ubuntu，零 Shell，超安全）
FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled AS final
WORKDIR /app

# 設定 ASP.NET Core 監聽連接埠（非 Root 身分使用 8080）
ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080

# 複製編譯產物
COPY --from=build /app/publish .

# 以內建的非 Root 使用者（UID 1654）執行，防止容器逃逸攻擊！
USER $APP_UID

# 關鍵：必須使用 Exec 陣列格式，確保 dotnet 成為 PID 1，正確接收 SIGTERM 訊號！
ENTRYPOINT ["dotnet", "Ecommerce.Api.dll"]
```

---

### 反模式二：忽略 cgroup v2 資源限制導致的記憶體崩潰

在舊版容器或未配置 .NET GC 記憶體上限時，.NET 執行階段可能會讀取到「實體宿主機」的總記憶體（例如 128GB），而非 Kubernetes 容器限制的 `resources.limits.memory: 1Gi`。這會導致 .NET 延遲觸發垃圾回收（GC），當記憶體使用量超過 1GB 時，直接被 Linux cgroup OOMKilled 砍死。

### 正確解法二：確保 .NET 容器感知（Container-Aware GC）

現代 .NET 8/10 預設已原生支援 cgroup v2，但在高負載下，應在環境變數明確宣告硬性記憶體上限比率，防止容器被 OOM：

```dockerfile
# 限制 .NET GC 堆積記憶體最多使用容器限額的 75%，保留 25% 給非受管記憶體與執行緒堆疊
ENV DOTNET_GCHeapHardLimitPercent=75
```

---

## 踩坑與避坑指南

### 1. Docker 快取層（Layer Caching）失效陷阱
- **踩坑點**：若在 `Dockerfile` 開頭直接寫 `COPY . .` 隨後執行 `dotnet restore`，那麼只要你修改了任何一行 C# 代碼，後續的全部層（包含耗時的 `dotnet restore`）都必須重新執行！
- **黃金準則**：**永遠先複製 `.csproj` 檔案並執行 `restore`，隨後才複製剩餘代碼！** 只要依賴套件沒變，`restore` 層會 100% 命中 Docker 快取，建置時間從 3 分鐘縮減至 10 秒。

### 2. Alpine 映像檔（musl libc）與 Globalization 國際化
- 若選用極致輕量的 Alpine 映像檔（`aspnet:10.0-alpine`），Alpine 底層使用的是 `musl libc` 而非標準的 `glibc`。
- **踩坑點**：.NET 在處理跨國時區轉換、貨幣符號或中文字串排序時，依賴 `ICU` 函式庫。Alpine 預設未安裝 ICU，若未宣告 `ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false` 並安裝 `icu-libs`，呼叫 `DateTime.ToString()` 時可能引發意料之外的格式化異常。

---

## 線上排查指令

### 1. 檢驗容器內部 PID 1 與執行使用者

進入正在運行的容器或檢驗進程清單：
```bash
# 檢查容器內運行中的進程，確認 dotnet 是否為 PID 1
docker exec <container_id> ps -ef
```
若看到 `1 root /bin/sh -c ...`，代表訊號轉發失敗；正確應為 `1 app dotnet Ecommerce.Api.dll`。

### 2. 檢測容器實際讀取到的 cgroup 記憶體上限

```bash
# 檢視 cgroup v2 容器真實記憶體上限（以 byte 為單位）
docker exec <container_id> cat /sys/fs/cgroup/memory.max
```

### 3. Prometheus / Grafana 監控指標

```text
# 容器記憶體使用率佔 Kubernetes Limit 比例（超過 85% 發出警報）
(container_memory_working_set_bytes{container="api"} / container_spec_memory_limit_bytes{container="api"}) > 0.85

# 容器 OOMKilled 發生次數
kube_pod_container_status_terminated_reason{reason="OOMKilled"} > 0
```
