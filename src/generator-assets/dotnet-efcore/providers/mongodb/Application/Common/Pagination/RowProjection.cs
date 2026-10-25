using System.Linq.Expressions;
using System.Runtime.CompilerServices;
using Microsoft.EntityFrameworkCore;

namespace __App__.Application.Common.Pagination;

/// <summary>
/// Satır projeksiyonu (<c>Row</c> / <c>WriteRow</c>), MongoDB: sağlayıcı gömülü (owned) alanları skalerlerle aynı
/// <c>Select</c>'te okuyamıyor; doküman okunur, satır bellekte kurulur. Derlenmiş ifade projeksiyon başına bir kez.
/// </summary>
public static class RowProjection
{
    private static readonly ConditionalWeakTable<LambdaExpression, Delegate> Compiled = new();

    public static async Task<PaginatedList<TRow>> ToRowPageAsync<T, TRow>(
        this IQueryable<T> query, Expression<Func<T, TRow>> row, int? page, int? limit, CancellationToken cancellationToken)
    {
        var entities = await query.ToPaginatedListAsync(page, limit, cancellationToken);
        var map = Compile(row);
        return new PaginatedList<TRow>(entities.Items.Select(map).ToList(), entities.Total, entities.HasMore, entities.CurrentPage, entities.CurrentLimit);
    }

    public static async Task<TRow?> FirstRowOrDefaultAsync<T, TRow>(
        this IQueryable<T> query, Expression<Func<T, TRow>> row, CancellationToken cancellationToken) =>
        await query.FirstOrDefaultAsync(cancellationToken) is { } entity ? Compile(row)(entity) : default;

    public static async Task<TRow> FirstRowAsync<T, TRow>(
        this IQueryable<T> query, Expression<Func<T, TRow>> row, CancellationToken cancellationToken) =>
        Compile(row)(await query.FirstAsync(cancellationToken));

    private static Func<T, TRow> Compile<T, TRow>(Expression<Func<T, TRow>> row) =>
        (Func<T, TRow>)Compiled.GetValue(row, expression => expression.Compile());
}
