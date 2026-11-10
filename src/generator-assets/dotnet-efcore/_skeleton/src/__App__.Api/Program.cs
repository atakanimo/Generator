using __App__.Api.Common;
using __App__.Api.Endpoints;
using __App__.Application;
using __App__.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddApplication()
    .AddInfrastructure(builder.Configuration)
    .AddApi(builder.Configuration);

var app = builder.Build();

await app.Services.InitializeDatabaseAsync(app.Configuration);

app.UseApi();
app.MapHealth();
app.MapEndpoints();

await app.RunAsync();

public partial class Program;
