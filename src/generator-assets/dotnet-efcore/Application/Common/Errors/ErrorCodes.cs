namespace __App__.Application.Common.Errors;

/// <summary>Sözleşmedeki hata kodları; her stack'te aynı sayılar.</summary>
public static class ErrorCodes
{
    public const int BadRequest = 400;
    public const int Unauthorized = 401;
    public const int Forbidden = 403;
    public const int NotFound = 404;
    public const int RequestTimeout = 408;
    public const int Conflict = 409;
    public const int UnprocessableEntity = 422;
    public const int TooManyRequests = 429;
    /// <summary>Plan / abonelik yükseltmesi gerekli (ücretli özellik).</summary>
    public const int PlanRequired = 460;
    public const int EmailNotVerified = 463;
    public const int InternalServerError = 500;
    /// <summary>Dış servis (sağlayıcı, ödeme, veri kaynağı) hata verdi ya da ulaşılamadı.</summary>
    public const int UpstreamError = 502;
    public const int ServiceUnavailable = 503;
}
