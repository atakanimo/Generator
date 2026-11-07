using __App__.Domain.Users;

namespace __App__.Application.Auth;

/// <summary>bcrypt (cost 12): üç stack'te aynı hash'i yazar ve okur.</summary>
public interface IPasswordHasher
{
    string Hash(string password);

    /// <summary>Hash yoksa da bir karşılaştırma yapar (kullanıcı var / yok süreden anlaşılmasın).</summary>
    bool Verify(string? hash, string password);
}

public interface ITokenIssuer
{
    string IssueAccessToken(User user);
}
// @if register|password-reset

/// <summary><c>Smtp__Host</c> yoksa e-posta log'a yazılır (<c>mail.console …</c>).</summary>
public interface IMailSender
{
    Task SendAsync(string to, string subject, string text, CancellationToken cancellationToken);
}
// @endif
// @if google|apple

/// <summary><c>Audience</c>: token'ın verildiği istemci kimliği (Apple kod takası aynı <c>client_id</c>'yi ister).</summary>
public sealed record SocialIdentity(string Subject, string? Email, bool EmailVerified, string? Name, string? Audience = null);

/// <summary>Sağlayıcının imzalı token'ı (OIDC JWKS); geçersizse ya da istemci kimliği ayarlı değilse <c>null</c>.</summary>
public interface ISocialTokenVerifier
{
    // @if google
    Task<SocialIdentity?> VerifyGoogleAsync(string? idToken, CancellationToken cancellationToken);
    // @endif
    // @if apple
    Task<SocialIdentity?> VerifyAppleAsync(string? identityToken, CancellationToken cancellationToken);
    // @endif
}
// @endif
// @if apple

/// <summary>
/// Apple refresh token'ı (docs/backend/auth.md "Apple token iptali"): girişte <c>authorizationCode</c> ile alınır, hesap
/// silinince iptal edilir (App Store şartı). <c>Auth__AppleTeamId</c> / <c>Auth__AppleKeyId</c> / <c>Auth__ApplePrivateKey</c>
/// yoksa ikisi de sessizce atlanır; giriş etkilenmez.
/// </summary>
public interface IAppleTokenClient
{
    /// <summary>Kod başka bir Apple hesabına aitse ya da takas olmazsa <c>null</c>.</summary>
    Task<string?> ExchangeAsync(string authorizationCode, SocialIdentity identity, CancellationToken cancellationToken);

    Task<bool> RevokeAsync(string refreshToken, CancellationToken cancellationToken);
}
// @endif
