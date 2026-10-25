using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using __App__.Application.Common.Abstractions;
using __App__.Application.Common.Errors;
using __App__.Infrastructure.Common;
using __App__.Infrastructure.Persistence;

namespace __App__.Infrastructure;

public static class DependencyInjection
{
    /// <summary>Bağlantı dizesi yalnızca ortamdan: <c>ConnectionStrings__Default</c>.</summary>
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Default")
            ?? throw new InvalidOperationException("ConnectionStrings__Default is not set.");

        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<TimestampInterceptor>();
        services.AddDbContext<AppDbContext>((sp, options) => options
            .UseNpgsql(connectionString)
            .UseSnakeCaseNamingConvention()
            .AddInterceptors(sp.GetRequiredService<TimestampInterceptor>()));
        services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<AppDbContext>());
        services.AddSingleton<IDbErrorClassifier, DbErrorClassifier>();

        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUser, CurrentUser>();
        return services;
    }

    /// <summary>Açılışta şema: <c>Database:MigrateOnStartup</c> açıksa bekleyen migration'lar uygulanır.</summary>
    public static async Task InitializeDatabaseAsync(this IServiceProvider services, IConfiguration configuration)
    {
        if (!configuration.GetValue<bool>("Database:MigrateOnStartup"))
        {
            return;
        }

        using var scope = services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
    }
}
