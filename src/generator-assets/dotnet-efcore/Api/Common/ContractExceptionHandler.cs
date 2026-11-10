using System.Text.Json;
using Microsoft.AspNetCore.Diagnostics;
using __App__.Application.Common.Errors;

namespace __App__.Api.Common;

/// <summary>Yakalanmamış hata → sözleşme cevabı. Okunamayan / strict olmayan gövde 400, kısıt ihlali 409, gerisi 500. ProblemDetails yok.</summary>
public sealed class ContractExceptionHandler(ILogger<ContractExceptionHandler> logger, IDbErrorClassifier dbErrors) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is BadHttpRequestException or JsonException)
        {
            logger.LogInformation(exception, "Bad request body");
            // System.Text.Json'ın İngilizce teknik metni yerine alan adı (JSON yolu) ve istek dilinde mesaj.
            var field = (exception.InnerException ?? exception) is JsonException { Path: { Length: > 2 } path } ? path.TrimStart('$', '.') : null;
            var error = field is null ? Error.BadRequest(Messages.InvalidBody) : Error.BadRequest(string.Format(Messages.InvalidValue, field), field);
            await httpContext.WriteContractAsync(error);
            return true;
        }

        // Servis kontrollerinden kaçan yarış durumları: unique ve kullanılan kayıt ihlali → 409.
        if (dbErrors.Classify(exception) is { } conflict)
        {
            logger.LogInformation(exception, "Constraint violation");
            var message = conflict.Kind == DbConflictKind.Duplicate ? string.Format(Messages.Duplicate, conflict.Field) : Messages.InUse;
            await httpContext.WriteContractAsync(Error.Conflict(message));
            return true;
        }

        logger.LogError(exception, "Unhandled exception");
        await httpContext.WriteContractAsync(Error.Internal());
        return true;
    }
}
