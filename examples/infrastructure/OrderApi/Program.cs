using DevWiki.Labs;
using Npgsql;
using StackExchange.Redis;

await using var database = LabOptions.Database();
using var redis = await ConnectionMultiplexer.ConnectAsync(LabOptions.RedisOptions());
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton(database);
builder.Services.AddSingleton<OrderStore>();
builder.Services.AddSingleton(services => new CachedProducts(
    services.GetRequiredService<OrderStore>(), redis.GetDatabase(), TimeSpan.FromSeconds(30)));
var app = builder.Build();

app.MapGet("/products/{id:int}", async Task<IResult> (int id, CachedProducts products, CancellationToken token) =>
{
    ProductRead? result = await products.GetAsync(id, token);
    return result is null ? Results.NotFound() : Results.Ok(result);
});

app.MapPut("/products/{id:int}/price", async Task<IResult> (int id, PriceRequest request, CachedProducts products, CancellationToken token) =>
{
    if (request.Price is not decimal price || price < 0 || price > 9999999999.99m || decimal.Round(price, 2) != price)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["price"] = ["單價必須是範圍內的非負金額，最多兩位小數。"] });
    return await products.UpdateAsync(id, price, token) ? Results.NoContent() : Results.NotFound();
});

app.MapPost("/orders", async Task<IResult> (OrderRequest request, OrderStore store, CancellationToken token) =>
{
    if (request.ProductId <= 0 || request.Quantity <= 0)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["order"] = ["商品識別碼與件數必須大於零。"] });
    try
    {
        OrderPlaced message = await store.CreateOrderAsync(Guid.NewGuid(), Guid.NewGuid(), request.ProductId, request.Quantity, token);
        return Results.Created("/orders/" + message.OrderId, message);
    }
    catch (PostgresException error) when (error.SqlState == PostgresErrorCodes.ForeignKeyViolation)
    {
        return Results.NotFound(new { error = "找不到指定商品。" });
    }
});

app.MapGet("/orders/{id:guid}", async Task<IResult> (Guid id, OrderStore store, CancellationToken token) =>
    await store.GetOrderAsync(id, token) is { } status ? Results.Ok(status) : Results.NotFound());

await app.RunAsync();

public sealed record PriceRequest(decimal? Price);
public sealed record OrderRequest(int ProductId, int Quantity);
