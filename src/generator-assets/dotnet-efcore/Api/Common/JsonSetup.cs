using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace __App__.Api.Common;

public static class JsonSetup
{
    /// <summary>camelCase, strict gövde (bilinmeyen anahtar → 400), enum string, decimal string, UTC tarih.</summary>
    public static IServiceCollection AddContractJson(this IServiceCollection services)
    {
        services.ConfigureHttpJsonOptions(options =>
        {
            var json = options.SerializerOptions;
            json.UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow;
            json.NumberHandling = JsonNumberHandling.Strict;
            json.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase, allowIntegerValues: false));
            json.Converters.Add(new DecimalStringConverter());
            json.Converters.Add(new UtcDateTimeOffsetConverter());
            json.Converters.Add(new RefJsonConverterFactory());
        });
        services.Configure<RouteHandlerOptions>(options => options.ThrowOnBadRequest = true);
        return services;
    }

    /// <summary>Çıkış: <c>2026-10-19T10:00:00.000Z</c> (Express ile aynı biçim).</summary>
    private sealed class UtcDateTimeOffsetConverter : JsonConverter<DateTimeOffset>
    {
        public override DateTimeOffset Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
            // Saat dilimi yoksa (ör. "2026-10-19") UTC sayılır; sunucunun yerel dilimi kullanılmaz.
            DateTimeOffset.TryParse(reader.GetString(), CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var value)
                ? value.ToUniversalTime()
                : throw new JsonException("Invalid date.");

        public override void Write(Utf8JsonWriter writer, DateTimeOffset value, JsonSerializerOptions options) =>
            writer.WriteStringValue(value.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture));
    }
}
