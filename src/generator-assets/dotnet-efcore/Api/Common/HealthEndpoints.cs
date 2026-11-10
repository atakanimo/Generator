using __App__.Application.Common.Results;
using __App__.Infrastructure.Persistence;

namespace __App__.Api.Common;

public sealed record HealthData(string Status, string Environment, bool DatabaseConnected);

public static class HealthEndpoints
{
    public static IEndpointRouteBuilder MapHealth(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/health", async (AppDbContext db, IHostEnvironment environment, CancellationToken cancellationToken) =>
            Result.Ok(new HealthData("ok", environment.EnvironmentName, await CanConnectAsync(db, cancellationToken))).ToHttp())
            .AllowAnonymous();
        return app;
    }

    private static async Task<bool> CanConnectAsync(AppDbContext db, CancellationToken cancellationToken)
    {
        try
        {
            return await db.Database.CanConnectAsync(cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return false;
        }
    }
}
