using System.Text.Json;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using __App__.Application.Common.Errors;

namespace __App__.Api.Common;

/// <summary>Yakalanmamış hata → zarf. Okunamayan / strict olmayan gövde 400, kısıt ihlali 409, gerisi 500. ProblemDetails yok.</summary>
public sealed class EnvelopeExceptionHandler(ILogger<EnvelopeExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        if (exception is BadHttpRequestException or JsonException)
        {
            logger.LogInformation(exception, "Bad request body");
            var message = (exception.InnerException ?? exception) is JsonException json ? json.Message : Messages.InvalidBody;
            await httpContext.WriteEnvelopeAsync(Error.BadRequest(message));
            return true;
        }

        // Servis kontrollerinden kaçan yarış durumları: unique (23505) ve FK (23503) ihlali → 409.
        if (exception is DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.UniqueViolation or PostgresErrorCodes.ForeignKeyViolation } pg })
        {
            logger.LogInformation(exception, "Constraint violation");
            var message = pg.SqlState == PostgresErrorCodes.UniqueViolation ? string.Format(Messages.Duplicate, pg.ConstraintName) : Messages.InUse;
            await httpContext.WriteEnvelopeAsync(Error.Conflict(message));
            return true;
        }

        logger.LogError(exception, "Unhandled exception");
        await httpContext.WriteEnvelopeAsync(Error.Internal());
        return true;
    }
}
