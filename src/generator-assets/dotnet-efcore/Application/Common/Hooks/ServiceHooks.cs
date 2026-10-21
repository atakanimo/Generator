using __App__.Application.Common.Errors;
using __App__.Application.Common.Pagination;

namespace __App__.Application.Common.Hooks;

/// <summary>Servis kancaları. <c>Before*</c> bir <see cref="Error"/> dönerse işlem durur.</summary>
public interface IServiceHooks<TEntity, TFilters, in TCreate, in TUpdate> where TFilters : class
{
    IQueryable<TEntity> BeforeList(IQueryable<TEntity> query, ListBody<TFilters> body);
    IQueryable<TEntity> BeforeGetById(IQueryable<TEntity> query);
    ValueTask<Error?> BeforeCreate(TEntity entity, TCreate body, CancellationToken cancellationToken);
    ValueTask<Error?> BeforeUpdate(TEntity entity, TUpdate body, CancellationToken cancellationToken);
    ValueTask<Error?> BeforeDelete(TEntity entity, CancellationToken cancellationToken);

    /// <summary><c>null</c> → <c>createdAt desc, id desc</c>.</summary>
    IOrderedQueryable<TEntity>? DefaultSort(IQueryable<TEntity> query);
}

/// <summary>Boş varsayılan; modülün <c>*Hooks.cs</c> dosyası bundan türer ve yalnızca gerekeni ezer.</summary>
public abstract class ServiceHooks<TEntity, TFilters, TCreate, TUpdate> : IServiceHooks<TEntity, TFilters, TCreate, TUpdate>
    where TFilters : class
{
    public virtual IQueryable<TEntity> BeforeList(IQueryable<TEntity> query, ListBody<TFilters> body) => query;
    public virtual IQueryable<TEntity> BeforeGetById(IQueryable<TEntity> query) => query;
    public virtual ValueTask<Error?> BeforeCreate(TEntity entity, TCreate body, CancellationToken cancellationToken) => ValueTask.FromResult<Error?>(null);
    public virtual ValueTask<Error?> BeforeUpdate(TEntity entity, TUpdate body, CancellationToken cancellationToken) => ValueTask.FromResult<Error?>(null);
    public virtual ValueTask<Error?> BeforeDelete(TEntity entity, CancellationToken cancellationToken) => ValueTask.FromResult<Error?>(null);
    public virtual IOrderedQueryable<TEntity>? DefaultSort(IQueryable<TEntity> query) => null;
}
