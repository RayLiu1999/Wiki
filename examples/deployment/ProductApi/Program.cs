var builder = WebApplication.CreateBuilder(args);
builder.Services.AddHealthChecks();
var app = builder.Build();

app.MapGet("/", () => Results.Ok(new { service = "devwiki-product-api" }));
app.MapGet("/products/{id:int}", (int id) => id == 1
    ? Results.Ok(new { id = 1, name = "保溫杯", price = 120.00m, servedBy = Environment.MachineName })
    : Results.NotFound());
app.MapHealthChecks("/health/live");
app.MapHealthChecks("/health/ready");

app.Run();
