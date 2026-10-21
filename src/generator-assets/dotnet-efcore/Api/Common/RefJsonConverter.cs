using System.Text.Json;
using System.Text.Json.Serialization;
using __App__.Application.Common.Relations;

namespace __App__.Api.Common;

/// <summary><see cref="Ref{T}"/>: değer varsa obje, yoksa id string'i yazar. Yalnızca çıkış (Row); girişte ilişki id'dir.</summary>
public sealed class RefJsonConverterFactory : JsonConverterFactory
{
    public override bool CanConvert(Type typeToConvert) =>
        typeToConvert.IsGenericType && typeToConvert.GetGenericTypeDefinition() == typeof(Ref<>);

    public override JsonConverter CreateConverter(Type typeToConvert, JsonSerializerOptions options) =>
        (JsonConverter)Activator.CreateInstance(typeof(RefConverter<>).MakeGenericType(typeToConvert.GetGenericArguments()[0]))!;

    private sealed class RefConverter<T> : JsonConverter<Ref<T>> where T : class
    {
        public override Ref<T> Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
            throw new JsonException("Ref is output-only.");

        public override void Write(Utf8JsonWriter writer, Ref<T> value, JsonSerializerOptions options)
        {
            if (value.Value is null)
            {
                writer.WriteStringValue(value.Id);
                return;
            }

            JsonSerializer.Serialize(writer, value.Value, options);
        }
    }
}
