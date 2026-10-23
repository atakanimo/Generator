using __App__.Application.Common.Errors;

namespace __App__.Api.Common;

public static class ApiSetup
{
    public static IServiceCollection AddApi(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddContractJson();
        services.AddContractAuth(configuration);
        services.AddExceptionHandler<EnvelopeExceptionHandler>();
        services.AddOpenApi();

        var origins = configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];
        services.AddCors(options => options.AddDefaultPolicy(policy =>
            policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod()));
        return services;
    }

    public static WebApplication UseApi(this WebApplication app)
    {
        app.UseMiddleware<TraceIdMiddleware>();
        app.UseExceptionHandler(_ => { });
        app.UseStatusCodePages(context => context.HttpContext.Response.StatusCode switch
        {
            StatusCodes.Status404NotFound => context.HttpContext.WriteEnvelopeAsync(Error.NotFound()),
            var code => context.HttpContext.WriteEnvelopeAsync(new Error(code, Messages.BadRequestHeader, Messages.InvalidBody)),
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
