namespace __App__.Domain.Common;

/// <summary>
/// JSON'da sayı olarak giden enum (Generator modelinde <c>enum.numbers</c>; üyeler <c>Name = n</c>).
/// Küresel string enum dönüştürücüsü (<c>JsonSetup</c>) bu enum'ları atlar; STJ varsayılanı sayı yazar ve okur.
/// Tip üstündeki <c>[JsonConverter]</c> burada işe yaramaz: <c>Converters</c> listesindeki dönüştürücü ondan önce gelir.
/// </summary>
[AttributeUsage(AttributeTargets.Enum)]
public sealed class NumericEnumAttribute : Attribute;
