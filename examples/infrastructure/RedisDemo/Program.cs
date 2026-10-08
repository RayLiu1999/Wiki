using DevWiki.Labs;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.DependencyInjection;
using StackExchange.Redis;

using var redis = await ConnectionMultiplexer.ConnectAsync(LabOptions.RedisOptions());
string prefix = "devwiki:demo:" + Guid.NewGuid().ToString("N") + ":";

// wiki:start:redis-dotnet
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
// wiki:end:redis-dotnet

IDatabase database = redis.GetDatabase();
string hashKey = prefix + "product:hash";
await database.HashSetAsync(hashKey, [new HashEntry("name", "商品名稱"), new HashEntry("price", "100.00")]);
await database.KeyExpireAsync(hashKey, TimeSpan.FromSeconds(30));
Console.WriteLine("Hash: " + await database.HashGetAsync(hashKey, "name"));
string stringKey = prefix + "product:string";
await database.StringSetAsync(stringKey, "100.00", TimeSpan.FromSeconds(30));
Console.WriteLine("String TTL 已設定: " + ((await database.KeyTimeToLiveAsync(stringKey)) > TimeSpan.Zero));
await cache.RemoveAsync("product:1");
await database.KeyDeleteAsync([hashKey, stringKey]);
