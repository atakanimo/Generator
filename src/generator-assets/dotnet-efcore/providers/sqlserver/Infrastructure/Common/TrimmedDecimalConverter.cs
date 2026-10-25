using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace __App__.Infrastructure.Common;

/// <summary>
/// SQL Server <c>decimal(38, 18)</c> sabit ölçekle döner (<c>149.900000000000000000</c>); okunan değer sondaki sıfırlar
/// olmadan (<c>149.9</c>). Yazılan ölçek saklanmaz.
/// </summary>
public sealed class TrimmedDecimalConverter() : ValueConverter<decimal, decimal>(v => v, v => v / 1.000000000000000000000000000000000m);
