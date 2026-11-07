// @auth-file apple
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using __App__.Application.Auth;

namespace __App__.Api.Auth;

/// <summary>
/// Apple <c>/auth/token</c> (kod → refresh token) ve <c>/auth/revoke</c>. İstemci sırrı her çağrıda <c>.p8</c> anahtarıyla
/// imzalanan kısa ömürlü bir ES256 JWT'dir (<c>Auth__AppleTeamId</c>, <c>Auth__AppleKeyId</c>, <c>Auth__ApplePrivateKey</c>).
/// </summary>
public sealed class AppleTokenClient(IConfiguration configuration, IHttpClientFactory http, ILogger<AppleTokenClient> logger) : IAppleTokenClient
{
    private const string AppleHost = "https://appleid.apple.com";

    public async Task<string?> ExchangeAsync(string authorizationCode, SocialIdentity identity, CancellationToken cancellationToken)
    {
        var clientId = identity.Audience ?? ClientIds().FirstOrDefault();
        if (clientId is null || ClientSecret(clientId) is not { } secret)
        {
            return null;
        }

        // Giriş, takas başarısız olsa da sürer: refresh token yalnız hesap silmede iptal için gerekir.
        try
        {
            var response = await Post("/auth/token", new()
            {
                ["client_id"] = clientId,
                ["client_secret"] = secret,
                ["code"] = authorizationCode,
                ["grant_type"] = "authorization_code",
            }, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogInformation("Apple token exchange failed: {Status}", (int)response.StatusCode);
                return null;
            }

            var body = await response.Content.ReadFromJsonAsync<TokenBody>(cancellationToken);
            // Kod başka bir Apple hesabınınsa (istemci iki hesabı karıştırdıysa) token saklanmaz.
            var subject = body?.IdToken is { } idToken ? new JsonWebToken(idToken).Subject : null;
            if (subject != identity.Subject)
            {
                logger.LogWarning("Apple token exchange subject mismatch; refresh token discarded.");
                return null;
            }

            return body?.RefreshToken;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException or ArgumentException or SecurityTokenException)
        {
            logger.LogWarning(ex, "Apple token exchange error.");
            return null;
        }
    }

    public async Task<bool> RevokeAsync(string refreshToken, CancellationToken cancellationToken)
    {
        // Token hangi istemci kimliğiyle alındıysa onunla iptal edilir: ayarlı kimlikler sırayla denenir.
        foreach (var clientId in ClientIds())
        {
            if (ClientSecret(clientId) is not { } secret)
            {
                return false;
            }

            try
            {
                var response = await Post("/auth/revoke", new()
                {
                    ["client_id"] = clientId,
                    ["client_secret"] = secret,
                    ["token"] = refreshToken,
                    ["token_type_hint"] = "refresh_token",
                }, cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    return true;
                }
            }
            catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
            {
                logger.LogWarning(ex, "Apple revoke error.");
                return false;
            }
        }

        logger.LogWarning("Apple refresh token could not be revoked.");
        return false;
    }

    private Task<HttpResponseMessage> Post(string path, Dictionary<string, string> form, CancellationToken cancellationToken) =>
        http.CreateClient(nameof(AppleTokenClient)).PostAsync($"{AppleHost}{path}", new FormUrlEncodedContent(form), cancellationToken);

    private string[] ClientIds() =>
        (configuration["Auth:AppleClientIds"] ?? string.Empty).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

    private string? ClientSecret(string clientId)
    {
        var teamId = configuration["Auth:AppleTeamId"];
        var keyId = configuration["Auth:AppleKeyId"];
        // .env'de tek satır: satır sonları `\n` olarak yazılabilir.
        var privateKey = configuration["Auth:ApplePrivateKey"]?.Replace("\\n", "\n", StringComparison.Ordinal);
        if (string.IsNullOrWhiteSpace(teamId) || string.IsNullOrWhiteSpace(keyId) || string.IsNullOrWhiteSpace(privateKey))
        {
            logger.LogWarning("Auth__AppleTeamId / Auth__AppleKeyId / Auth__ApplePrivateKey is not set: Apple token exchange and revoke are skipped.");
            return null;
        }

        var key = ECDsa.Create();
        key.ImportFromPem(privateKey);
        var now = DateTime.UtcNow;
        return new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = teamId,
            Audience = AppleHost,
            Subject = new ClaimsIdentity([new Claim(JwtRegisteredClaimNames.Sub, clientId)]),
            IssuedAt = now,
            NotBefore = now,
            Expires = now.AddMinutes(5),
            SigningCredentials = new SigningCredentials(new ECDsaSecurityKey(key) { KeyId = keyId }, SecurityAlgorithms.EcdsaSha256),
        });
    }

    private sealed record TokenBody(
        [property: JsonPropertyName("refresh_token")] string? RefreshToken,
        [property: JsonPropertyName("id_token")] string? IdToken);
}
