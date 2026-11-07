using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using __App__.Api.Common;
using __App__.Application.Auth;
using __App__.Application.Common.Abstractions;
using __App__.Domain.Common;
using __App__.Domain.Users;
using __App__.Infrastructure.Auth;
using __App__.Infrastructure.Common;

namespace __App__.Api.Auth;

public static class AuthApiSetup
{
    /// <summary>Login / kayıt / kod / şifre sıfırlama: IP + uç başına dakikada <c>Auth__RateLimitPerMinute</c> (varsayılan 10).</summary>
    public const string RateLimitPolicy = "auth";

    private const string SuspendedKey = "auth.suspended";

    public static IServiceCollection AddAuthModule(this IServiceCollection services, IConfiguration configuration)
    {
        var settings = new AuthSettings(
            configuration.GetValue("Jwt:AccessTtlMinutes", 15),
            configuration.GetValue("Jwt:RefreshTtlDays", 30),
            configuration.GetValue("Auth:RateLimitPerMinute", 10));
        services.AddSingleton(settings);
        services.AddSingleton<ITokenIssuer, JwtTokenIssuer>();
        // @if google|apple
        services.AddSingleton<ISocialTokenVerifier, SocialTokenVerifier>();
        // @endif
        // @if apple
        services.AddHttpClient(nameof(AppleTokenClient), client => client.Timeout = TimeSpan.FromSeconds(10));
        services.AddSingleton<IAppleTokenClient, AppleTokenClient>();
        // @endif
        services.AddScoped<AuthHooks>();
        services.AddScoped<AuthService>();
        services.AddAuthInfrastructure();

        // Token geçerliyse kullanıcı kayıttan okunur: yoksa 401, askıdaysa 403, rol kayıttaki (token'daki değil).
        services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
        {
            var events = options.Events ?? new JwtBearerEvents();
            var validated = events.OnTokenValidated;
            var challenge = events.OnChallenge;
            events.OnTokenValidated = async context =>
            {
                await validated(context);
                if (context.Result is not { Failure: not null })
                {
                    await ApplyUserAsync(context);
                }
            };
            events.OnChallenge = context =>
            {
                if (!context.HttpContext.Items.ContainsKey(SuspendedKey))
                {
                    return challenge(context);
                }

                context.HandleResponse();
                return context.HttpContext.WriteEnvelopeAsync(AuthErrors.Suspended());
            };
            options.Events = events;
        });

        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.OnRejected = (context, _) => new ValueTask(context.HttpContext.WriteEnvelopeAsync(AuthErrors.TooManyRequests()));
            options.AddPolicy(RateLimitPolicy, http => RateLimitPartition.GetFixedWindowLimiter(
                $"{http.Connection.RemoteIpAddress}|{http.Request.Path}",
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = settings.RateLimitPerMinute,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                }));
        });
        return services;
    }

    private static async Task ApplyUserAsync(TokenValidatedContext context)
    {
        if (context.Principal?.Identity is not ClaimsIdentity identity
            || !EntityIds.TryParse(context.Principal.FindFirstValue(ClaimTypes.NameIdentifier), out var id))
        {
            context.Fail("invalid subject");
            return;
        }

        var db = context.HttpContext.RequestServices.GetRequiredService<IAppDbContext>();
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == id, context.HttpContext.RequestAborted);
        if (user is null)
        {
            context.Fail("unknown user");
            return;
        }

        if (user.Status == UserStatus.Suspended)
        {
            context.HttpContext.Items[SuspendedKey] = true;
            context.Fail("suspended");
            return;
        }

        foreach (var claim in identity.FindAll(identity.RoleClaimType).ToList())
        {
            identity.RemoveClaim(claim);
        }

        identity.AddClaim(new Claim(identity.RoleClaimType, user.Role == UserRole.Admin ? CurrentUser.AdminRole : "user"));
    }
}
