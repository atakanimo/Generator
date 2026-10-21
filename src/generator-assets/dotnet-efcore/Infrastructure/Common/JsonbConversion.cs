using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace __App__.Infrastructure.Common;

/// <summary><c>map</c> ve enum dizileri: değer jsonb kolonda JSON olarak saklanır.</summary>
public static class JsonbConversion
{
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);

    public static PropertyBuilder<T> HasJsonbConversion<T>(this PropertyBuilder<T> builder) where T : class?
    {
        builder.HasConversion(
                v => JsonSerializer.Serialize(v, Options),
                s => JsonSerializer.Deserialize<T>(s, Options)!,
                new ValueComparer<T>(
                    (a, b) => JsonSerializer.Serialize(a, Options) == JsonSerializer.Serialize(b, Options),
                    v => JsonSerializer.Serialize(v, Options).GetHashCode(StringComparison.Ordinal),
                    v => JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(v, Options), Options)!))
            .HasColumnType("jsonb");
        return builder;
    }
}
