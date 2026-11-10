namespace __App__.Application.Common.Errors;

public sealed record Error(int Code, string Header, string Message, string? Field = null)
{
    public static Error BadRequest(string message, string? field = null) => new(ErrorCodes.BadRequest, Messages.BadRequestHeader, message, field);
    public static Error Unauthorized() => new(ErrorCodes.Unauthorized, Messages.UnauthorizedHeader, Messages.Unauthorized);
    public static Error Forbidden() => new(ErrorCodes.Forbidden, Messages.ForbiddenHeader, Messages.Forbidden);
    public static Error Forbidden(string message) => new(ErrorCodes.Forbidden, Messages.ForbiddenHeader, message);
    public static Error NotFound() => new(ErrorCodes.NotFound, Messages.NotFoundHeader, Messages.NotFound);
    public static Error Conflict(string message) => new(ErrorCodes.Conflict, Messages.ConflictHeader, message);
    public static Error Internal() => new(ErrorCodes.InternalServerError, Messages.InternalHeader, Messages.Internal);
}
