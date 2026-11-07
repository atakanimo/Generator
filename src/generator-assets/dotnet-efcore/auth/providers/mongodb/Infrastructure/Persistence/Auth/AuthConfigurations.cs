using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using MongoDB.Bson;
using MongoDB.EntityFrameworkCore.Extensions;
using __App__.Domain.Auth;

namespace __App__.Infrastructure.Persistence.Auth;

public sealed class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> builder)
    {
        builder.ToCollection("refresh_tokens");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.UserId).HasElementName("userId");
        builder.Property(x => x.TokenHash).HasElementName("tokenHash");
        builder.Property(x => x.ExpiresAt).HasElementName("expiresAt").HasBsonRepresentation(BsonType.DateTime);
        // Concurrency token: two refreshes with the same token → the second update matches nothing (one winner).
        builder.Property(x => x.RevokedAt).HasElementName("revokedAt").HasBsonRepresentation(BsonType.DateTime).IsConcurrencyToken();
        builder.Property(x => x.UserAgent).HasElementName("userAgent");
        builder.Property(x => x.Ip).HasElementName("ip");
        builder.Property(x => x.CreatedAt).HasElementName("createdAt").HasBsonRepresentation(BsonType.DateTime);
        builder.Property(x => x.UpdatedAt).HasElementName("updatedAt").HasBsonRepresentation(BsonType.DateTime);
        builder.HasIndex(x => x.TokenHash).IsUnique();
        builder.HasIndex(x => x.UserId);
    }
}
// @if register|password-reset

public sealed class OtpCodeConfiguration : IEntityTypeConfiguration<OtpCode>
{
    public void Configure(EntityTypeBuilder<OtpCode> builder)
    {
        builder.ToCollection("otp_codes");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).ValueGeneratedNever();
        builder.Property(x => x.UserId).HasElementName("userId");
        builder.Property(x => x.Purpose).HasElementName("purpose");
        builder.Property(x => x.CodeHash).HasElementName("codeHash");
        builder.Property(x => x.ExpiresAt).HasElementName("expiresAt").HasBsonRepresentation(BsonType.DateTime);
        builder.Property(x => x.Attempts).HasElementName("attempts");
        builder.Property(x => x.ConsumedAt).HasElementName("consumedAt").HasBsonRepresentation(BsonType.DateTime);
        builder.Property(x => x.CreatedAt).HasElementName("createdAt").HasBsonRepresentation(BsonType.DateTime);
        builder.Property(x => x.UpdatedAt).HasElementName("updatedAt").HasBsonRepresentation(BsonType.DateTime);
        builder.HasIndex(x => new { x.UserId, x.Purpose });
    }
}
// @endif
