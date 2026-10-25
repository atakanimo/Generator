using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using __App__.Application.Common.Abstractions;
using __App__.Domain.Common;

namespace __App__.Infrastructure.Common;

public sealed class CurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    public const string AdminRole = "admin";

    private ClaimsPrincipal? Principal => accessor.HttpContext?.User;

    public EntityId? Id => EntityIds.TryParse(Principal?.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated == true;
    public bool IsAdmin => Principal?.IsInRole(AdminRole) == true;
}
