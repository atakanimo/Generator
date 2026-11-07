using __App__.Domain.Common;

namespace __App__.Domain.Auth;

/// <summary>
/// Bir oturumun refresh token'ı (docs/backend/auth.md): yalnız SHA-256 hash'i tutulur. Her <c>/refresh</c>'te eskisi
/// iptal edilir (<see cref="RevokedAt"/>, concurrency token) ve yenisi yazılır.
/// </summary>
public sealed class RefreshToken : AuditableEntity
{
    public EntityId UserId { get; set; }
    public string TokenHash { get; set; } = string.Empty;
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public string? UserAgent { get; set; }
    public string? Ip { get; set; }
}
