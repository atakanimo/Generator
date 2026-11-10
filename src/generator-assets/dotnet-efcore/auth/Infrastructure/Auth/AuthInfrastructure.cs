using Microsoft.Extensions.DependencyInjection;
using __App__.Application.Auth;

namespace __App__.Infrastructure.Auth;

public static partial class AuthInfrastructure
{
    public static IServiceCollection AddAuthInfrastructure(this IServiceCollection services)
    {
        services.AddSingleton<IPasswordHasher, BcryptPasswordHasher>();
        // @if register|password-reset
        services.AddSingleton<IMailSender, MailSender>();
        // @endif
        AddCustomAuthServices(services);
        return services;
    }

    static partial void AddCustomAuthServices(IServiceCollection services);
}
