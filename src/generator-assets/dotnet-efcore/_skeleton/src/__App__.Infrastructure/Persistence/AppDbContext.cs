using Microsoft.EntityFrameworkCore;
using __App__.Application.Common.Abstractions;

namespace __App__.Infrastructure.Persistence;

public sealed partial class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options), IAppDbContext
{
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
