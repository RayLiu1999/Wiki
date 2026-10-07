---
title: "global.json、NuGet 與中央版本管理"
description: "分清 SDK 選擇、目標框架與套件來源，讓本機及 CI 使用一致的工具與依賴。"
articleId: "dotnet-sdk-packages"
topic: "dotnet"
category: "toolchain"
order: 1
tags: ["global.json", "SDK", "version", "rollForward", "allowPrerelease", "NuGet.config", "clear", "Directory.Packages.props", "中央套件管理"]
difficulty: "intermediate"
prerequisites: ["csharp-getting-started"]
relatedArticles: ["dotnet-hosting", "data-access-migrations", "aspnet-core-api-styles-aot"]
applicableVersions: "以 .NET 10 生態系與本文列出的官方文件核對；套件及資料庫供應商的差異見內文。"
verifiedWith: "已核對官方文件與概念；整合片段需放入對應專案，未在本站建置或連線執行。"
lastReviewed: "2026-10-07"
takeaway: "global.json 選 SDK，TargetFramework 選目標框架；中央套件版本與來源設定再處理另一層問題。"
noteDates: ["2026-06-08", "2026-07-08", "2026-08-07"]
sources: [{"title": "Microsoft Learn：global.json", "url": "https://learn.microsoft.com/en-us/dotnet/core/tools/global-json"}, {"title": "NuGet：nuget.config", "url": "https://learn.microsoft.com/en-us/nuget/reference/nuget-config-file"}, {"title": "NuGet：Central Package Management", "url": "https://learn.microsoft.com/en-us/nuget/consume-packages/central-package-management"}]
---

## SDK 不是應用程式目標框架

global.json 控制 CLI 使用哪個已安裝 SDK；csproj 的 TargetFramework 控制目標 API 與 framework。選 SDK 10 不代表每個專案都會自動改成 net10.0，global.json 也不會替你安裝缺少的 SDK。

以下為工具設定示例，未更動使用者系統的 SDK。version 使用完整版本；latestPatch 接受同一 major / minor / feature band 中不低於指定版本的 patch。

~~~json title="global.json（示意）"
{
  "sdk": {
    "version": "10.0.105",
    "rollForward": "latestPatch",
    "allowPrerelease": false
  }
}
~~~

disable 要求完全相同版本；latestFeature 允許同一 major / minor 的更高 feature band。allowPrerelease 若省略，Visual Studio 與 CLI 的預設可能不同，團隊應明確設定。解析會向父目錄尋找檔案，執行工作目錄也需一致。

## 明確設定 NuGet 來源

nuget.config 可能由多個層級合併。packageSources 內的 `<clear />` 清除先前繼承的來源，再加入專案需要的來源；不會清除所有其他設定區段。

~~~xml title="NuGet.config（示意）"
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
  </packageSources>
</configuration>
~~~

私有 feed 的憑證由環境或 credential provider 管理。多來源時可用 package source mapping 明確定義套件歸屬，避免對來源選擇做隱含假設。

## 中央套件版本管理

Directory.Packages.props 啟用 ManagePackageVersionsCentrally，並以 PackageVersion 宣告版本；各 csproj 的 PackageReference 通常只寫 Include。預設套用最近的中央檔案，巢狀目錄不會自動合併每個檔案。

CPM 集中版本，lock file 固定解析結果，CI locked restore 檢查依賴可重現性，三者用途不同。變更 SDK、來源或中央版本後，應一起驗證 restore、build、test 與實際發布。
