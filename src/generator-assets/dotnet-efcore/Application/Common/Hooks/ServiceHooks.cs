using __App__.Application.Common.Errors;
using __App__.Application.Common.Pagination;

namespace __App__.Application.Common.Hooks;

/// <summary>
/// Servis kancaları; bütün Generator backend'lerinde (Express, .NET, Python) aynı set.
/// <c>Before*</c> bir <see cref="Error"/> dönerse işlem durur.
/// <c>After*</c> yazma kaydedildikten sonra yazılan / silinen kayıtla çalışır ve geri alınmaz: hata fırlatırsa cevap hata olur, kayıt durur.
/// Tutarlılık kontrolü <c>Before*</c> içindedir.
/// <c>MapRows</c> bir liste sayfasının (ya da getOne'ın tek) satırlarını tek çağrıda değiştirir: toplu IO, N+1 yok.
/// </summary>
public interface IServiceHooks<TEntity, TFilters, in TCreate, in TUpdate, TRow> where TFilters : class
{
    IQueryable<TEntity> BeforeList(IQueryable<TEntity> query, ListBody<TFilters> body);
    IQueryable<TEntity> BeforeGetById(IQueryable<TEntity> query);
    ValueTask<Error?> BeforeCreate(TEntity entity, TCreate body, CancellationToken cancellationToken);
    ValueTask<Error?> BeforeUpdate(TEntity entity, TUpdate body, CancellationToken cancellationToken);
    ValueTask<Error?> BeforeDelete(TEntity entity, CancellationToken cancellationToken);
    ValueTask AfterCreate(TEntity entity, CancellationToken cancellationToken);
    ValueTask AfterUpdate(TEntity entity, CancellationToken cancellationToken);
    ValueTask AfterDelete(TEntity entity, CancellationToken cancellationToken);

    /// <summary>list / getOne satırları cevaba yazılmadan önce (ör. hesaplanmış alan); aynı sırayla döner.</summary>
    ValueTask<IReadOnlyList<TRow>> MapRows(IReadOnlyList<TRow> rows, CancellationToken cancellationToken);

    /// <summary><c>null</c> → <c>createdAt desc, id desc</c>.</summary>
    IOrderedQueryable<TEntity>? DefaultSort(IQueryable<TEntity> query);
}

/// <summary>Boş varsayılan; modülün <c>*Hooks.cs</c> dosyası bundan türer ve yalnızca gerekeni ezer.</summary>
public abstract class ServiceHooks<TEntity, TFilters, TCreate, TUpdate, TRow> : IServiceHooks<TEntity, TFilters, TCreate, TUpdate, TRow>
    where TFilters : class
{
    public virtual IQueryable<TEntity> BeforeList(IQueryable<TEntity> query, ListBody<TFilters> body) => query;
    public virtual IQueryable<TEntity> BeforeGetById(IQueryable<TEntity> query) => query;
    public virtual ValueTask<Error?> BeforeCreate(TEntity entity, TCreate body, CancellationToken cancellationToken) => ValueTask.FromResult<Error?>(null);
    public virtual ValueTask<Error?> BeforeUpdate(TEntity entity, TUpdate body, CancellationToken cancellationToken) => ValueTask.FromResult<Error?>(null);
    public virtual ValueTask<Error?> BeforeDelete(TEntity entity, CancellationToken cancellationToken) => ValueTask.FromResult<Error?>(null);
    public virtual ValueTask AfterCreate(TEntity entity, CancellationToken cancellationToken) => ValueTask.CompletedTask;
    public virtual ValueTask AfterUpdate(TEntity entity, CancellationToken cancellationToken) => ValueTask.CompletedTask;
    public virtual ValueTask AfterDelete(TEntity entity, CancellationToken cancellationToken) => ValueTask.CompletedTask;
    public virtual ValueTask<IReadOnlyList<TRow>> MapRows(IReadOnlyList<TRow> rows, CancellationToken cancellationToken) => ValueTask.FromResult(rows);
    public virtual IOrderedQueryable<TEntity>? DefaultSort(IQueryable<TEntity> query) => null;
}
