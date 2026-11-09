using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using __App__.Domain.Common;

namespace __App__.Application.Common.Pagination;

public sealed class SortMap<TEntity> where TEntity : IEntity
{
    private readonly Dictionary<string, LambdaExpression> _map = new(StringComparer.Ordinal)
    {
        ["id"] = (Expression<Func<TEntity, EntityId>>)(x => x.Id),
    };

    public SortMap<TEntity> Add<TKey>(string name, Expression<Func<TEntity, TKey>> selector)
    {
        _map[name] = selector;
        return this;
    }

    public IReadOnlyCollection<string> Keys => _map.Keys;

    internal LambdaExpression this[string name] => _map[name];
}

public static class QueryableExtensions
{
    public static bool ExplicitNullOrder { get; set; }

    public static IOrderedQueryable<T> OrderByDefault<T>(this IQueryable<T> query) where T : IEntity, ITimestamped =>
        query.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id);

    public static IQueryable<T> ApplySort<T>(
        this IQueryable<T> query,
        string? sortBy,
        SortOrder? sortOrder,
        SortMap<T> map,
        Func<IQueryable<T>, IOrderedQueryable<T>> defaultSort) where T : IEntity
    {
        if (string.IsNullOrEmpty(sortBy))
        {
            return defaultSort(query);
        }

        var descending = sortOrder != SortOrder.Asc;
        var key = map[sortBy];
        var ordered = ExplicitNullOrder && IsNullable(key.ReturnType)
            ? Order(Order(query, IsNull(key), descending ? nameof(Queryable.OrderBy) : nameof(Queryable.OrderByDescending)),
                key, descending ? nameof(Queryable.ThenByDescending) : nameof(Queryable.ThenBy))
            : Order(query, key, descending ? nameof(Queryable.OrderByDescending) : nameof(Queryable.OrderBy));
        return sortBy == "id"
            ? ordered
            : Order(ordered, map["id"], descending ? nameof(Queryable.ThenByDescending) : nameof(Queryable.ThenBy));
    }

    public static async Task<PaginatedList<TRow>> ToPaginatedListAsync<TRow>(
        this IQueryable<TRow> query, int? page, int? limit, CancellationToken cancellationToken)
    {
        var currentLimit = limit ?? ListDefaults.Limit;
        var currentPage = page ?? ListDefaults.Page;
        var skip = (currentPage - 1) * currentLimit;

        var total = await query.CountAsync(cancellationToken);
        var items = await query.Skip(skip).Take(currentLimit).ToListAsync(cancellationToken);
        return new PaginatedList<TRow>(items, total, skip + items.Count < total, currentPage, currentLimit);
    }

    private static bool IsNullable(Type type) => !type.IsValueType || Nullable.GetUnderlyingType(type) is not null;

    private static LambdaExpression IsNull(LambdaExpression key) =>
        Expression.Lambda(Expression.Equal(key.Body, Expression.Constant(null, key.ReturnType)), key.Parameters);

    private static IOrderedQueryable<T> Order<T>(IQueryable<T> query, LambdaExpression key, string method)
    {
        var call = Expression.Call(
            typeof(Queryable), method, [typeof(T), key.ReturnType], query.Expression, Expression.Quote(key));
        return (IOrderedQueryable<T>)query.Provider.CreateQuery<T>(call);
    }
}
