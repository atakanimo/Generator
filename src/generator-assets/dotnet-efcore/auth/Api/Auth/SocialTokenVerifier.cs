// @auth-file google|apple
using System.Globalization;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using __App__.Application.Auth;

namespace __App__.Api.Auth;

/// <summary>
/// Google / Apple kimlik token'ı: sağlayıcının OIDC anahtarlarıyla (JWKS) imza, issuer, audience ve süre doğrulanır.
/// İstemci kimlikleri (virgüllü) <c>Auth__GoogleClientIds</c> / <c>Auth__AppleClientIds</c>; boşsa giriş reddedilir.
/// </summary>
public sealed class SocialTokenVerifier(IConfiguration configuration, ILogger<SocialTokenVerifier> logger) : ISocialTokenVerifier
{
    // @if google
    private static readonly ConfigurationManager<OpenIdConnectConfiguration> GoogleKeys = new(
        "https://accounts.google.com/.well-known/openid-configuration",
        new OpenIdConnectConfigurationRetriever(),
        new HttpDocumentRetriever());

    public Task<SocialIdentity?> VerifyGoogleAsync(string? idToken, CancellationToken cancellationToken) =>
        VerifyAsync(GoogleKeys, idToken, ["https://accounts.google.com", "accounts.google.com"], "Auth:GoogleClientIds", cancellationToken);
    // @endif
    // @if apple

    private static readonly ConfigurationManager<OpenIdConnectConfiguration> AppleKeys = new(
        "https://appleid.apple.com/.well-known/openid-configuration",
        new OpenIdConnectConfigurationRetriever(),
        new HttpDocumentRetriever());

    public Task<SocialIdentity?> VerifyAppleAsync(string? identityToken, CancellationToken cancellationToken) =>
        VerifyAsync(AppleKeys, identityToken, ["https://appleid.apple.com"], "Auth:AppleClientIds", cancellationToken);
    // @endif

    private async Task<SocialIdentity?> VerifyAsync(
        ConfigurationManager<OpenIdConnectConfiguration> keys,
        string? token,
        string[] issuers,
        string clientIdsKey,
        CancellationToken cancellationToken)
    {
        var audiences = (configuration[clientIdsKey] ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (audiences.Length == 0)
        {
            logger.LogError("{Key} is not set: social sign-in is refused.", clientIdsKey.Replace(":", "__", StringComparison.Ordinal));
            return null;
        }

        if (string.IsNullOrWhiteSpace(token))
        {
            return null;
        }

        try
        {
            var config = await keys.GetConfigurationAsync(cancellationToken);
            var result = await new JsonWebTokenHandler().ValidateTokenAsync(token, new TokenValidationParameters
            {
                ValidIssuers = issuers,
                ValidAudiences = audiences,
                IssuerSigningKeys = config.SigningKeys,
                ValidateLifetime = true,
            });
            if (!result.IsValid)
            {
                logger.LogInformation("Invalid social identity token: {Message}", result.Exception?.Message);
                return null;
            }

            string? Claim(string name) => result.Claims.TryGetValue(name, out var value) ? Convert.ToString(value, CultureInfo.InvariantCulture) : null;
            var subject = Claim("sub");
            if (string.IsNullOrEmpty(subject))
            {
                return null;
            }

            var verified = string.Equals(Claim("email_verified"), "true", StringComparison.OrdinalIgnoreCase);
            var audience = (result.SecurityToken as JsonWebToken)?.Audiences.FirstOrDefault();
            return new SocialIdentity(subject, Claim("email"), verified, Claim("name"), audience);
        }
        catch (Exception ex) when (ex is InvalidOperationException or HttpRequestException or IOException or SecurityTokenException)
        {
            // Anahtarlara ulaşılamadı: 500 yerine 401 (istemci tekrar dener).
            logger.LogWarning(ex, "Social sign-in keys could not be loaded.");
            return null;
        }
    }
}
