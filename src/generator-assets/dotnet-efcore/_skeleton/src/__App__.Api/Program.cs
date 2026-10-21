using Microsoft.EntityFrameworkCore;
using __App__.Api.Common;
using __App__.Api.Endpoints;
using __App__.Application;
using __App__.Infrastructure;
using __App__.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddApplication()
    .AddInfrastructure(builder.Configuration)
    .AddApi(builder.Configuration);

var app = builder.Build();

if (app.Configuration.GetValue<bool>("Database:MigrateOnStartup"))
{
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
}

app.UseApi();
app.MapGet("/api/health", () => TypedResults.Ok()).AllowAnonymous();
app.MapEndpoints();

await app.RunAsync();

public partial class Program;
