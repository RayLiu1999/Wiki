using System.Text.Json;
using StackExchange.Redis;

namespace DevWiki.Labs;

public sealed class CachedProducts(OrderStore store, IDatabase cache, TimeSpan lifetime)
{
    private long databaseReads;
    public long DatabaseReads => Interlocked.Read(ref databaseReads);
    public static string Key(int id) => $"devwiki:products:v1:{id}";

    public async Task<ProductRead?> GetAsync(int id, CancellationToken token = default)
    {
        token.ThrowIfCancellationRequested();
        bool unavailable = false;
        try
        {
            RedisValue value = await cache.StringGetAsync(Key(id)).WaitAsync(token);
            if (value.HasValue)
            {
                Product? product = JsonSerializer.Deserialize<Product>((string)value!, JsonDefaults.Options);
                if (product is null || product.Id != id || product.Version <= 0 || string.IsNullOrWhiteSpace(product.Name)
                    || product.Price < 0 || product.Price > 9999999999.99m || decimal.Round(product.Price, 2) != product.Price)
                    throw new JsonException("商品副本與 Key 或資料契約不符。");
                Diagnostics.CacheHits.Add(1);
                return new ProductRead(product, "redis");
            }
        }
        catch (Exception error) when (error is RedisException or JsonException)
        {
            unavailable = true;
            Diagnostics.CacheErrors.Add(1);
        }

        Diagnostics.CacheMisses.Add(1);
        // wiki:start:cache-aside
        Interlocked.Increment(ref databaseReads);
        Product? current = await store.GetProductAsync(id, token);
        if (current is null) return null;
        if (!unavailable)
        {
            try
            {
                await cache.StringSetAsync(Key(id), JsonSerializer.Serialize(current, JsonDefaults.Options), lifetime).WaitAsync(token);
            }
            catch (RedisException)
            {
                unavailable = true;
                Diagnostics.CacheErrors.Add(1);
            }
        }
        return new ProductRead(current, unavailable ? "database-fallback" : "database");
        // wiki:end:cache-aside
    }

    public async Task<bool> UpdateAsync(int id, decimal price, CancellationToken token = default)
    {
        if (!await store.UpdatePriceAsync(id, price, token)) return false;
        try
        {
            await cache.KeyDeleteAsync(Key(id)).WaitAsync(token);
        }
        catch (RedisException)
        {
            // 資料庫已提交；快取靠 TTL 界定舊值存活時間，正式系統另安排失效重試。
            Diagnostics.CacheErrors.Add(1);
        }
        return true;
    }
}
