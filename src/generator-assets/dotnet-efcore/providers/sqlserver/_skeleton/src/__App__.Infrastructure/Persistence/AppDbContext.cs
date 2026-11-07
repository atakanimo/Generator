using Microsoft.EntityFrameworkCore;
using __App__.Application.Common.Abstractions;
using __App__.Infrastructure.Common;

namespace __App__.Infrastructure.Persistence;

public sealed partial class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options), IAppDbContext
{
    /// <summary>
    /// Metin kolonlarının collation'ı büyük / küçük harfe duyarlı: unique ve eşitlik filtresi PostgreSQL / MongoDB ile aynı
    /// davranır (arama küçük harfe çevirip karşılaştırır). Kolon düzeyinde: <c>ALTER DATABASE … COLLATE</c> açık bağlantıda
    /// düşer (5030) ve Azure SQL'de yapılamaz.
    /// </summary>
    public const string Collation = "Latin1_General_100_CS_AS_SC_UTF8";

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<decimal>().HavePrecision(38, 18).HaveConversion<TrimmedDecimalConverter>();
        configurationBuilder.Properties<string>().UseCollation(Collation);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ApplyGeneratedConfigurations(modelBuilder);
        ApplyAuthConfigurations(modelBuilder);
        OnModelCreatingPartial(modelBuilder);
    }

    /// <summary>Auth tabloları (<c>AppDbContext.Auth.cs</c>, docs/backend/auth.md); auth katmanı olmayan host'ta boş.</summary>
    partial void ApplyAuthConfigurations(ModelBuilder modelBuilder);

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
