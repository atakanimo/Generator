using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace __App__.Api.Common;

/// <summary><c>decimal</c> JSON'da string (sözleşme K5), giriş ve çıkışta.</summary>
public sealed class DecimalStringConverter : JsonConverter<decimal>
{
    public override decimal Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        reader.TokenType == JsonTokenType.String
        && decimal.TryParse(reader.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out var value)
            ? value
            : throw new JsonException("Decimal values must be strings.");

    public override void Write(Utf8JsonWriter writer, decimal value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value.ToString(CultureInfo.InvariantCulture));
}
