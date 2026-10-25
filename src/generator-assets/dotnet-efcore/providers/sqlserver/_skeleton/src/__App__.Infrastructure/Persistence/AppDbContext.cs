using Microsoft.EntityFrameworkCore;
using __App__.Application.Common.Abstractions;
using __App__.Infrastructure.Common;

namespace __App__.Infrastructure.Persistence;

public sealed partial class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options), IAppDbContext
{
    /// <summary>
    /// Veritabanı collation'ı büyük / küçük harfe duyarlı: unique ve eşitlik filtresi PostgreSQL / MongoDB ile aynı davranır
    /// (arama küçük harfe çevirip karşılaştırır).
    /// </summary>
    public const string Collation = "Latin1_General_100_CS_AS_SC_UTF8";

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder) =>
        configurationBuilder.Properties<decimal>().HavePrecision(38, 18).HaveConversion<TrimmedDecimalConverter>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.UseCollation(Collation);
        ApplyGeneratedConfigurations(modelBuilder);
        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
