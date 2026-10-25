using System.Globalization;
using __App__.Domain.Common;

namespace __App__.Api.Common;

/// <summary>Route kısıtı <c>{id:entityid}</c>: kimlik tipine çevrilemeyen değer eşleşmez, cevap 404 zarfı.</summary>
public sealed class EntityIdRouteConstraint : IRouteConstraint
{
    public const string Name = "entityid";

    public bool Match(HttpContext? httpContext, IRouter? route, string routeKey, RouteValueDictionary values, RouteDirection routeDirection) =>
        values.TryGetValue(routeKey, out var value) && EntityIds.TryParse(Convert.ToString(value, CultureInfo.InvariantCulture), out _);
}
