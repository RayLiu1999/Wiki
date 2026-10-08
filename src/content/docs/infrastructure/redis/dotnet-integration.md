---
title: ".NET 整合 Redis 與連線生命週期"
description: "比較 IDistributedCache 與 StackExchange.Redis，管理共享連線、序列化、逾時與取消。"
articleId: "redis-dotnet-integration"
topic: "redis"
category: "redis-caching"
order: 3
tags: ["IDistributedCache","StackExchange.Redis","ConnectionMultiplexer","DI","序列化","timeout"]
difficulty: "intermediate"
prerequisites: ["redis-data-types-ttl","aspnet-core-dependency-injection","csharp-cancellation"]
relatedArticles: ["redis-cache-aside","data-access-pools-locks","redis-reliability"]
applicableVersions: ".NET 10／Microsoft.Extensions.Caching.StackExchangeRedis 10.0.5／StackExchange.Redis 3.3.1／Redis 8.2.10。"
verifiedWith: "已以 SDK 10.0.105 編譯並執行 RedisDemo，核對 IDistributedCache、共享 ConnectionMultiplexer、Hash 與 TTL 輸出。"
lastReviewed: "2026-10-08"
takeaway: "IDistributedCache 提供快取抽象，原生 client 提供 Redis 操作；連線由應用程式生命週期管理。"
noteDates: []
sources: [{"title":"Microsoft Learn：分散式快取","url":"https://learn.microsoft.com/en-us/aspnet/core/performance/caching/distributed?view=aspnetcore-10.0"},{"title":"StackExchange.Redis：Basic Usage","url":"https://seredis.dev/Basics"},{"title":"Redis：.NET 用戶端","url":"https://redis.io/docs/latest/develop/clients/dotnet/"}]
---

## 選擇需要的 API 能力

IDistributedCache 提供 byte[] 的 Get、Set、Refresh、Remove，String extension 方便讀寫文字。它適合「以 Key 儲存快取結果」的用例，不會直接提供 Hash、Sorted Set 或 Lua 的完整能力。

StackExchange.Redis 的 IConnectionMultiplexer 與 IDatabase 則提供原生操作。選擇抽象時先看用例需要什麼；快取格式、TTL 與錯誤處理仍由應用程式負責。

## 共用連線與明確所有權

ConnectionMultiplexer 管理網路連線與多個並行操作，適合長時間重用。GetDatabase 取得操作介面，不是每次建立一個獨立的資料庫網路連線。Web 應用通常在啟動時建立連線，透過 DI 共享，關閉時釋放；避免每個 request 都 Connect。

以下片段取自 RedisDemo/Program.cs。外層先建立 redis 與唯一 prefix，最後由外層 using 釋放連線。provider 使用同一個 multiplexer；不把網路資源所有權交給每次請求。

~~~csharp title="RedisDemo/Program.cs（已納入完整範例）"
var registrations = new ServiceCollection();
registrations.AddStackExchangeRedisCache(options =>
{
    options.InstanceName = prefix;
    options.ConnectionMultiplexerFactory = () => Task.FromResult<IConnectionMultiplexer>(redis);
});
using var services = registrations.BuildServiceProvider();
IDistributedCache cache = services.GetRequiredService<IDistributedCache>();
await cache.SetStringAsync("product:1", "商品快取", new DistributedCacheEntryOptions
{
    AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(30)
});
Console.WriteLine("IDistributedCache: " + await cache.GetStringAsync("product:1"));
~~~

## 執行與觀察

從儲存庫根目錄執行：

~~~sh
pnpm lab:up
pnpm lab:redis
~~~

預期輸出：

~~~text
IDistributedCache: 商品快取
Hash: 商品名稱
String TTL 已設定: True
~~~

完整程式另展示 Hash 操作並移除自己的示範 Key。IDistributedCache provider 的內部格式與前綴由 provider 管理，不能假定與自訂 String 快取可以直接互讀。

## 序列化與期限是資料契約

商品 DTO 使用 System.Text.Json 的 Web 命名設定與明確格式版本。反序列化失敗可能來自版本變更或損壞資料；解析成功後也要檢查商品 ID 與 Key 一致、版本及金額符合契約，不能把任何快取內容都視為可信的完整物件。

AbsoluteExpirationRelativeToNow 以固定時間限制副本生命週期；SlidingExpiration 隨讀取延長。只用 sliding expiration 的熱門舊值可能持續存活，因此需要依新鮮度要求搭配絕對期限或失效機制。

## 逾時、取消與重試

教學設定使用短連線與操作逾時，方便觀察故障；正式環境要依網路與服務延遲設定。AbortOnConnectFail=false 允許建立可恢復的 client，不保證每一次操作成功。

IDistributedCache 的非同步 API 可接 CancellationToken。部分原生操作沒有相同的 token 參數，可使用 WaitAsync 取消等待，但取消等待不等於撤銷已送至 Redis 的命令。逾時後重試 INCR 等修改操作可能重複生效，需依命令與業務設計冪等性。
