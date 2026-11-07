using Microsoft.Extensions.DependencyInjection;
using __App__.Application.Auth;

namespace __App__.Infrastructure.Auth;

public static class AuthInfrastructure
{
    public static IServiceCollection AddAuthInfrastructure(this IServiceCollection services)
    {
        services.AddSingleton<IPasswordHasher, BcryptPasswordHasher>();
        // @if register|password-reset
        services.AddSingleton<IMailSender, MailSender>();
        // @endif
        return services;
    }
}
