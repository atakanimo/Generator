using Microsoft.EntityFrameworkCore;
using __App__.Application.Common.Abstractions;

namespace __App__.Infrastructure.Persistence;

public sealed partial class AppDbContext : DbContext, IAppDbContext
{
    /// <summary>
    /// Transaction yok (Express gibi): sağlayıcı birden fazla doküman yazan <c>SaveChanges</c>'i transaction'la açar, tek
    /// düğümlü (standalone) MongoDB bunu reddeder. Replica set'te tek parça kayıt için <c>AutoTransactionBehavior.WhenNeeded</c>.
    /// </summary>
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options) =>
        Database.AutoTransactionBehavior = AutoTransactionBehavior.Never;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ApplyGeneratedConfigurations(modelBuilder);
        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
