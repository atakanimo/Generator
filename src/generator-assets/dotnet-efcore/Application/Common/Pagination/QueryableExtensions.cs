using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using __App__.Domain.Common;

namespace __App__.Application.Common.Pagination;

/// <summary>Sıralanabilir alanlar: JSON adı → entity seçici. <c>id</c> her zaman eklenir.</summary>
public sealed class SortMap<TEntity> where TEntity : IEntity
{
    private readonly Dictionary<string, LambdaExpression> _map = new(StringComparer.Ordinal)
    {
        ["id"] = (Expression<Func<TEntity, Guid>>)(x => x.Id),
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
    /// <summary>Varsayılan sıralama: <c>createdAt desc, id desc</c>.</summary>
    public static IOrderedQueryable<T> OrderByDefault<T>(this IQueryable<T> query) where T : IEntity, ITimestamped =>
        query.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id);

    /// <summary><paramref name="sortBy"/> boşsa <paramref name="defaultSort"/>; değilse alan + <c>id</c> (kararlı sayfalama).</summary>
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
        var ordered = Order(query, map[sortBy], descending ? nameof(Queryable.OrderByDescending) : nameof(Queryable.OrderBy));
        return sortBy == "id"
            ? ordered
            : Order(ordered, map["id"], descending ? nameof(Queryable.ThenByDescending) : nameof(Queryable.ThenBy));
    }

    public static async Task<PaginatedList<TRow>> ToPaginatedListAsync<TRow>(
        this IQueryable<TRow> query, int? page, int? limit, CancellationToken cancellationToken)
    {
        var currentLimit = limit is null or < 1 ? ListDefaults.Limit : Math.Min(limit.Value, ListDefaults.MaxLimit);
        var currentPage = page ?? ListDefaults.Page;
        var skip = (currentPage - 1) * currentLimit;

        var total = await query.CountAsync(cancellationToken);
        var items = await query.Skip(skip).Take(currentLimit).ToListAsync(cancellationToken);
        return new PaginatedList<TRow>(items, total, skip + items.Count < total, currentPage, currentLimit);
    }

    private static IOrderedQueryable<T> Order<T>(IQueryable<T> query, LambdaExpression key, string method)
    {
        var call = Expression.Call(
            typeof(Queryable), method, [typeof(T), key.ReturnType], query.Expression, Expression.Quote(key));
        return (IOrderedQueryable<T>)query.Provider.CreateQuery<T>(call);
    }
}
