using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;

namespace __App__.Application.Common.Export;

/// <summary>
/// Export satırları: liste satırının projeksiyonu, sayfasız (en fazla <paramref name="take"/>). İlişkisel: veritabanında
/// <c>Select</c>. MongoDB sağlayıcısının asset katmanı bu dosyayı aynı imzayla değiştirir (satır bellekte kurulur).
/// </summary>
public static class ExportQuery
{
    public static Task<List<TRow>> ToRowListAsync<T, TRow>(
        this IQueryable<T> query, Expression<Func<T, TRow>> row, int take, CancellationToken cancellationToken) =>
        query.Select(row).Take(take).ToListAsync(cancellationToken);
}
