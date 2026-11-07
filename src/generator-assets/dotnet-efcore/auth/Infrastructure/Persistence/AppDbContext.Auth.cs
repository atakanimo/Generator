using Microsoft.EntityFrameworkCore;
using __App__.Domain.Auth;
using __App__.Infrastructure.Persistence.Auth;

namespace __App__.Infrastructure.Persistence;

/// <summary>Auth tabloları (docs/backend/auth.md): <c>OnModelCreating</c> <c>ApplyAuthConfigurations</c>'ı çağırır.</summary>
public sealed partial class AppDbContext
{
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    // @if register|password-reset
    public DbSet<OtpCode> OtpCodes => Set<OtpCode>();
    // @endif

    partial void ApplyAuthConfigurations(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfiguration(new RefreshTokenConfiguration());
        // @if register|password-reset
        modelBuilder.ApplyConfiguration(new OtpCodeConfiguration());
        // @endif
    }
}
