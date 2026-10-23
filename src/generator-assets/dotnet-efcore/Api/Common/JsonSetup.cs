using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using __App__.Domain.Common;

namespace __App__.Api.Common;

public static class JsonSetup
{
    /// <summary>camelCase, strict gövde (bilinmeyen anahtar → 400), enum string (<see cref="NumericEnumAttribute"/> taşıyan sayı), decimal string, UTC tarih.</summary>
    public static IServiceCollection AddContractJson(this IServiceCollection services)
    {
        services.ConfigureHttpJsonOptions(options =>
        {
            var json = options.SerializerOptions;
            json.UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow;
            json.NumberHandling = JsonNumberHandling.Strict;
            json.Converters.Add(new ContractEnumConverterFactory());
            json.Converters.Add(new DecimalStringConverter());
            json.Converters.Add(new UtcDateTimeOffsetConverter());
            json.Converters.Add(new RefJsonConverterFactory());
        });
        services.Configure<RouteHandlerOptions>(options => options.ThrowOnBadRequest = true);
        return services;
    }

    /// <summary>Enum'lar camelCase string; <see cref="NumericEnumAttribute"/> taşıyanları STJ varsayılanına (sayı) bırakır.</summary>
    private sealed class ContractEnumConverterFactory : JsonConverterFactory
    {
        private readonly JsonStringEnumConverter inner = new(JsonNamingPolicy.CamelCase, allowIntegerValues: false);

        public override bool CanConvert(Type typeToConvert) =>
            inner.CanConvert(typeToConvert) && !typeToConvert.IsDefined(typeof(NumericEnumAttribute), inherit: false);

        public override JsonConverter? CreateConverter(Type typeToConvert, JsonSerializerOptions options) =>
            inner.CreateConverter(typeToConvert, options);
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
