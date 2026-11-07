using __App__.Api.Auth;
using __App__.Api.Common;
using __App__.Api.Endpoints;
using __App__.Api.Endpoints.Auth;
using __App__.Application;
using __App__.Infrastructure;
using __App__.Infrastructure.Auth;
using Microsoft.AspNetCore.HttpOverrides;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddApplication()
    .AddInfrastructure(builder.Configuration)
    .AddApi(builder.Configuration)
    .AddAuthModule(builder.Configuration);

var app = builder.Build();

await app.Services.InitializeDatabaseAsync(app.Configuration);
// İlk admin (docs/backend/auth.md): hiç admin yoksa Infrastructure/Auth/InitialAdmin.cs'teki kayıt yazılır.
await app.Services.SeedAuthAsync();

// Behind one reverse proxy (nginx / Docker) the client IP comes from the last X-Forwarded-For entry (rate limit, sessions).
var forwarded = new ForwardedHeadersOptions { ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto };
forwarded.KnownIPNetworks.Clear();
forwarded.KnownProxies.Clear();
app.UseForwardedHeaders(forwarded);
app.UseApi();
app.UseRateLimiter();
app.MapGet("/api/health", () => TypedResults.Ok()).AllowAnonymous();
app.MapEndpoints();
app.MapAuthEndpoints();

await app.RunAsync();

public partial class Program;
