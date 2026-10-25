using System.Text.Json.Serialization;

namespace __App__.Api.Common;

/// <summary>Kimlik tipinin JSON dönüştürücüleri: <see cref="Guid"/> System.Text.Json'da zaten string.</summary>
public static class EntityIdJson
{
    public static IReadOnlyList<JsonConverter> Converters { get; } = [];
}
