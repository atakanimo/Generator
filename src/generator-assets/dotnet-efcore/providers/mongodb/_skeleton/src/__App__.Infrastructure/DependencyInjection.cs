using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using MongoDB.Driver;
using __App__.Application.Common.Abstractions;
using __App__.Application.Common.Errors;
using __App__.Infrastructure.Common;
using __App__.Infrastructure.Persistence;

namespace __App__.Infrastructure;

public static class DependencyInjection
{
    /// <summary>Bağlantı dizesi yalnızca ortamdan: <c>ConnectionStrings__Default</c> (veritabanı adı dizenin içinde).</summary>
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var url = MongoUrl.Create(configuration.GetConnectionString("Default")
            ?? throw new InvalidOperationException("ConnectionStrings__Default is not set."));
        var database = url.DatabaseName ?? throw new InvalidOperationException("ConnectionStrings__Default has no database name.");

        services.AddSingleton<IMongoClient>(new MongoClient(url));
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<TimestampInterceptor>();
        services.AddDbContext<AppDbContext>((sp, options) => options
            .UseMongoDB(sp.GetRequiredService<IMongoClient>(), database)
            .AddInterceptors(sp.GetRequiredService<TimestampInterceptor>()));
        services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<AppDbContext>());
        services.AddSingleton<IDbErrorClassifier, DbErrorClassifier>();

        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUser, CurrentUser>();
        return services;
    }

    /// <summary>
    /// Açılışta şema: <c>Database:EnsureIndexesOnStartup</c> açıksa collection'lar ve modeldeki index'ler (unique dahil)
    /// kurulur; idempotent, yeni index'i var olan collection'a ekler. MongoDB'de migration yok. Var olan veride tekrar
    /// yüzünden kurulamayan unique index API'yi düşürmez, hata loglanır (Express ile aynı).
    /// </summary>
    public static async Task InitializeDatabaseAsync(this IServiceProvider services, IConfiguration configuration)
    {
        if (!configuration.GetValue<bool>("Database:EnsureIndexesOnStartup"))
        {
            return;
        }

        using var scope = services.CreateScope();
        try
        {
            await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreatedAsync();
        }
        catch (MongoCommandException ex) when (ex.Code == 11000)
        {
            scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Database")
                .LogError(ex, "Unique index could not be created: existing documents have duplicate values.");
        }
    }
}
