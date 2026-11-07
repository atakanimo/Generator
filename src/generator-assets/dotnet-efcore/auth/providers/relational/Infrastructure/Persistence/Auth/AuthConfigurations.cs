using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using __App__.Domain.Auth;

namespace __App__.Infrastructure.Persistence.Auth;

public sealed class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> builder)
    {
        builder.ToTable("refresh_tokens");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.TokenHash).IsRequired().HasMaxLength(64);
        // Concurrency token: two refreshes with the same token → the second UPDATE matches no row (one winner).
        builder.Property(x => x.RevokedAt).IsConcurrencyToken();
        builder.HasIndex(x => x.TokenHash).IsUnique().HasDatabaseName("ux_refresh_tokens__token_hash");
        builder.HasIndex(x => x.UserId);
        builder.Property(x => x.UserAgent).HasMaxLength(300);
        builder.Property(x => x.Ip).HasMaxLength(64);
    }
}
// @if register|password-reset

public sealed class OtpCodeConfiguration : IEntityTypeConfiguration<OtpCode>
{
    public void Configure(EntityTypeBuilder<OtpCode> builder)
    {
        builder.ToTable("otp_codes");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.Purpose).IsRequired().HasMaxLength(16);
        builder.Property(x => x.CodeHash).IsRequired().HasMaxLength(64);
        builder.HasIndex(x => new { x.UserId, x.Purpose });
    }
}
// @endif
