---
title: IDisposable 與 using
description: 讓資源在正確的時間釋放，理解垃圾回收與明確清理的責任。
articleId: csharp-disposable
topic: csharp
category: practice
order: 13
tags: [C#, csharp, IDisposable, using, Dispose, 資源管理]
difficulty: intermediate
prerequisites: [csharp-interfaces, csharp-exceptions]
relatedArticles: ["csharp-async-await", "aspnet-core-dependency-injection", "aspnet-core-http-client-factory", "data-access-transactions"]
applicableVersions: using 陳述式概念通用；完整範例使用 C# 9 以上。
verifiedWith: .NET SDK 10.0.105 / net10.0 / C# 14
lastReviewed: 2026-10-07
takeaway: 垃圾回收處理記憶體，using 幫你在明確時機呼叫 Dispose。
sources:
  - title: Microsoft Learn：using 陳述式
    url: https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/using
noteDates: ["2026-05-21", "2026-05-22", "2026-06-29", "2026-07-01"]
---

## 清理與垃圾回收不同

檔案控制代碼、網路串流等資源，不能只依賴垃圾回收何時發生。提供 <code>IDisposable</code> 的物件，會以 <code>Dispose</code> 表達明確清理的操作。

<code>using</code> 讓控制流程離開區塊時執行清理，即使途中出現例外也會經過必要的釋放流程。

## 觀察釋放時機

下例用一個會輸出訊息的資源型別，直接觀察 <code>Dispose</code> 的呼叫順序。

~~~csharp title="Program.cs"
using (var resource = new DemoResource())
{
    Console.WriteLine("使用資源");
}

Console.WriteLine("離開區塊");

class DemoResource : IDisposable
{
    public void Dispose()
    {
        Console.WriteLine("已釋放");
    }
}
~~~

預期輸出：

~~~text
使用資源
已釋放
離開區塊
~~~

清理發生在離開 <code>using</code> 區塊時。若使用 <code>using var</code> 宣告，清理發生在宣告所屬範圍結束時。

## 讓資源擁有者負責

建立或接管資源的程式，通常也應明確負責其生命週期。不要隨意釋放由其他元件共用或管理的物件。

## 常見錯誤

- 呼叫 <code>Dispose</code> 不等於立即回收物件的 managed 記憶體。
- 已釋放的資源不應繼續使用。
- 提供非同步清理的 <code>IAsyncDisposable</code>，可使用 <code>await using</code>；一般 <code>using</code> 不會自動等待非同步清理。

## 工作筆記：釋放前先確認所有權

FileStream、資料庫 connection 與 HTTP response 都有需要管理的資源；支援 IAsyncDisposable 時可用 await using。開啟 pooling 的資料庫連線通常在 Dispose 後歸還池，不表示每次都拆除實體連線。

DI 容器建立的共用服務由對應容器或 scope 管理，不應由單次使用者任意釋放 Singleton。反過來，自行建立資源就需要安排所有權；scope 也要活到非同步工作真正完成。
