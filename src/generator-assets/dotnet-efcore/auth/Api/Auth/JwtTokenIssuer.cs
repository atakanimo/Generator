using System.Text;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using __App__.Application.Auth;
using __App__.Domain.Users;
using __App__.Infrastructure.Common;

namespace __App__.Api.Auth;

/// <summary>
/// Access token (HS256, <c>Jwt__AccessTtlMinutes</c>, varsayılan 15 dk): <c>sub</c>, <c>role</c>, <c>jti</c>,
/// <c>iat</c>, <c>exp</c>, ayarlıysa <c>iss</c> / <c>aud</c>. <c>role</c> yalnız bilgi: yetki her istekte kayıttan okunur.
/// </summary>
public sealed class JwtTokenIssuer(IConfiguration configuration, AuthSettings settings, TimeProvider time) : ITokenIssuer
{
    private readonly JsonWebTokenHandler handler = new();

    public string IssueAccessToken(User user)
    {
        var now = time.GetUtcNow().UtcDateTime;
        return handler.CreateToken(new SecurityTokenDescriptor
        {
            Claims = new Dictionary<string, object>
            {
                [JwtRegisteredClaimNames.Sub] = user.Id.ToString(),
                ["role"] = user.Role == UserRole.Admin ? CurrentUser.AdminRole : "user",
                [JwtRegisteredClaimNames.Jti] = Guid.NewGuid().ToString("N"),
            },
            Issuer = NullIfEmpty(configuration["Jwt:Issuer"]),
            Audience = NullIfEmpty(configuration["Jwt:Audience"]),
            IssuedAt = now,
            NotBefore = now,
            Expires = now.AddMinutes(settings.AccessTtlMinutes),
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(configuration["Jwt:Secret"]!)),
                SecurityAlgorithms.HmacSha256),
        });
    }

    private static string? NullIfEmpty(string? value) => string.IsNullOrWhiteSpace(value) ? null : value;
}
