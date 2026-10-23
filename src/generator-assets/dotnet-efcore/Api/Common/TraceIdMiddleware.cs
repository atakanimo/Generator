namespace __App__.Api.Common;

/// <summary>
/// İstek kimliği. Gelen <c>X-Request-Id</c> (en çok 128 karakter) kullanılır, yoksa üretilir; zarfın <c>traceId</c> alanı,
/// yanıt başlığı ve <c>HttpContext.TraceIdentifier</c> (loglar) aynı değeri taşır.
/// </summary>
public static class TraceId
{
    public const string ItemKey = "traceId";
    public const int MaxLength = 128;

    public static string? Current(HttpContext http) => http.Items[ItemKey] as string;
}

public sealed class TraceIdMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var header = context.Request.Headers["X-Request-Id"].FirstOrDefault();
        var trimmed = header?.Trim();
        var traceId = string.IsNullOrEmpty(trimmed) || trimmed.Length > TraceId.MaxLength ? Guid.NewGuid().ToString("N") : trimmed;
        context.Items[TraceId.ItemKey] = traceId;
        context.TraceIdentifier = traceId;
        context.Response.OnStarting(() =>
        {
            context.Response.Headers["X-Request-Id"] = traceId;
            return Task.CompletedTask;
        });
        await next(context);
    }
}
