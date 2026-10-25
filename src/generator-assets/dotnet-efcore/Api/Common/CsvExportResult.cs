using System.Globalization;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using __App__.Application.Common.Export;
using __App__.Application.Common.Results;
using HttpJsonOptions = Microsoft.AspNetCore.Http.Json.JsonOptions;

namespace __App__.Api.Common;

/// <summary>
/// Export yanıtı (api-contract §2 "Export", PY12): hata normal zarf; başarı RFC 4180 CSV (<c>,</c>, CRLF), UTF-8 BOM,
/// <c>attachment; filename="&lt;modül&gt;-&lt;YYYY-MM-DD&gt;.csv"</c>. Hücre kuralları Python <c>export.py</c>, Express
/// <c>export-csv.ts</c> ile aynı; satırlar önce JSON yanıtıyla aynı ayarlarla wire biçimine çevrilir.
/// </summary>
public static partial class CsvExportResult
{
    private static readonly char[] FormulaPrefixes = ['=', '+', '-', '@', '\t', '\r'];
    private static readonly char[] QuoteChars = [',', '"', '\r', '\n'];
    private static readonly JavaScriptEncoder CompactEncoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping;

    public static IResult ToCsv<TRow>(this Result<ExportRows<TRow>> result, string module, IReadOnlyDictionary<string, string> display) =>
        result.Error is { } error ? ResultExtensions.Fail<object>(error) : new CsvResult<TRow>(result.Value!, module, display);

    /// <summary>Bir hücre: null boş, ilişki <c>display</c> alanı (yoksa id), dizi / obje sıkışık JSON, metinde formül koruması.</summary>
    public static string CellText(JsonElement value, string? display = null)
    {
        if (value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return string.Empty;
        }

        if (display is not null)
        {
            return value.ValueKind == JsonValueKind.Array
                ? CompactJson(writer =>
                {
                    writer.WriteStartArray();
                    foreach (var item in value.EnumerateArray())
                    {
                        Shown(item, display).WriteTo(writer);
                    }

                    writer.WriteEndArray();
                })
                : CellText(Shown(value, display));
        }

        switch (value.ValueKind)
        {
            case JsonValueKind.True:
                return "true";
            case JsonValueKind.False:
                return "false";
            case JsonValueKind.Number:
                return value.GetRawText();
            case JsonValueKind.Object or JsonValueKind.Array:
                return CompactJson(value.WriteTo);
        }

        var text = value.GetString() ?? string.Empty;
        // Sayı gibi görünen metin (decimal wire `-12.50`) formül değil; önek eklenmez.
        return text.Length > 0 && FormulaPrefixes.Contains(text[0]) && !NumberText().IsMatch(text) ? $"'{text}" : text;
    }

    private static JsonElement Shown(JsonElement value, string display)
    {
        if (value.ValueKind != JsonValueKind.Object)
        {
            return value;
        }

        return value.TryGetProperty(display, out var shown) && shown.ValueKind != JsonValueKind.Null
            ? shown
            : value.TryGetProperty("id", out var id) ? id : default;
    }

    private static string CompactJson(Action<Utf8JsonWriter> write)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream, new JsonWriterOptions { Encoder = CompactEncoder }))
        {
            write(writer);
        }

        return Encoding.UTF8.GetString(stream.ToArray());
    }

    private static string Quote(string cell) =>
        cell.IndexOfAny(QuoteChars) >= 0 ? $"\"{cell.Replace("\"", "\"\"", StringComparison.Ordinal)}\"" : cell;

    [GeneratedRegex(@"^-?[0-9]+(\.[0-9]+)?$")]
    private static partial Regex NumberText();

    private sealed class CsvResult<TRow>(ExportRows<TRow> export, string module, IReadOnlyDictionary<string, string> display) : IResult
    {
        public async Task ExecuteAsync(HttpContext httpContext)
        {
            var json = httpContext.RequestServices.GetRequiredService<IOptions<HttpJsonOptions>>().Value.SerializerOptions;
            var csv = new StringBuilder("﻿");
            csv.Append(string.Join(',', export.Headers.Select(Quote))).Append("\r\n");
            foreach (var row in export.Rows)
            {
                var wire = JsonSerializer.SerializeToElement(row, json);
                var cells = export.Fields.Select(field =>
                    Quote(CellText(wire.TryGetProperty(field, out var value) ? value : default, display.GetValueOrDefault(field))));
                csv.Append(string.Join(',', cells)).Append("\r\n");
            }

            var date = DateTime.UtcNow.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            httpContext.Response.StatusCode = StatusCodes.Status200OK;
            httpContext.Response.ContentType = "text/csv; charset=utf-8";
            // `Results.File` RFC 6266 biçimi (filename*=) üretir; sözleşme tırnaklı düz `filename` ister.
            httpContext.Response.Headers.ContentDisposition = $"attachment; filename=\"{module}-{date}.csv\"";
            await httpContext.Response.WriteAsync(csv.ToString(), Encoding.UTF8, httpContext.RequestAborted);
        }
    }
}
