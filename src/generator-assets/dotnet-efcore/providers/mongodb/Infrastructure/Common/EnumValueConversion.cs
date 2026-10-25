using System.Reflection;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace __App__.Infrastructure.Common;

/// <summary>
/// String enum MongoDB'de JSON değeriyle (<c>JsonStringEnumMemberName</c>, ör. <c>in-review</c>) saklanır; Express ile aynı
/// doküman. Sağlayıcı nullable dönüştürücüyü kabul etmez: nullable alanda da nullable olmayan dönüştürücü.
/// </summary>
public static class EnumValueConversion
{
    public static PropertyBuilder<TEnum> HasEnumValueConversion<TEnum>(this PropertyBuilder<TEnum> builder) where TEnum : struct, Enum
    {
        builder.HasConversion(Converter<TEnum>());
        return builder;
    }

    public static PropertyBuilder<TEnum?> HasEnumValueConversion<TEnum>(this PropertyBuilder<TEnum?> builder) where TEnum : struct, Enum
    {
        builder.HasConversion(Converter<TEnum>());
        return builder;
    }


    private static ValueConverter<TEnum, string> Converter<TEnum>() where TEnum : struct, Enum =>
        new(v => EnumValues<TEnum>.ToValue(v), s => EnumValues<TEnum>.FromValue(s));

    private static class EnumValues<TEnum> where TEnum : struct, Enum
    {
        private static readonly Dictionary<TEnum, string> ToJson = Enum.GetValues<TEnum>().ToDictionary(
            v => v,
            v => typeof(TEnum).GetField(v.ToString())!.GetCustomAttribute<JsonStringEnumMemberNameAttribute>()?.Name ?? v.ToString());

        private static readonly Dictionary<string, TEnum> FromJson = ToJson.ToDictionary(p => p.Value, p => p.Key, StringComparer.Ordinal);

        public static string ToValue(TEnum value) => ToJson[value];

        public static TEnum FromValue(string value) => FromJson[value];
    }
}
