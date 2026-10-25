using System.Text.Json;
using System.Text.Json.Serialization;
using MongoDB.Bson;

namespace __App__.Api.Common;

/// <summary>Kimlik tipinin JSON dönüştürücüleri: <see cref="ObjectId"/> 24 karakter hex string (Express ile aynı).</summary>
public static class EntityIdJson
{
    public static IReadOnlyList<JsonConverter> Converters { get; } = [new ObjectIdJsonConverter()];

    private sealed class ObjectIdJsonConverter : JsonConverter<ObjectId>
    {
        public override ObjectId Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
            reader.TokenType == JsonTokenType.String && ObjectId.TryParse(reader.GetString(), out var id)
                ? id
                : throw new JsonException("Invalid id.");

        public override void Write(Utf8JsonWriter writer, ObjectId value, JsonSerializerOptions options) =>
            writer.WriteStringValue(value.ToString());
    }
}
