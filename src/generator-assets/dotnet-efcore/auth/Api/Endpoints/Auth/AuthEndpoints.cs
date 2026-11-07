using __App__.Api.Auth;
using __App__.Api.Common;
using __App__.Application.Auth;
using __App__.Application.Common.Abstractions;

namespace __App__.Api.Endpoints.Auth;

/// <summary>Auth uçları (docs/backend/auth.md "Sözleşme"): <c>/api/auth</c>. Generator bu dosyayı bir kez yazar.</summary>
public static class AuthEndpoints
{
    public static RouteGroupBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth").WithTags("Auth");

        group.MapPost("/login", async (LoginBody body, HttpContext http, AuthService service, CancellationToken ct) =>
            (await service.LoginAsync(body, Client(http), ct)).ToHttp()).AllowAnonymous().RequireRateLimiting(AuthApiSetup.RateLimitPolicy);
        group.MapPost("/refresh", async (RefreshBody body, HttpContext http, AuthService service, CancellationToken ct) =>
            (await service.RefreshAsync(body, Client(http), ct)).ToHttp()).AllowAnonymous();
        group.MapPost("/logout", async (LogoutBody? body, AuthService service, CancellationToken ct) =>
            (await service.LogoutAsync(body?.RefreshToken, ct)).ToHttp()).AllowAnonymous();
        group.MapGet("/me", async (ICurrentUser user, AuthService service, CancellationToken ct) =>
            (await service.MeAsync(user.Id, ct)).ToHttp()).RequireAuthorization();
        group.MapPost("/change-password", async (ChangePasswordBody body, ICurrentUser user, AuthService service, CancellationToken ct) =>
            (await service.ChangePasswordAsync(user.Id, body, ct)).ToHttp()).RequireAuthorization();
        group.MapPost("/admin/set-password", async (AdminSetPasswordBody body, AuthService service, CancellationToken ct) =>
            (await service.AdminSetPasswordAsync(body, ct)).ToHttp()).RequireAuthorization(AuthSetup.AdminPolicy);
        // @if register
        group.MapPost("/register", async (RegisterBody body, AuthService service, CancellationToken ct) =>
            (await service.RegisterAsync(body, ct)).ToHttp()).AllowAnonymous().RequireRateLimiting(AuthApiSetup.RateLimitPolicy);
        group.MapPost("/verify-email", async (VerifyEmailBody body, HttpContext http, AuthService service, CancellationToken ct) =>
            (await service.VerifyEmailAsync(body, Client(http), ct)).ToHttp()).AllowAnonymous().RequireRateLimiting(AuthApiSetup.RateLimitPolicy);
        // @endif
        // @if register|password-reset
        group.MapPost("/send-otp", async (SendOtpBody body, AuthService service, CancellationToken ct) =>
            (await service.SendOtpAsync(body, ct)).ToHttp()).AllowAnonymous().RequireRateLimiting(AuthApiSetup.RateLimitPolicy);
        // @endif
        // @if password-reset
        group.MapPost("/forgot-password", async (ForgotPasswordBody body, AuthService service, CancellationToken ct) =>
            (await service.ForgotPasswordAsync(body, ct)).ToHttp()).AllowAnonymous().RequireRateLimiting(AuthApiSetup.RateLimitPolicy);
        group.MapPost("/reset-password", async (ResetPasswordBody body, AuthService service, CancellationToken ct) =>
            (await service.ResetPasswordAsync(body, ct)).ToHttp()).AllowAnonymous().RequireRateLimiting(AuthApiSetup.RateLimitPolicy);
        // @endif
        // @if google
        group.MapPost("/google", async (GoogleBody body, HttpContext http, AuthService service, CancellationToken ct) =>
            (await service.LoginWithGoogleAsync(body, Client(http), ct)).ToHttp()).AllowAnonymous().RequireRateLimiting(AuthApiSetup.RateLimitPolicy);
        // @endif
        // @if apple
        group.MapPost("/apple", async (AppleBody body, HttpContext http, AuthService service, CancellationToken ct) =>
            (await service.LoginWithAppleAsync(body, Client(http), ct)).ToHttp()).AllowAnonymous().RequireRateLimiting(AuthApiSetup.RateLimitPolicy);
        // @endif
        // @if google|apple
        group.MapPost("/set-password", async (SetPasswordBody body, ICurrentUser user, AuthService service, CancellationToken ct) =>
            (await service.CreatePasswordAsync(user.Id, body, ct)).ToHttp()).RequireAuthorization().RequireRateLimiting(AuthApiSetup.RateLimitPolicy);
        // @endif
        // @if account-delete
        group.MapDelete("/account", async (ICurrentUser user, AuthService service, CancellationToken ct) =>
            (await service.DeleteAccountAsync(user.Id, ct)).ToHttp()).RequireAuthorization();
        // @endif
        return group;
    }

    private static ClientInfo Client(HttpContext http) =>
        new(http.Request.Headers.UserAgent.ToString(), http.Connection.RemoteIpAddress?.ToString());
}
