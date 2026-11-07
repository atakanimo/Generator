using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using __App__.Application.Common.Abstractions;
using __App__.Application.Common.Errors;
using __App__.Application.Common.Results;
using __App__.Domain.Auth;
using __App__.Domain.Users;

namespace __App__.Application.Auth;

/// <summary>
/// Ortak auth (docs/backend/auth.md): Express ve Python host'larıyla aynı uçlar, kurallar ve cevaplar. Rol ve durum
/// kullanıcının kaydından okunur; refresh token'lar döner (rotation) ve DB'de yalnız hash'leri tutulur.
/// </summary>
public sealed class AuthService(
    IAppDbContext db,
    IPasswordHasher hasher,
    ITokenIssuer tokens,
    AuthSettings settings,
    AuthHooks hooks,
    // @if register|password-reset
    IMailSender mail,
    // @endif
    // @if google|apple
    ISocialTokenVerifier social,
    // @endif
    // @if apple
    IAppleTokenClient apple,
    // @endif
    TimeProvider time)
{
    // @if register|password-reset
    private const int OtpMinutes = 10;
    private const int OtpMaxAttempts = 5;
    private const string OtpVerify = "verify";
    private const string OtpReset = "reset";

    private static readonly string[] OtpPurposes =
    [
        // @if register
        OtpVerify,
        // @endif
        // @if password-reset
        OtpReset,
        // @endif
    ];

    // @endif
    public async Task<Result<AuthSession>> LoginAsync(LoginBody body, ClientInfo client, CancellationToken ct)
    {
        var user = await FindByEmailAsync(body.Email, ct);
        var ok = hasher.Verify(user?.PasswordHash, body.Password ?? string.Empty);
        if (user is null || !ok)
        {
            return AuthErrors.InvalidCredentials();
        }

        if (Blocked(user) is { } blocked)
        {
            return blocked;
        }
        // @if register

        // Admin'in doğrulama yolu yok (admin'e OTP gitmez): yalnız user hesabı bekletilir.
        if (!user.EmailVerified && !IsAdmin(user))
        {
            return AuthErrors.EmailNotVerified();
        }
        // @endif

        user.LastLoginAt = time.GetUtcNow();
        return Result.Ok(await IssueSessionAsync(user, client, null, ct), AuthMessages.LoggedIn);
    }

    /// <summary>Rotation: gelen token tek adımda tüketilir (<c>RevokedAt</c> concurrency token'ı; aynı token'la iki istek → yalnız biri kazanır).</summary>
    public async Task<Result<AuthSession>> RefreshAsync(RefreshBody body, ClientInfo client, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(body.RefreshToken))
        {
            return AuthErrors.InvalidToken();
        }

        var hash = Sha256(body.RefreshToken);
        var now = time.GetUtcNow();
        var token = await db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash && t.RevokedAt == null, ct);
        if (token is null || token.ExpiresAt <= now)
        {
            return AuthErrors.InvalidToken();
        }

        token.RevokedAt = now;
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return AuthErrors.InvalidToken();
        }

        var userId = token.UserId;
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user is null)
        {
            return AuthErrors.InvalidToken();
        }

        if (Blocked(user) is { } blocked)
        {
            return blocked;
        }

        return Result.Ok(await IssueSessionAsync(user, client, null, ct));
    }

    public async Task<Result> LogoutAsync(string? refreshToken, CancellationToken ct)
    {
        if (!string.IsNullOrEmpty(refreshToken))
        {
            var hash = Sha256(refreshToken);
            var token = await db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
            if (token is { RevokedAt: null })
            {
                token.RevokedAt = time.GetUtcNow();
                await SaveRevocationsAsync(ct);
            }
        }

        return Result.Ok(AuthMessages.LoggedOut);
    }

    public async Task<Result<AuthUser>> MeAsync(EntityId? userId, CancellationToken ct)
    {
        var user = await FindByIdAsync(userId, ct);
        return user is null
            ? Result.Fail<AuthUser>(Error.Unauthorized())
            : Result.Ok(ToAuthUser(user) with { Extra = await hooks.OnSessionAsync(user, ct) });
    }

    /// <summary>Şifre değişince bütün refresh token'lar iptal edilir.</summary>
    public async Task<Result> ChangePasswordAsync(EntityId? userId, ChangePasswordBody body, CancellationToken ct)
    {
        var user = await FindByIdAsync(userId, ct);
        if (user is null)
        {
            return Result.Fail(Error.Unauthorized());
        }

        if (!hasher.Verify(user.PasswordHash, body.CurrentPassword ?? string.Empty))
        {
            return Result.Fail(Error.BadRequest(AuthMessages.WrongPassword));
        }

        return await SetPasswordAsync(user, body.NewPassword, ct);
    }

    /// <summary>Admin bir kullanıcının şifresini belirler (admin CRUD şifre almaz; <c>passwordHash</c> gizli).</summary>
    public async Task<Result> AdminSetPasswordAsync(AdminSetPasswordBody body, CancellationToken ct)
    {
        var user = await FindByIdAsync(body.UserId, ct);
        return user is null ? Result.Fail(Error.NotFound()) : await SetPasswordAsync(user, body.NewPassword, ct);
    }
    // @if register

    public async Task<Result> RegisterAsync(RegisterBody body, CancellationToken ct)
    {
        var email = NormalizeEmail(body.Email);
        if (email is null)
        {
            return Result.Fail(Error.BadRequest(AuthMessages.InvalidEmail));
        }

        if (PasswordPolicy.Check(body.Password) is { } policy)
        {
            return Result.Fail(Error.BadRequest(policy));
        }

        var name = body.Name?.Trim();
        if (string.IsNullOrEmpty(name))
        {
            return Result.Fail(Error.BadRequest(AuthMessages.NameRequired));
        }

        var existing = await db.Users.FirstOrDefaultAsync(u => u.Email == email, ct);
        if (existing is not null)
        {
            // Yeni hesapla aynı cevap (e-posta açığa çıkmaz). Doğrulanmamış hesap kodu doğrulayanındır: son kaydın şifresi geçer.
            if (!existing.EmailVerified && existing.Provider == UserProvider.Password && !IsAdmin(existing))
            {
                existing.PasswordHash = hasher.Hash(body.Password!);
                existing.Name = name;
                await SendOtpAsync(existing, OtpVerify, ct);
            }

            return Result.Ok(AuthMessages.OtpSent);
        }

        var user = new User
        {
            Email = email,
            Name = name,
            PasswordHash = hasher.Hash(body.Password!),
            Role = UserRole.User,
            Status = UserStatus.Active,
            EmailVerified = false,
            Provider = UserProvider.Password,
        };
        await hooks.OnRegisterAsync(user, ct);
        db.Users.Add(user);
        await db.SaveChangesAsync(ct);
        await SendOtpAsync(user, OtpVerify, ct);
        return Result.Ok(AuthMessages.OtpSent);
    }

    public async Task<Result<AuthSession>> VerifyEmailAsync(VerifyEmailBody body, ClientInfo client, CancellationToken ct)
    {
        var user = await FindByEmailAsync(body.Email, ct);
        if (user is null || IsAdmin(user) || !await ConsumeOtpAsync(user, OtpVerify, body.Code, ct))
        {
            return Error.BadRequest(AuthMessages.InvalidCode);
        }

        if (Blocked(user) is { } blocked)
        {
            return blocked;
        }

        user.EmailVerified = true;
        user.LastLoginAt = time.GetUtcNow();
        return Result.Ok(await IssueSessionAsync(user, client, true, ct), AuthMessages.EmailVerified);
    }
    // @endif
    // @if register|password-reset

    /// <summary>Kodu yeniden gönderir; kullanıcı yoksa da aynı cevap.</summary>
    public async Task<Result> SendOtpAsync(SendOtpBody body, CancellationToken ct)
    {
        if (body.Purpose is null || !OtpPurposes.Contains(body.Purpose))
        {
            return Result.Fail(Error.BadRequest(string.Format(CultureInfo.CurrentCulture, Messages.InvalidValue, "purpose")));
        }

        var user = await FindByEmailAsync(body.Email, ct);
        if (user is { Status: UserStatus.Active } && !IsAdmin(user) && (body.Purpose == OtpReset || !user.EmailVerified))
        {
            await SendOtpAsync(user, body.Purpose, ct);
        }

        return Result.Ok(AuthMessages.OtpSent);
    }
    // @endif
    // @if password-reset

    public async Task<Result> ForgotPasswordAsync(ForgotPasswordBody body, CancellationToken ct)
    {
        var user = await FindByEmailAsync(body.Email, ct);
        if (user is { Status: UserStatus.Active } && !IsAdmin(user))
        {
            await SendOtpAsync(user, OtpReset, ct);
        }

        return Result.Ok(AuthMessages.OtpSent);
    }

    /// <summary>Kod doğruysa yeni şifre yazılır, e-posta doğrulanmış sayılır, bütün oturumlar kapanır.</summary>
    public async Task<Result> ResetPasswordAsync(ResetPasswordBody body, CancellationToken ct)
    {
        if (PasswordPolicy.Check(body.NewPassword) is { } policy)
        {
            return Result.Fail(Error.BadRequest(policy));
        }

        var user = await FindByEmailAsync(body.Email, ct);
        if (user is null || IsAdmin(user) || !await ConsumeOtpAsync(user, OtpReset, body.Code, ct))
        {
            return Result.Fail(Error.BadRequest(AuthMessages.InvalidCode));
        }

        user.EmailVerified = true;
        return await SetPasswordAsync(user, body.NewPassword, ct);
    }
    // @endif
    // @if google

    public async Task<Result<AuthSession>> LoginWithGoogleAsync(GoogleBody body, ClientInfo client, CancellationToken ct) =>
        await SocialLoginAsync(UserProvider.Google, await social.VerifyGoogleAsync(body.IdToken, ct), client, null, ct);
    // @endif
    // @if apple

    /// <summary><c>authorizationCode</c> geldiyse Apple refresh token'ı alınır (hesap silinince iptal için; docs/backend/auth.md).</summary>
    public async Task<Result<AuthSession>> LoginWithAppleAsync(AppleBody body, ClientInfo client, CancellationToken ct)
    {
        var identity = await social.VerifyAppleAsync(body.IdentityToken, ct);
        var appleRefreshToken = identity is not null && !string.IsNullOrWhiteSpace(body.AuthorizationCode)
            ? await apple.ExchangeAsync(body.AuthorizationCode, identity, ct)
            : null;
        return await SocialLoginAsync(UserProvider.Apple, identity, client, body.FullName, ct, appleRefreshToken);
    }
    // @endif
    // @if account-delete

    /// <summary>Admin kendi hesabını silemez (başka bir admin panelden siler); <c>OnAccountDeleteAsync</c> host'a özel veriyi temizler.</summary>
    public async Task<Result> DeleteAccountAsync(EntityId? userId, CancellationToken ct)
    {
        var user = await FindByIdAsync(userId, ct);
        if (user is null)
        {
            return Result.Fail(Error.Unauthorized());
        }

        if (IsAdmin(user))
        {
            return Result.Fail(AuthErrors.AdminNotAllowed());
        }

        var id = user.Id;
        await hooks.OnAccountDeleteAsync(user, ct);
        db.RefreshTokens.RemoveRange(await db.RefreshTokens.Where(t => t.UserId == id).ToListAsync(ct));
        // @if register|password-reset
        db.OtpCodes.RemoveRange(await db.OtpCodes.Where(o => o.UserId == id).ToListAsync(ct));
        // @endif
        db.Users.Remove(user);
        await db.SaveChangesAsync(ct);
        // @if apple
        // App Store şartı: Apple ile açılan hesabın token'ı Apple'da da iptal edilir (başarısızlık log'a; silme geri alınmaz).
        if (!string.IsNullOrEmpty(user.AppleRefreshToken))
        {
            await apple.RevokeAsync(user.AppleRefreshToken, CancellationToken.None);
        }
        // @endif
        return Result.Ok(AuthMessages.AccountDeleted);
    }
    // @endif

    public static AuthUser ToAuthUser(User user) => new(
        user.Id,
        user.Email,
        user.Name,
        user.Role == UserRole.Admin ? "admin" : "user",
        user.Provider.ToString().ToLowerInvariant(),
        user.EmailVerified,
        !string.IsNullOrEmpty(user.PasswordHash));

    /// <summary>
    /// Admin yalnız e-posta + şifreyle girer (docs/backend/auth.md "Admin ve kullanıcı"): kayıt, sıfırlama, sosyal giriş,
    /// şifre oluşturma ve hesap silme user hesapları içindir.
    /// </summary>
    private static bool IsAdmin(User user) => user.Role == UserRole.Admin;

    private static Error? Blocked(User user) => user.Status == UserStatus.Suspended ? AuthErrors.Suspended() : null;

    private static string? NormalizeEmail(string? email)
    {
        var value = email?.Trim().ToLowerInvariant();
        return string.IsNullOrEmpty(value) || value.Length > 254 || value.IndexOf('@', StringComparison.Ordinal) <= 0 ? null : value;
    }

    private static string Sha256(string value) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    private async Task<User?> FindByEmailAsync(string? email, CancellationToken ct)
    {
        var normalized = NormalizeEmail(email);
        return normalized is null ? null : await db.Users.FirstOrDefaultAsync(u => u.Email == normalized, ct);
    }

    private async Task<User?> FindByIdAsync(EntityId? userId, CancellationToken ct)
    {
        if (userId is not { } id)
        {
            return null;
        }

        return await db.Users.FirstOrDefaultAsync(u => u.Id == id, ct);
    }

    private async Task<Result> SetPasswordAsync(User user, string? password, CancellationToken ct)
    {
        if (PasswordPolicy.Check(password) is { } policy)
        {
            return Result.Fail(Error.BadRequest(policy));
        }

        user.PasswordHash = hasher.Hash(password!);
        await db.SaveChangesAsync(ct);
        await RevokeAllAsync(user.Id, ct);
        return Result.Ok(AuthMessages.PasswordChanged);
    }

    private async Task RevokeAllAsync(EntityId userId, CancellationToken ct)
    {
        var now = time.GetUtcNow();
        foreach (var token in await db.RefreshTokens.Where(t => t.UserId == userId && t.RevokedAt == null).ToListAsync(ct))
        {
            token.RevokedAt = now;
        }

        await SaveRevocationsAsync(ct);
    }

    /// <summary>A token a parallel <c>/refresh</c> revoked first (<c>RevokedAt</c> concurrency token) is already dead: not an error.</summary>
    private async Task SaveRevocationsAsync(CancellationToken ct)
    {
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
        }
    }

    /// <summary>Yeni access + refresh token.</summary>
    private async Task<AuthSession> IssueSessionAsync(User user, ClientInfo client, bool? isNewUser, CancellationToken ct)
    {
        var refreshToken = Base64Url(RandomNumberGenerator.GetBytes(32));
        var now = time.GetUtcNow();
        var next = new RefreshToken
        {
            UserId = user.Id,
            TokenHash = Sha256(refreshToken),
            ExpiresAt = now.AddDays(settings.RefreshTtlDays),
            UserAgent = client.UserAgent is { Length: > 300 } agent ? agent[..300] : client.UserAgent,
            Ip = client.Ip,
        };
        db.RefreshTokens.Add(next);
        await db.SaveChangesAsync(ct);
        var extra = await hooks.OnSessionAsync(user, ct);
        return new AuthSession(tokens.IssueAccessToken(user), refreshToken, settings.AccessTtlMinutes * 60, ToAuthUser(user), isNewUser) { Extra = extra };
    }

    private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    // @if register|password-reset

    /// <summary>Aynı amaçla açık kalan kodlar kapanır; yeni kod hash'lenip yazılır ve e-postayla gider.</summary>
    private async Task SendOtpAsync(User user, string purpose, CancellationToken ct)
    {
        var now = time.GetUtcNow();
        var userId = user.Id;
        foreach (var open in await db.OtpCodes.Where(o => o.UserId == userId && o.Purpose == purpose && o.ConsumedAt == null).ToListAsync(ct))
        {
            open.ConsumedAt = now;
        }

        var code = RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6", CultureInfo.InvariantCulture);
        db.OtpCodes.Add(new OtpCode { UserId = userId, Purpose = purpose, CodeHash = Sha256(code), ExpiresAt = now.AddMinutes(OtpMinutes) });
        await db.SaveChangesAsync(ct);
        var subject = purpose == OtpReset ? AuthMessages.ResetSubject : AuthMessages.VerifySubject;
        await mail.SendAsync(user.Email, subject, string.Format(CultureInfo.CurrentCulture, AuthMessages.CodeText, code, OtpMinutes), ct);
    }

    /// <summary>Son açık kod: süresi geçmişse ya da 5 yanlış denemeden sonra kabul edilmez.</summary>
    private async Task<bool> ConsumeOtpAsync(User user, string purpose, string? code, CancellationToken ct)
    {
        var userId = user.Id;
        var otp = await db.OtpCodes
            .Where(o => o.UserId == userId && o.Purpose == purpose && o.ConsumedAt == null)
            .OrderByDescending(o => o.CreatedAt)
            .FirstOrDefaultAsync(ct);
        if (otp is null || otp.ExpiresAt <= time.GetUtcNow() || otp.Attempts >= OtpMaxAttempts || string.IsNullOrEmpty(code))
        {
            return false;
        }

        if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(otp.CodeHash), Encoding.UTF8.GetBytes(Sha256(code))))
        {
            otp.Attempts++;
            await db.SaveChangesAsync(ct);
            return false;
        }

        otp.ConsumedAt = time.GetUtcNow();
        return true;
    }
    // @endif
    // @if google|apple

    /// <summary>
    /// Sağlayıcı kimliği kullanıcıyı bulur; yoksa doğrulanmış e-posta var olan hesaba bağlanır; yoksa yeni <c>user</c>
    /// açılır (<c>isNewUser: true</c>).
    /// </summary>
    private async Task<Result<AuthSession>> SocialLoginAsync(
        UserProvider provider,
        SocialIdentity? identity,
        ClientInfo client,
        string? fallbackName,
        CancellationToken ct,
        string? appleRefreshToken = null)
    {
        if (identity is null)
        {
            return AuthErrors.InvalidToken();
        }

        var subject = identity.Subject;
        var user = await db.Users.FirstOrDefaultAsync(u => u.Provider == provider && u.ProviderUserId == subject, ct);
        var isNewUser = false;
        var email = NormalizeEmail(identity.Email);
        if (user is null && email is not null)
        {
            user = await db.Users.FirstOrDefaultAsync(u => u.Email == email, ct);
            if (user is not null && IsAdmin(user))
            {
                return AuthErrors.AdminPasswordOnly();
            }

            // Sağlayıcının doğrulamadığı adres var olan hesabı alamaz.
            if (user is not null && !identity.EmailVerified)
            {
                return Error.BadRequest(AuthMessages.EmailInUse);
            }

            // Sağlayıcı adresi doğruladı: doğrulanmamış kaydı açanın şifresi artık çalışmaz.
            if (user is { EmailVerified: false })
            {
                user.PasswordHash = null;
            }
        }

        if (user is null)
        {
            if (email is null)
            {
                return Error.BadRequest(AuthMessages.EmailRequired);
            }

            user = new User
            {
                Email = email,
                Name = identity.Name ?? fallbackName ?? email.Split('@')[0],
                Role = UserRole.User,
                Status = UserStatus.Active,
                EmailVerified = identity.EmailVerified,
                Provider = provider,
                ProviderUserId = subject,
            };
            await hooks.OnRegisterAsync(user, ct);
            db.Users.Add(user);
            isNewUser = true;
        }

        if (IsAdmin(user))
        {
            return AuthErrors.AdminPasswordOnly();
        }

        if (Blocked(user) is { } blocked)
        {
            return blocked;
        }

        if (identity.EmailVerified)
        {
            user.EmailVerified = true;
        }

        // @if apple
        if (appleRefreshToken is not null)
        {
            user.AppleRefreshToken = appleRefreshToken;
        }

        // @endif
        user.LastLoginAt = time.GetUtcNow();
        return Result.Ok(await IssueSessionAsync(user, client, isNewUser, ct), AuthMessages.LoggedIn);
    }

    /// <summary>Google / Apple hesabı ilk şifresini oluşturur (sonrası change-password). Diğer oturumlar kalır.</summary>
    public async Task<Result> CreatePasswordAsync(EntityId? userId, SetPasswordBody body, CancellationToken ct)
    {
        var user = await FindByIdAsync(userId, ct);
        if (user is null)
        {
            return Result.Fail(Error.Unauthorized());
        }

        if (IsAdmin(user))
        {
            return Result.Fail(AuthErrors.AdminNotAllowed());
        }

        if (!string.IsNullOrEmpty(user.PasswordHash))
        {
            return Result.Fail(Error.BadRequest(AuthMessages.PasswordAlreadySet));
        }

        if (PasswordPolicy.Check(body.NewPassword) is { } policy)
        {
            return Result.Fail(Error.BadRequest(policy));
        }

        user.PasswordHash = hasher.Hash(body.NewPassword!);
        await db.SaveChangesAsync(ct);
        return Result.Ok(AuthMessages.PasswordCreated);
    }
    // @endif
}
