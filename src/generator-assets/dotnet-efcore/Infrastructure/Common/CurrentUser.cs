using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using __App__.Application.Common.Abstractions;

namespace __App__.Infrastructure.Common;

public sealed class CurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    public const string AdminRole = "Admin";

    private ClaimsPrincipal? Principal => accessor.HttpContext?.User;

    public Guid? Id => Guid.TryParse(Principal?.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated == true;
    public bool IsAdmin => Principal?.IsInRole(AdminRole) == true;
}
