using __App__.Application.Common.Errors;
using __App__.Application.Common.Pagination;

namespace __App__.Application.Common.Export;

/// <summary>
/// <c>POST export</c> gövdesi (api-contract §2 "Export", PY12): liste gövdesinin filtre ve sıralama kısmı (sayfalama yok)
/// + dışa aktarılacak kolonlar ve başlıkları. Bilinmeyen anahtar 400 (JSON ayarı).
/// </summary>
public sealed class ExportBody<TFilters> where TFilters : class
{
    public TFilters? Filters { get; init; }
    public string? SortBy { get; init; }
    public SortOrder? SortOrder { get; init; }
    public List<string>? Fields { get; init; }
    public List<string>? Headers { get; init; }

    /// <summary><c>BeforeList</c> hook'una giden liste gövdesi.</summary>
    public ListBody<TFilters> ToListBody() => new() { Filters = Filters, SortBy = SortBy, SortOrder = SortOrder };
}

/// <summary>Export satırları (liste satırıyla aynı şekil) ve kolonlar; Api katmanı CSV'ye çevirir.</summary>
public sealed record ExportRows<TRow>(IReadOnlyList<TRow> Rows, IReadOnlyList<string> Fields, IReadOnlyList<string> Headers);

/// <summary>Kolon ve satır sınırı kuralları (Python <c>export.py</c>, Express <c>export-csv.ts</c> ile aynı).</summary>
public static class ExportRules
{
    /// <summary>Bir export'ta en fazla satır; aşılırsa 400 (filtre daraltılır).</summary>
    public const int RowLimit = 50_000;

    /// <summary>İstenen kolonlar (boşsa hepsi) ve başlıklar; bilinmeyen kolon, başlık sayısı ya da sıralama alanı 400.</summary>
    public static Error? ResolveColumns<TFilters>(
        ExportBody<TFilters> body,
        IReadOnlyList<string> exportable,
        IReadOnlyCollection<string> sortKeys,
        out IReadOnlyList<string> fields,
        out IReadOnlyList<string> headers) where TFilters : class
    {
        fields = body.Fields is { Count: > 0 } requested ? requested : exportable;
        headers = body.Headers ?? fields;
        if (fields.FirstOrDefault(f => !exportable.Contains(f)) is { } unknown)
        {
            return Error.BadRequest($"Bu alan dışa aktarılamaz: {unknown}");
        }

        if (body.Headers is not null && body.Headers.Count != fields.Count)
        {
            return Error.BadRequest("`headers`, `fields` ile aynı sayıda olmalı.");
        }

        return body.SortBy is not null && !sortKeys.Contains(body.SortBy)
            ? Error.BadRequest(string.Format(Messages.InvalidSort, body.SortBy))
            : null;
    }

    public static Error TooMany() =>
        Error.BadRequest($"Dışa aktarılacak çok fazla kayıt var; en fazla {RowLimit}. Filtreleri daraltın.");
}
