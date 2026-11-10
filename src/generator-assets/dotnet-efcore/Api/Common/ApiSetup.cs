using __App__.Application.Common.Errors;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Localization;

namespace __App__.Api.Common;

public static partial class ApiSetup
{
    public static IServiceCollection AddApi(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddContractJson();
        services.AddContractAuth(configuration);
        services.AddExceptionHandler<ContractExceptionHandler>();
        services.Configure<RouteOptions>(options => options.SetParameterPolicy<EntityIdRouteConstraint>(EntityIdRouteConstraint.Name));
        services.AddOpenApi();

        var cultures = configuration.GetSection("Localization:Cultures").Get<string[]>();
        if (cultures is not { Length: > 0 })
        {
            throw new InvalidOperationException("Localization:Cultures (appsettings) en az bir dil içermeli; ilki varsayılan dildir.");
        }

        services.Configure<RequestLocalizationOptions>(options =>
        {
            options.SetDefaultCulture(cultures[0]).AddSupportedCultures(cultures).AddSupportedUICultures(cultures);
            options.ApplyCurrentCultureToResponseHeaders = true;
            options.RequestCultureProviders = [new AcceptLanguageHeaderRequestCultureProvider()];
        });

        var trustedProxies = (configuration["TRUSTED_PROXY_CIDRS"] ?? "127.0.0.1/32,::1/128")
            .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            options.KnownIPNetworks.Clear();
            options.KnownProxies.Clear();
            foreach (var cidr in trustedProxies)
            {
                options.KnownIPNetworks.Add(System.Net.IPNetwork.Parse(cidr));
            }
        });

        var origins = configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];
        services.AddCors(options => options.AddDefaultPolicy(policy =>
        {
            policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod().WithExposedHeaders("Content-Disposition", "Retry-After");
            ConfigureCustomCors(policy);
        }));

        services.AddRateLimits(configuration);
        AddCustomServices(services, configuration);
        return services;
    }

    public static WebApplication UseApi(this WebApplication app)
    {
        app.UseForwardedHeaders();

        // İstek dili yalnız Accept-Language (api-contract K6); desteklenmeyen → varsayılan. Önce dil: exception handler ve
        // status code sayfaları da istek dilinde yazar.
        app.UseRequestLocalization();
        app.UseMiddleware<TraceIdMiddleware>();
        app.UseExceptionHandler(_ => { });
        app.UseStatusCodePages(context => context.HttpContext.Response.StatusCode switch
        {
            StatusCodes.Status404NotFound => context.HttpContext.WriteContractAsync(
                new Error(StatusCodes.Status404NotFound, Messages.NotFoundHeader, Messages.RouteNotFound)),
            var code => context.HttpContext.WriteContractAsync(new Error(code, Messages.BadRequestHeader, Messages.InvalidBody)),
        });
        app.UseCors();
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseRateLimiter();

        if (app.Environment.IsDevelopment())
        {
            app.MapOpenApi();
        }

        return app;
    }

    static partial void AddCustomServices(IServiceCollection services, IConfiguration configuration);

    static partial void ConfigureCustomCors(CorsPolicyBuilder policy);
}
