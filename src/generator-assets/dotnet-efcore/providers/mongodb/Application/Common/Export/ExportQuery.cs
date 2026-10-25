using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;

namespace __App__.Application.Common.Export;

/// <summary>
/// Export satırları, MongoDB: sağlayıcı gömülü (owned) alanları skalerlerle aynı <c>Select</c>'te okuyamıyor; dokümanlar
/// okunur (en fazla <paramref name="take"/>), satır bellekte kurulur (<c>RowProjection</c> ile aynı yol).
/// </summary>
public static class ExportQuery
{
    public static async Task<List<TRow>> ToRowListAsync<T, TRow>(
        this IQueryable<T> query, Expression<Func<T, TRow>> row, int take, CancellationToken cancellationToken)
    {
        var entities = await query.Take(take).ToListAsync(cancellationToken);
        var map = row.Compile();
        return entities.Select(map).ToList();
    }
}
