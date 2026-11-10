using System.Text.Json;
using FluentValidation;
using __App__.Application.Common.Errors;

namespace __App__.Api.Common;

/// <summary>FluentValidation → 400 zarf (ilk hata mesajı).</summary>
public sealed class ValidationFilter<T>(IValidator<T> validator) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        if (context.Arguments.OfType<T>().FirstOrDefault() is { } body)
        {
            var result = await validator.ValidateAsync(body, context.HttpContext.RequestAborted);
            if (!result.IsValid)
            {
                var first = result.Errors[0];
                return ResultExtensions.Fail<object>(Error.BadRequest(first.ErrorMessage, JsonPath(first.PropertyName)));
            }
        }

        return await next(context);
    }

    private static string? JsonPath(string? propertyName) =>
        string.IsNullOrEmpty(propertyName)
            ? null
            : string.Join('.', propertyName.Split('.').Select(JsonNamingPolicy.CamelCase.ConvertName));
}
