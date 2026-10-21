using System.Text.Json.Serialization;

namespace __App__.Application.Common.Pagination;

/// <summary><c>POST get-all</c> gövdesi. Filtreler yalnızca <see cref="Filters"/> içinden okunur.</summary>
public sealed class ListBody<TFilters> where TFilters : class
{
    public TFilters? Filters { get; init; }
    public int? Page { get; init; }
    public int? Limit { get; init; }
    public string? SortBy { get; init; }
    public SortOrder? SortOrder { get; init; }
}

[JsonConverter(typeof(JsonStringEnumConverter<SortOrder>))]
public enum SortOrder
{
    [JsonStringEnumMemberName("asc")] Asc,
    [JsonStringEnumMemberName("desc")] Desc,
}

public sealed record PaginatedList<T>(IReadOnlyList<T> Items, int Total, bool HasMore, int CurrentPage, int CurrentLimit);

public static class ListDefaults
{
    public const int Page = 1;
    public const int Limit = 50;
    public const int MaxLimit = 100;
}
