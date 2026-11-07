using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using __App__.Application.Common.Abstractions;
using __App__.Domain.Users;

namespace __App__.Infrastructure.Auth;

public static class AuthSeeder
{
    /// <summary>
    /// İlk admin (docs/backend/auth.md "İlk admin"): hiç <c>admin</c> yoksa <see cref="InitialAdmin"/> yazılır (aynı
    /// e-postalı kullanıcı varsa admin yapılır). Admin varsa hiçbir şey yapmaz. Veritabanı hazır değilse API yine açılır.
    /// </summary>
    public static async Task SeedAuthAsync(this IServiceProvider services, CancellationToken cancellationToken = default)
    {
        using var scope = services.CreateScope();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Auth");
        try
        {
            var db = scope.ServiceProvider.GetRequiredService<IAppDbContext>();
            if (await db.Users.AnyAsync(u => u.Role == UserRole.Admin, cancellationToken))
            {
                return;
            }

            var email = InitialAdmin.Email;
            var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email, cancellationToken);
            if (user is null)
            {
                db.Users.Add(new User
                {
                    Email = email,
                    Name = InitialAdmin.Name,
                    PasswordHash = InitialAdmin.PasswordHash,
                    Role = UserRole.Admin,
                    Status = UserStatus.Active,
                    EmailVerified = true,
                    Provider = UserProvider.Password,
                });
            }
            else
            {
                user.Role = UserRole.Admin;
                user.Status = UserStatus.Active;
            }

            await db.SaveChangesAsync(cancellationToken);
            logger.LogInformation("auth.seed {Email}", email);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "auth.seed failed: the first admin could not be written (is the database migrated?).");
        }
    }
}
