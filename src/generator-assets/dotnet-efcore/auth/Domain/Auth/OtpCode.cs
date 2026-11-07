// @auth-file register|password-reset
using __App__.Domain.Common;

namespace __App__.Domain.Auth;

/// <summary>E-posta kodu (docs/backend/auth.md): 6 hane, 10 dk, yalnız SHA-256 hash'i; en fazla 5 deneme.</summary>
public sealed class OtpCode : AuditableEntity
{
    public EntityId UserId { get; set; }
    /// <summary><c>verify</c> (kayıt) ya da <c>reset</c> (şifre sıfırlama).</summary>
    public string Purpose { get; set; } = string.Empty;
    public string CodeHash { get; set; } = string.Empty;
    public DateTimeOffset ExpiresAt { get; set; }
    public int Attempts { get; set; }
    public DateTimeOffset? ConsumedAt { get; set; }
}
