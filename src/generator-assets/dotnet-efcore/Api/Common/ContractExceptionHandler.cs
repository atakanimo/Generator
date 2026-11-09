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
            var message = (exception.InnerException ?? exception) is JsonException { Path: { Length: > 2 } path }
                ? string.Format(Messages.InvalidValue, path.TrimStart('$', '.'))
                : Messages.InvalidBody;
            await httpContext.WriteContractAsync(Error.BadRequest(message));
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
