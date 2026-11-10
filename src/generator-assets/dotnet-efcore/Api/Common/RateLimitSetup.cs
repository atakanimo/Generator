using System.Globalization;
using System.Runtime.CompilerServices;
using System.Security.Claims;
using System.Text.RegularExpressions;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.RateLimiting;
using __App__.Application.Common.Errors;

namespace __App__.Api.Common;

public enum RateLimitKey
{
    Ip,
    User,
    IpAndPath,
    Header,
}

public static partial class RateLimitSetup
{
    public const string AuthPolicy = "auth";

    private static readonly Regex AdminPath = new("^/api/(admin(/|$)|[^/]+/admin(/|$))", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private static readonly ConditionalWeakTable<RateLimiterOptions, Dictionary<string, Limit>> IpCeilings = new();

    public static IServiceCollection AddRateLimits(this IServiceCollection services, IConfiguration configuration)
    {
        var general = Read(configuration, "RATE_LIMIT_GENERAL", "120/60");
        var adminRead = Read(configuration, "RATE_LIMIT_ADMIN_READ", "600/900");
        var adminWrite = Read(configuration, "RATE_LIMIT_ADMIN_WRITE", "120/900");

        services.AddRateLimiter(options =>
        {
            var ceilings = IpCeilings.GetOrCreateValue(options);
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.OnRejected = (context, _) =>
            {
                if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
                {
                    context.HttpContext.Response.Headers.RetryAfter = ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString(CultureInfo.InvariantCulture);
                }

                return new ValueTask(context.HttpContext.WriteContractAsync(
                    new Error(StatusCodes.Status429TooManyRequests, Messages.TooManyRequestsHeader, Messages.TooManyRequests)));
            };
            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(http =>
            {
                var (profile, limit, key) = Profile(http, ceilings, general, adminRead, adminWrite);
                return limit is null ? RateLimitPartition.GetNoLimiter(string.Empty) : Partition($"{profile}|{Key(http, key, null)}", limit);
            });
            options.AddFixedWindowPolicy(configuration, AuthPolicy, "10/60", RateLimitKey.IpAndPath);
            AddCustomPolicies(options, configuration);
        });
        return services;
    }

    public static void AddFixedWindowPolicy(
        this RateLimiterOptions options,
        IConfiguration configuration,
        string name,
        string defaultLimit,
        RateLimitKey key,
        string? keyHeader = null,
        string? ipCeiling = null)
    {
        var envName = $"RATE_LIMIT_{name.ToUpperInvariant().Replace('-', '_')}";
        if (key == RateLimitKey.Header && (keyHeader is null || ipCeiling is null))
        {
            throw new InvalidOperationException($"{name}: RateLimitKey.Header keyHeader ve ipCeiling ister.");
        }

        if (ipCeiling is not null && Read(configuration, $"{envName}_IP", ipCeiling) is { } ceiling)
        {
            IpCeilings.GetOrCreateValue(options)[name] = ceiling;
        }

        var limit = Read(configuration, envName, defaultLimit);
        options.AddPolicy(name, http => limit is null || Key(http, key, keyHeader) is not { } partitionKey
            ? RateLimitPartition.GetNoLimiter(string.Empty)
            : Partition(partitionKey, limit));
    }

    static partial void AddCustomPolicies(RateLimiterOptions options, IConfiguration configuration);

    private sealed record Limit(int Count, TimeSpan Window);

    private static Limit? Read(IConfiguration configuration, string key, string defaultValue)
    {
        if (!configuration.GetValue("RATE_LIMIT_ENABLED", true))
        {
            return null;
        }

        var value = configuration[key] ?? defaultValue;
        var parts = value.Split('/');
        if (parts.Length != 2
            || !int.TryParse(parts[0], NumberStyles.None, CultureInfo.InvariantCulture, out var count)
            || !int.TryParse(parts[1], NumberStyles.None, CultureInfo.InvariantCulture, out var seconds)
            || seconds == 0)
        {
            throw new InvalidOperationException($"{key} '<adet>/<saniye>' biçiminde olmalı: {value}");
        }

        return count == 0 ? null : new Limit(count, TimeSpan.FromSeconds(seconds));
    }

    private static (string Profile, Limit? Limit, RateLimitKey Key) Profile(
        HttpContext http, Dictionary<string, Limit> ceilings, Limit? general, Limit? adminRead, Limit? adminWrite)
    {
        var path = http.Request.Path.Value ?? string.Empty;
        if (!path.StartsWith("/api/", StringComparison.OrdinalIgnoreCase)
            || HttpMethods.IsOptions(http.Request.Method)
            || path.Equals("/api/health", StringComparison.OrdinalIgnoreCase))
        {
            return (string.Empty, null, RateLimitKey.Ip);
        }

        if (http.GetEndpoint()?.Metadata.GetMetadata<EnableRateLimitingAttribute>() is { } policy)
        {
            return ceilings.TryGetValue(policy.PolicyName ?? string.Empty, out var ceiling)
                ? ($"ceiling:{policy.PolicyName}", ceiling, RateLimitKey.Ip)
                : (string.Empty, null, RateLimitKey.Ip);
        }

        if (!AdminPath.IsMatch(path))
        {
            return ("general", general, RateLimitKey.User);
        }

        var read = HttpMethods.IsGet(http.Request.Method)
            || HttpMethods.IsHead(http.Request.Method)
            || path.EndsWith("/get-all", StringComparison.OrdinalIgnoreCase);
        return (read ? "admin-read" : "admin-write", read ? adminRead : adminWrite, RateLimitKey.User);
    }

    private static string? Key(HttpContext http, RateLimitKey key, string? keyHeader)
    {
        var ip = http.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return key switch
        {
            RateLimitKey.IpAndPath => $"ip:{ip}|{http.Request.Path}",
            RateLimitKey.User when http.User.FindFirstValue(ClaimTypes.NameIdentifier) is { } id => $"user:{id}",
            RateLimitKey.Header => http.Request.Headers[keyHeader!].ToString() is { Length: > 0 } value ? $"key:{value}" : null,
            _ => $"ip:{ip}",
        };
    }

    private static RateLimitPartition<string> Partition(string key, Limit limit) =>
        RateLimitPartition.GetFixedWindowLimiter(key, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = limit.Count,
            Window = limit.Window,
            QueueLimit = 0,
        });
}
