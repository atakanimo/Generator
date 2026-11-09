using __App__.Application.Common.Errors;
using Microsoft.AspNetCore.Localization;

namespace __App__.Api.Common;

public static class ApiSetup
{
    static readonly string[] SupportedCultures = ["en", "tr"];
    const string DefaultCulture = "en";

    public static IServiceCollection AddApi(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddContractJson();
        services.AddContractAuth(configuration);
        services.AddExceptionHandler<ContractExceptionHandler>();
        services.Configure<RouteOptions>(options => options.SetParameterPolicy<EntityIdRouteConstraint>(EntityIdRouteConstraint.Name));
        services.AddOpenApi();

        var origins = configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];
        services.AddCors(options => options.AddDefaultPolicy(policy =>
            policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod()));
        return services;
    }

    public static WebApplication UseApi(this WebApplication app)
    {
        // İstek dili yalnız Accept-Language (api-contract K6); desteklenmeyen → varsayılan. Önce dil: exception handler ve
        // status code sayfaları da istek dilinde yazar.
        app.UseRequestLocalization(options =>
        {
            options.SetDefaultCulture(DefaultCulture).AddSupportedCultures(SupportedCultures).AddSupportedUICultures(SupportedCultures);
            options.RequestCultureProviders = [new AcceptLanguageHeaderRequestCultureProvider()];
        });
        app.UseMiddleware<TraceIdMiddleware>();
        app.UseExceptionHandler(_ => { });
        app.UseStatusCodePages(context => context.HttpContext.Response.StatusCode switch
        {
            StatusCodes.Status404NotFound => context.HttpContext.WriteContractAsync(Error.NotFound()),
            var code => context.HttpContext.WriteContractAsync(new Error(code, Messages.BadRequestHeader, Messages.InvalidBody)),
        });
        app.UseCors();
        app.UseAuthentication();
        app.UseAuthorization();

        if (app.Environment.IsDevelopment())
        {
            app.MapOpenApi();
        }

        return app;
    }
}
