---
title: 從第一個 C# 程式開始
description: 分清 C#、.NET 與 SDK 的角色，建立並執行你的第一個主控台程式。
articleId: csharp-getting-started
topic: csharp
category: basics
order: 1
tags: [C#, csharp, .NET, SDK, 入門, Console]
difficulty: beginner
prerequisites: []
relatedArticles: [csharp-variables]
applicableVersions: 主控台範例使用 C# 9 頂層陳述式；單檔執行需 .NET 10 / C# 14。
verifiedWith: .NET SDK 10.0.105 / net10.0 / C# 14
lastReviewed: "2026-10-08"
takeaway: C# 是語言，.NET 是執行平台，SDK 是建立與執行專案的工具。
sources:
  - title: Microsoft Learn：C# 語言概覽
    url: https://learn.microsoft.com/en-us/dotnet/csharp/tour-of-csharp/overview
  - title: Microsoft Learn：dotnet new
    url: https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-new
learningDepth: "basic"
---

C# 是描述程式行為的語言，.NET 提供執行環境與標準函式庫，SDK 則提供建置工具。先跑一個完整 Console 程式，理解原始碼如何變成可執行結果，之後再把同樣的語言放進商品 API。

## 先分清三個角色

<code>C#</code> 決定程式怎麼寫，例如型別、方法與條件語法。<code>.NET</code> 提供執行環境與程式庫。<code>.NET SDK</code> 則包含編譯器和命令列工具，讓你建立、建置與執行專案。

只安裝 Runtime 通常不足以開發程式。準備好 SDK 後，先在終端機輸入 <code>dotnet --info</code>，確認環境能辨識它。

## 建立第一個專案

先執行以下命令，建立主控台專案：

~~~sh
dotnet new console -n FirstWiki
dotnet run --project FirstWiki
~~~

開啟專案中的 <code>Program.cs</code>，把內容改成下面的程式。主控台適合先理解語言，因為輸入與輸出都很直接。

## 從一行程式開始

~~~csharp title="Program.cs"
Console.WriteLine("Hello, DevWiki!");
~~~

預期輸出：

~~~text
Hello, DevWiki!
~~~

<code>Console.WriteLine</code> 把文字輸出到主控台，字串放在雙引號內，每個陳述式最後用分號結束。這裡使用頂層陳述式，編譯器會建立必要的程式進入點。

## 實務上留意這些事

- 先確認最小範例能執行，再加入變數或方法，這樣比較容易定位錯誤。
- <code>dotnet build</code> 負責建置；<code>dotnet run</code> 會視需要建置後執行。
- 範例使用的 SDK 與語言版本是不同概念，閱讀文章時應分別確認。
- .NET 10 支援單檔應用程式，但本系列仍以主控台專案的 <code>Program.cs</code> 作為閱讀起點。

## 套用到電商情境

商品 API 和通知 Worker 都由 C# 程式建立，但 Console 的一次輸出、HTTP 的一次回應和持續運作的背景服務有不同生命週期。先確認能編譯與執行，再逐步加入框架；本篇的 Hello World 只用來觀察程式入口。

[閱讀對應的電商章節](/projects/ecommerce/catalog/)，把本篇概念接到整個用例。
