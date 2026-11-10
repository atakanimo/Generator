using System.Text.Json.Serialization;

namespace __App__.Application.Auth;

/// <summary>Cevaplardaki kullanıcı (docs/backend/auth.md "Sözleşme"); şifre hash'i hiçbir cevapta yok.</summary>
/// <remarks><c>HasPassword</c>: Google / Apple hesabı henüz şifre oluşturmadıysa <c>false</c> (<c>set-password</c>).</remarks>
public sealed record AuthUser(EntityId Id, string Email, string Name, string Role, string Provider, bool EmailVerified, bool HasPassword)
{
    /// <summary>Only on <c>GET /me</c>: the <c>AuthHooks.OnSessionAsync</c> fields at top level (same as Express / Python).</summary>
    [JsonExtensionData]
    public Dictionary<string, object>? Extra { get; init; }
}

/// <summary>
/// Login / refresh / doğrulama / sosyal giriş cevabı. <see cref="Extra"/>: host'a özel alanlar
/// (<c>AuthHooks.OnSessionAsync</c>), cevabın üst seviyesine yazılır.
/// </summary>
public sealed record AuthSession(
    string AccessToken,
    string RefreshToken,
    int ExpiresIn,
    AuthUser User,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] bool? IsNewUser)
{
    [JsonExtensionData]
    public Dictionary<string, object>? Extra { get; init; }
}

public sealed record LoginBody(string? Email, string? Password);
public sealed record RefreshBody(string? RefreshToken);
public sealed record LogoutBody(string? RefreshToken);
public sealed record ChangePasswordBody(string? CurrentPassword, string? NewPassword);
public sealed record AdminSetPasswordBody(EntityId UserId, string? NewPassword);
// @if register
public sealed record RegisterBody(string? Email, string? Password, string? Name);
public sealed record VerifyEmailBody(string? Email, string? Code);
// @endif
// @if register|password-reset
public sealed record SendOtpBody(string? Email, string? Purpose);
// @endif
// @if password-reset
public sealed record ForgotPasswordBody(string? Email);
public sealed record ResetPasswordBody(string? Email, string? Code, string? NewPassword);
// @endif
// @if google
public sealed record GoogleBody(string? IdToken);
// @endif
// @if apple
public sealed record AppleBody(string? IdentityToken, string? AuthorizationCode, string? FullName);
// @endif
// @if google|apple
public sealed record SetPasswordBody(string? NewPassword);
// @endif

public sealed record ClientInfo(string? UserAgent, string? Ip);

/// <summary>Ortamdan okunan süreler ve sınırlar (<c>Jwt__AccessTtlMinutes</c>, <c>Jwt__RefreshTtlDays</c>).</summary>
public sealed record AuthSettings(int AccessTtlMinutes, int RefreshTtlDays);
