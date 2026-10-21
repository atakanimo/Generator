using Microsoft.Extensions.DependencyInjection;

namespace __App__.Application;

public static partial class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        AddGenerated(services);
        return services;
    }

    static partial void AddGenerated(IServiceCollection services);
}
