using __App__.Application.Common.Pagination;
using __App__.Application.Common.Results;

namespace __App__.Application.Common.Services;

/// <summary>
/// Bütün modül servislerinin ortak CRUD imzaları. Modül interface'i (<c>ISymbolTypeService</c>) bundan türer;
/// modüle özel metotlar o interface'in <c>.Custom.cs</c> dosyasına eklenir.
/// </summary>
public interface ICrudService<TRow, in TCreate, in TUpdate, TFilters> where TFilters : class
{
    Task<Result<PaginatedList<TRow>>> ListAsync(ListBody<TFilters> body, CancellationToken cancellationToken);
    Task<Result<TRow>> GetByIdAsync(Guid id, CancellationToken cancellationToken);
    Task<Result<TRow>> CreateAsync(TCreate body, CancellationToken cancellationToken);
    Task<Result<TRow>> UpdateAsync(Guid id, TUpdate body, CancellationToken cancellationToken);
    Task<Result> DeleteAsync(Guid id, CancellationToken cancellationToken);
}
