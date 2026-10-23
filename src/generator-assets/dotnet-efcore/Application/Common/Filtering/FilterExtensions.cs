using System.Linq.Expressions;
using System.Numerics;

namespace __App__.Application.Common.Filtering;

/// <summary>
/// Sözleşmedeki filtre türleri → <see cref="IQueryable{T}"/>. Değerler parametre olarak gider (SQL'e gömülmez).
/// <c>regex</c>: büyük / küçük harf duyarsız "içerir"; desen olarak çalıştırılmaz.
/// </summary>
public static class FilterExtensions
{
    public static IQueryable<T> WhereEquals<T, TValue>(this IQueryable<T> query, Expression<Func<T, TValue>> selector, TValue? value)
        where TValue : struct =>
        value is null ? query : query.Where(Build(selector, body => Expression.Equal(body, Param(value.Value))));

    public static IQueryable<T> WhereEquals<T, TValue>(this IQueryable<T> query, Expression<Func<T, TValue?>> selector, TValue? value)
        where TValue : struct =>
        value is null ? query : query.Where(Build(selector, body => Expression.Equal(body, Param<TValue?>(value))));

    public static IQueryable<T> WhereEquals<T>(this IQueryable<T> query, Expression<Func<T, string?>> selector, string? value) =>
        value is null ? query : query.Where(Build(selector, body => Expression.Equal(body, Param(value))));

    public static IQueryable<T> WhereContains<T>(this IQueryable<T> query, Expression<Func<T, string?>> selector, string? term)
    {
        if (string.IsNullOrEmpty(term))
        {
            return query;
        }

        var needle = term.ToLowerInvariant();
        return query.Where(Build(selector, body => Expression.AndAlso(
            Expression.NotEqual(body, Expression.Constant(null, typeof(string))),
            Expression.Call(Expression.Call(body, ToLower), Contains, Param(needle)))));
    }

    public static IQueryable<T> WhereRange<T, TValue>(this IQueryable<T> query, Expression<Func<T, TValue>> selector, RangeFilter<TValue>? range)
        where TValue : struct, INumber<TValue>
    {
        if (range is null)
        {
            return query;
        }

        if (range.Min is { } min)
        {
            query = query.Where(Build(selector, body => Expression.GreaterThanOrEqual(body, Param(min))));
        }

        if (range.Max is { } max)
        {
            query = query.Where(Build(selector, body => Expression.LessThanOrEqual(body, Param(max))));
        }

        return query;
    }

    // Tarih aralığı: `from` gün başı ≤ x < `to` + 1 gün (UTC). Dört aşırı yükleme yalnızca sütun tipini (DateTimeOffset /
    // DateOnly, nullable ya da değil) seçer; EF ifadesi aynı tipte sabit istediği için sınır değeri o tipe çevrilir.

    public static IQueryable<T> WhereDateRange<T>(this IQueryable<T> query, Expression<Func<T, DateTimeOffset>> selector, DateRangeFilter? range) =>
        WhereInUtcDays(query, selector, range, day => day);

    public static IQueryable<T> WhereDateRange<T>(this IQueryable<T> query, Expression<Func<T, DateTimeOffset?>> selector, DateRangeFilter? range) =>
        WhereInUtcDays<T, DateTimeOffset?>(query, selector, range, day => day);

    public static IQueryable<T> WhereDateRange<T>(this IQueryable<T> query, Expression<Func<T, DateOnly>> selector, DateRangeFilter? range) =>
        WhereInUtcDays(query, selector, range, day => DateOnly.FromDateTime(day.UtcDateTime));

    public static IQueryable<T> WhereDateRange<T>(this IQueryable<T> query, Expression<Func<T, DateOnly?>> selector, DateRangeFilter? range) =>
        WhereInUtcDays<T, DateOnly?>(query, selector, range, day => DateOnly.FromDateTime(day.UtcDateTime));

    private static IQueryable<T> WhereInUtcDays<T, TValue>(
        IQueryable<T> query,
        Expression<Func<T, TValue>> selector,
        DateRangeFilter? range,
        Func<DateTimeOffset, TValue> bound)
    {
        if (range?.From is { } from)
        {
            var start = bound(StartOfUtcDay(from));
            query = query.Where(Build(selector, body => Expression.GreaterThanOrEqual(body, Param(start))));
        }

        if (range?.To is { } to)
        {
            var end = bound(StartOfUtcDay(to).AddDays(1));
            query = query.Where(Build(selector, body => Expression.LessThan(body, Param(end))));
        }

        return query;
    }

    public static IQueryable<T> WhereRange<T, TValue>(this IQueryable<T> query, Expression<Func<T, TValue?>> selector, RangeFilter<TValue>? range)
        where TValue : struct, INumber<TValue>
    {
        if (range is null)
        {
            return query;
        }

        if (range.Min is { } min)
        {
            TValue? lower = min;
            query = query.Where(Build(selector, body => Expression.GreaterThanOrEqual(body, Param(lower))));
        }

        if (range.Max is { } max)
        {
            TValue? upper = max;
            query = query.Where(Build(selector, body => Expression.LessThanOrEqual(body, Param(upper))));
        }

        return query;
    }

    public static IQueryable<T> WhereIn<T, TValue>(this IQueryable<T> query, Expression<Func<T, TValue>> selector, OneOrMany<TValue>? values)
    {
        if (values is null)
        {
            return query;
        }

        var list = values.Values.ToList();
        return query.Where(Build(selector, body => Expression.Call(Param(list), typeof(List<TValue>).GetMethod(nameof(List<TValue>.Contains))!, body)));
    }

    public static IQueryable<T> WhereIn<T, TValue>(this IQueryable<T> query, Expression<Func<T, TValue?>> selector, OneOrMany<TValue>? values)
        where TValue : struct
    {
        if (values is null)
        {
            return query;
        }

        var list = values.Values.Select(v => (TValue?)v).ToList();
        return query.Where(Build(selector, body => Expression.Call(Param(list), typeof(List<TValue?>).GetMethod(nameof(List<TValue?>.Contains))!, body)));
    }

    /// <summary>Çoka çok ilişki: hedeflerden en az biri verilen id'lerden biri.</summary>
    public static IQueryable<T> WhereAnyIn<T, TTarget>(this IQueryable<T> query, Expression<Func<T, IEnumerable<TTarget>>> selector, OneOrMany<Guid>? ids)
        where TTarget : __App__.Domain.Common.IEntity
    {
        if (ids is null)
        {
            return query;
        }

        var list = ids.Values.ToList();
        Expression<Func<TTarget, bool>> match = t => list.Contains(t.Id);
        var any = typeof(Enumerable).GetMethods().Single(m => m.Name == nameof(Enumerable.Any) && m.GetParameters().Length == 2)
            .MakeGenericMethod(typeof(TTarget));
        return query.Where(Build(selector, body => Expression.Call(any, body, match)));
    }

    private static readonly System.Reflection.MethodInfo ToLower = typeof(string).GetMethod(nameof(string.ToLower), Type.EmptyTypes)!;
    private static readonly System.Reflection.MethodInfo Contains = typeof(string).GetMethod(nameof(string.Contains), [typeof(string)])!;

    private static DateTimeOffset StartOfUtcDay(DateTimeOffset value) => new(value.UtcDateTime.Date, TimeSpan.Zero);

    private static Expression<Func<T, bool>> Build<T, TValue>(Expression<Func<T, TValue>> selector, Func<Expression, Expression> predicate) =>
        Expression.Lambda<Func<T, bool>>(predicate(selector.Body), selector.Parameters);

    /// <summary>Kapanış üzerinden üye erişimi: EF bunu SQL parametresine çevirir.</summary>
    private static MemberExpression Param<TValue>(TValue value) =>
        Expression.Property(Expression.Constant(new Box<TValue>(value)), nameof(Box<TValue>.Value));

    private sealed record Box<TValue>(TValue Value);
}
