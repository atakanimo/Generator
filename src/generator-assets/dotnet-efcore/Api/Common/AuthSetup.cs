using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using __App__.Application.Common.Errors;
using __App__.Infrastructure.Common;

namespace __App__.Api.Common;

public static class AuthSetup
{
    public const string AdminPolicy = "Admin";

    /// <summary>JWT ayarları yalnızca ortamdan: <c>Jwt__Secret</c>, <c>Jwt__Issuer</c>, <c>Jwt__Audience</c>.</summary>
    public static IServiceCollection AddContractAuth(this IServiceCollection services, IConfiguration configuration)
    {
        var secret = configuration["Jwt:Secret"];
        if (string.IsNullOrEmpty(secret) || secret.Length < 32)
        {
            throw new InvalidOperationException("Jwt__Secret is not set (min 32 chars).");
        }

        services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
        {
            options.MapInboundClaims = true;
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidIssuer = configuration["Jwt:Issuer"],
                ValidAudience = configuration["Jwt:Audience"],
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret)),
            };
            options.Events = new JwtBearerEvents
            {
                OnChallenge = context =>
                {
                    context.HandleResponse();
                    return context.HttpContext.WriteEnvelopeAsync(Error.Unauthorized());
                },
                OnForbidden = context => context.HttpContext.WriteEnvelopeAsync(Error.Forbidden()),
            };
        });
        services.AddAuthorizationBuilder()
            .AddPolicy(AdminPolicy, policy => policy.RequireRole(CurrentUser.AdminRole));
        return services;
    }
}
