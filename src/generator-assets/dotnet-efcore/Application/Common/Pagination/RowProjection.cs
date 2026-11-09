using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;

namespace __App__.Application.Common.Pagination;

public static class RowProjection
{
    public static Task<PaginatedList<TRow>> ToRowPageAsync<T, TRow>(
        this IQueryable<T> query, Expression<Func<T, TRow>> row, int? page, int? limit, CancellationToken cancellationToken) =>
        query.Select(row).ToPaginatedListAsync(page, limit, cancellationToken);

    public static Task<TRow?> FirstRowOrDefaultAsync<T, TRow>(
        this IQueryable<T> query, Expression<Func<T, TRow>> row, CancellationToken cancellationToken) =>
        query.Select(row).FirstOrDefaultAsync(cancellationToken);

    public static Task<TRow> FirstRowAsync<T, TRow>(
        this IQueryable<T> query, Expression<Func<T, TRow>> row, CancellationToken cancellationToken) =>
        query.Select(row).FirstAsync(cancellationToken);
}
