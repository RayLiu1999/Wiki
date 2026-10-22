---
title: ".NET SDK 與套件管理：讓每台機器建出一樣的結果，並擋住有漏洞的套件"
description: "說明 global.json 如何固定 SDK 版本、集中套件管理讓所有專案使用同一個版本、找出某個套件是怎麼被引入的，以及套件來源對應與弱點稽核。"
articleId: "dotnet-sdk-packages"
topic: "dotnet"
category: "toolchain"
order: 1
tags: [".NET SDK", "global.json", "Central Package Management", "NuGet", "Package Source Mapping"]
articleType: "reference"
difficulty: "beginner"
prerequisites: []
relatedArticles: ["dotnet-hosting", "engineering-ci-cd", "containers-image-runtime"]
applicableVersions: ".NET 8～10 SDK、NuGet 6.x（dotnet nuget why 需 .NET 8.0.4xx 以上 SDK）。"
lastReviewed: "2026-10-21"
takeaway: "用 global.json 固定 SDK、用 Directory.Packages.props 集中管理套件版本、用套件來源對應避免從錯誤的來源下載套件，並在 CI 檢查已知漏洞。"
omitSections:
  - section: "運作原理"
    reason: "本篇是工具設定的速查，每一項的作用直接寫在對應的段落中。"
  - section: "雲端排查"
    reason: "SDK 與套件的問題發生在建置階段（本機或 CI），不在 GKE／EKS 的執行環境。"
sources:
  - title: "Microsoft Learn：global.json 概觀"
    url: "https://learn.microsoft.com/dotnet/core/tools/global-json"
  - title: "NuGet：集中套件管理（CPM）"
    url: "https://learn.microsoft.com/nuget/consume-packages/central-package-management"
  - title: "NuGet：套件來源對應"
    url: "https://learn.microsoft.com/nuget/consume-packages/package-source-mapping"
  - title: "NuGet：稽核套件的安全性弱點（NuGetAudit）"
    url: "https://learn.microsoft.com/nuget/concepts/auditing-packages"
  - title: "Microsoft Learn：dotnet nuget why"
    url: "https://learn.microsoft.com/dotnet/core/tools/dotnet-nuget-why"
---

## 這是什麼

「在我電腦上可以建置」常常來自兩個差異：每個人裝的 .NET SDK 版本不同，以及各專案引用的套件版本不一致。一個服務有十幾個專案時，同一個套件在 A 專案是 8.0、在 B 專案是 9.0，執行時載入哪一版就看運氣。

.NET 提供幾個工具讓建置結果在每台機器、每次 CI 都一樣：

- **global.json**：固定這個儲存庫使用的 SDK 版本。
- **集中套件管理**（Central Package Management，CPM）：所有專案的套件版本寫在同一個檔案。
- **套件來源對應**：規定哪些套件只能從哪個來源下載。
- **NuGet 稽核**：還原時檢查套件是否有已知的安全漏洞。

## 常見錯誤與正確寫法

### 1. 沒有固定 SDK 版本

不同機器用不同的 SDK，編譯器的警告、分析器的規則、甚至產生的程式碼都可能不同。在儲存庫根目錄放一個 `global.json`：

```json
{
  "sdk": {
    "version": "10.0.100",
    "rollForward": "latestPatch"
  }
}
```

`latestPatch` 允許使用同一個功能版本中較新的修補版（安全更新），但不會跳到新的功能版本。CI 用 `actions/setup-dotnet` 讀取同一份 `global.json`，確保 CI 與開發者使用相同的版本。

### 2. 每個專案各自宣告套件版本

在根目錄建立 `Directory.Packages.props`，所有版本寫在這裡；各專案只寫套件名稱：

```xml
<!-- Directory.Packages.props -->
<Project>
  <PropertyGroup>
    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
  </PropertyGroup>
  <ItemGroup>
    <PackageVersion Include="Npgsql.EntityFrameworkCore.PostgreSQL" Version="10.0.0" />
    <PackageVersion Include="StackExchange.Redis" Version="2.9.11" />
    <PackageVersion Include="RabbitMQ.Client" Version="7.1.2" />
  </ItemGroup>
</Project>
```

```xml
<!-- OrderApi.csproj：不寫版本 -->
<ItemGroup>
  <PackageReference Include="Npgsql.EntityFrameworkCore.PostgreSQL" />
</ItemGroup>
```

升級套件時只改一個地方，整個方案一起升級，也一起測試。

### 3. 不知道某個套件是被誰帶進來的

漏洞報告指出某個套件有問題，但你的專案根本沒有直接引用它。找出它是透過哪一條相依路徑被引入的：

```bash
dotnet nuget why OrderApi.sln System.Text.Json
```

找到後，可以在 `Directory.Packages.props` 加上 `<PackageVersion>` 並在專案中明確引用較新的版本來覆蓋（transitive pinning），或升級引入它的那個套件。

### 4. 只在出事後才檢查漏洞

.NET 8 起還原套件時預設會稽核已知漏洞並產生警告。在 CI 中把漏洞警告視為錯誤，或定期列出：

```bash
dotnet list package --vulnerable --include-transitive
dotnet list package --outdated
```

### 5. 私有套件可能被公開來源搶先

公司內部套件 `Shop.Contracts` 放在私有來源；有人在公開的 nuget.org 上傳同名、更高版本的套件，還原時可能抓到那個版本（相依混淆攻擊）。用套件來源對應規定命名規則：

```xml
<!-- nuget.config -->
<packageSourceMapping>
  <packageSource key="nuget.org">
    <package pattern="*" />
  </packageSource>
  <packageSource key="shop-internal">
    <package pattern="Shop.*" />
  </packageSource>
</packageSourceMapping>
```

`Shop.*` 的套件只會從內部來源下載。

## 使用邊界

- 要完全重現的建置，另外開啟鎖定檔（`RestorePackagesWithLockFile`）並在 CI 用 `dotnet restore --locked-mode`，讓相依的套件版本也不會改變。
- 固定 SDK 不等於永不升級。定期（例如每季）升級 SDK 與套件，取得安全修補，並在升級的同一個 PR 跑完整的測試。
- 容器映像的 SDK 與 runtime 版本也要對應，見 [容器映像與 .NET 程序](/infrastructure/containers-networking/image-runtime/)。
