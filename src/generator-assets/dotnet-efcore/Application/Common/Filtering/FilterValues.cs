using System.Globalization;
using System.Numerics;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace __App__.Application.Common.Filtering;

/// <summary><c>range</c> filtresi: <c>{ min?, max? }</c> ya da tek sayı (eşitlik).</summary>
[JsonConverter(typeof(RangeFilterConverterFactory))]
public sealed record RangeFilter<T>(T? Min, T? Max) where T : struct, INumber<T>;

/// <summary><c>date-range</c> filtresi: <c>{ from?, to? }</c> ya da tek tarih (o gün). UTC gün sınırları.</summary>
[JsonConverter(typeof(DateRangeFilterConverter))]
public sealed record DateRangeFilter(DateTimeOffset? From, DateTimeOffset? To);

/// <summary><c>enum</c> filtresi: tek değer ya da dizi.</summary>
[JsonConverter(typeof(OneOrManyConverterFactory))]
public sealed record OneOrMany<T>(IReadOnlyList<T> Values);

internal static class StrictObject
{
    /// <summary>Yalnızca <paramref name="allowed"/> anahtarları okur; bilinmeyen anahtar → <see cref="JsonException"/> (400).</summary>
    public static void Read(ref Utf8JsonReader reader, string[] allowed, ReadValue read)
    {
        while (reader.Read() && reader.TokenType != JsonTokenType.EndObject)
        {
            var name = reader.GetString()!;
            if (Array.IndexOf(allowed, name) < 0)
            {
                throw new JsonException($"Unknown key '{name}'.");
            }

            reader.Read();
            read(name, ref reader);
        }
    }

    public delegate void ReadValue(string name, ref Utf8JsonReader reader);
}

internal sealed class RangeFilterConverterFactory : JsonConverterFactory
{
    public override bool CanConvert(Type typeToConvert) =>
        typeToConvert.IsGenericType && typeToConvert.GetGenericTypeDefinition() == typeof(RangeFilter<>);

    public override JsonConverter CreateConverter(Type typeToConvert, JsonSerializerOptions options) =>
        (JsonConverter)Activator.CreateInstance(typeof(RangeFilterConverter<>).MakeGenericType(typeToConvert.GetGenericArguments()[0]))!;

    private sealed class RangeFilterConverter<T> : JsonConverter<RangeFilter<T>> where T : struct, INumber<T>
    {
        public override RangeFilter<T> Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            if (reader.TokenType != JsonTokenType.StartObject)
            {
                var value = JsonSerializer.Deserialize<T>(ref reader, options);
                return new RangeFilter<T>(value, value);
            }

            T? min = null, max = null;
            StrictObject.Read(ref reader, ["min", "max"], (string name, ref Utf8JsonReader r) =>
            {
                var v = JsonSerializer.Deserialize<T?>(ref r, options);
                if (name == "min") min = v; else max = v;
            });
            return new RangeFilter<T>(min, max);
        }

        public override void Write(Utf8JsonWriter writer, RangeFilter<T> value, JsonSerializerOptions options) =>
            JsonSerializer.Serialize(writer, new { min = value.Min, max = value.Max }, options);
    }
}

internal sealed class DateRangeFilterConverter : JsonConverter<DateRangeFilter>
{
    public override DateRangeFilter Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.String)
        {
            var day = ReadUtc(ref reader);
            return new DateRangeFilter(day, day);
        }

        if (reader.TokenType != JsonTokenType.StartObject)
        {
            throw new JsonException("Expected a date or { from, to }.");
        }

        DateTimeOffset? from = null, to = null;
        StrictObject.Read(ref reader, ["from", "to"], (string name, ref Utf8JsonReader r) =>
        {
            DateTimeOffset? v = r.TokenType == JsonTokenType.Null ? null : ReadUtc(ref r);
            if (name == "from") from = v; else to = v;
        });
        return new DateRangeFilter(from, to);
    }

    /// <summary>Saat dilimi yazılmamış değer (<c>2026-10-19</c>) UTC sayılır, sunucunun yerel saati değil.</summary>
    private static DateTimeOffset ReadUtc(ref Utf8JsonReader reader) =>
        DateTimeOffset.TryParse(reader.GetString(), CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out var value)
            ? value
            : throw new JsonException("Invalid date.");

    public override void Write(Utf8JsonWriter writer, DateRangeFilter value, JsonSerializerOptions options) =>
        JsonSerializer.Serialize(writer, new { from = value.From, to = value.To }, options);
}

internal sealed class OneOrManyConverterFactory : JsonConverterFactory
{
    public override bool CanConvert(Type typeToConvert) =>
        typeToConvert.IsGenericType && typeToConvert.GetGenericTypeDefinition() == typeof(OneOrMany<>);

    public override JsonConverter CreateConverter(Type typeToConvert, JsonSerializerOptions options) =>
        (JsonConverter)Activator.CreateInstance(typeof(OneOrManyConverter<>).MakeGenericType(typeToConvert.GetGenericArguments()[0]))!;

    private sealed class OneOrManyConverter<T> : JsonConverter<OneOrMany<T>>
    {
        public override OneOrMany<T> Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
            reader.TokenType == JsonTokenType.StartArray
                ? new OneOrMany<T>(JsonSerializer.Deserialize<List<T>>(ref reader, options) ?? [])
                : new OneOrMany<T>([JsonSerializer.Deserialize<T>(ref reader, options)!]);

        public override void Write(Utf8JsonWriter writer, OneOrMany<T> value, JsonSerializerOptions options) =>
            JsonSerializer.Serialize(writer, value.Values, options);
    }
}
