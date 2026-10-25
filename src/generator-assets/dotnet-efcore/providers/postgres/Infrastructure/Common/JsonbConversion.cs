using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using __App__.Domain.Common;

namespace __App__.Infrastructure.Common;

/// <summary><c>map</c> ve enum dizileri: değer jsonb kolonda JSON olarak saklanır.</summary>
public static class JsonbConversion
{
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web) { Converters = { new EnumValueJsonConverter() } };

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

    /// <summary>Enum değerleriyle (<c>JsonStringEnumMemberName</c>); sayısal enum (<see cref="NumericEnumAttribute"/>) sayı kalır.</summary>
    private sealed class EnumValueJsonConverter : JsonConverterFactory
    {
        private readonly JsonStringEnumConverter inner = new();

        public override bool CanConvert(Type typeToConvert) =>
            inner.CanConvert(typeToConvert) && !typeToConvert.IsDefined(typeof(NumericEnumAttribute), inherit: false);

        public override JsonConverter? CreateConverter(Type typeToConvert, JsonSerializerOptions options) =>
            inner.CreateConverter(typeToConvert, options);
    }
}
