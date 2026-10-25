using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using __App__.Application.Common.Abstractions;
using __App__.Application.Common.Errors;
using __App__.Application.Common.Hooks;
using __App__.Application.Common.Pagination;
using __App__.Application.Common.Results;
using __App__.Domain.Common;

namespace __App__.Application.Common.Services;

/// <summary>
/// CRUD gövdeleri tek yerde. Modül servisi (G) yalnızca modüle özel parçaları verir: tablo, projeksiyon, sıralama,
/// filtre, eşleme, unique kontrolü. Davranışı değiştirmek için modülün <c>.Custom.cs</c> dosyasında <c>override</c>.
/// </summary>
public abstract class CrudServiceBase<TEntity, TRow, TCreate, TUpdate, TFilters>(
    IAppDbContext db,
    IServiceHooks<TEntity, TFilters, TCreate, TUpdate, TRow> hooks) : ICrudService<TRow, TCreate, TUpdate, TFilters>
    where TEntity : class, IEntity, ITimestamped
    where TFilters : class
{
    protected IAppDbContext Db => db;
    protected IServiceHooks<TEntity, TFilters, TCreate, TUpdate, TRow> Hooks => hooks;

    protected abstract DbSet<TEntity> Set { get; }
    protected abstract Expression<Func<TEntity, TRow>> Row { get; }
    /// <summary>Create / update cevabının projeksiyonu. Varsayılan <see cref="Row"/>; populate edilen ilişkilerde id'ye iner.</summary>
    protected virtual Expression<Func<TEntity, TRow>> WriteRow => Row;
    /// <summary>Liste sayfasının projeksiyonu. Varsayılan <see cref="Row"/>; <c>detailOnly</c> kolonları <c>null</c> olan modülde ayrı.</summary>
    protected virtual Expression<Func<TEntity, TRow>> ListRow => Row;
    protected abstract SortMap<TEntity> Sort { get; }
    protected abstract IQueryable<TEntity> ApplyFilters(IQueryable<TEntity> query, TFilters? filters);
    protected abstract TEntity MapCreate(TCreate body);
    protected abstract void MapUpdate(TEntity entity, TUpdate body);

    /// <summary>Unique alanlar: çakışma varsa 409. <paramref name="entity"/> kendi kaydını saymaz.</summary>
    protected virtual Task<Error?> CheckUniqueAsync(TEntity entity, CancellationToken cancellationToken) =>
        Task.FromResult<Error?>(null);

    /// <summary>Tekil ilişkiler: hedef kayıt yoksa 400.</summary>
    protected virtual Task<Error?> CheckRelationsAsync(TEntity entity, CancellationToken cancellationToken) =>
        Task.FromResult<Error?>(null);

    /// <summary>Çoka çok ilişkiler: id'lerden hedef kayıtları yükleyip entity'ye bağlar.</summary>
    protected virtual Task<Error?> ApplyCreateRelationsAsync(TEntity entity, TCreate body, CancellationToken cancellationToken) =>
        Task.FromResult<Error?>(null);

    protected virtual Task<Error?> ApplyUpdateRelationsAsync(TEntity entity, TUpdate body, CancellationToken cancellationToken) =>
        Task.FromResult<Error?>(null);

    /// <summary>Silinecek kayıda başka kayıtlar reference veriyor mu (FK'sız veritabanı; varsa 409). Varsayılan: kontrol yok.</summary>
    protected virtual Task<Error?> CheckInUseAsync(TEntity entity, CancellationToken cancellationToken) =>
        Task.FromResult<Error?>(null);

    /// <summary>Silinecek kayda işaret eden id listelerinden kaydı çıkarır (FK'sız veritabanı; aynı kayıtta yazılır). Varsayılan: yok.</summary>
    protected virtual Task DetachReferencesAsync(TEntity entity, CancellationToken cancellationToken) =>
        Task.CompletedTask;

    /// <summary>List / getOne satırlarının populate edilen reference'ları okumadan sonra (join'siz veritabanı). Varsayılan: satırlar aynen.</summary>
    protected virtual Task<IReadOnlyList<TRow>> PopulateAsync(IReadOnlyList<TRow> rows, CancellationToken cancellationToken) =>
        Task.FromResult(rows);

    /// <summary>Update / delete için yüklenen entity (çoka çok koleksiyonlar <c>Include</c> edilir).</summary>
    protected virtual IQueryable<TEntity> ForUpdate(IQueryable<TEntity> query) => query;

    /// <summary>Her sorgunun kapsamı (ownership, D4). Varsayılan: bütün kayıtlar.</summary>
    protected virtual IQueryable<TEntity> Scope(IQueryable<TEntity> query) => query;

    public virtual async Task<Result<PaginatedList<TRow>>> ListAsync(ListBody<TFilters> body, CancellationToken cancellationToken)
    {
        var query = ApplyFilters(hooks.BeforeList(Scope(Set.AsNoTracking()), body), body.Filters)
            .ApplySort(body.SortBy, body.SortOrder, Sort, q => hooks.DefaultSort(q) ?? q.OrderByDefault());
        var page = await query.ToRowPageAsync(ListRow, body.Page, body.Limit, cancellationToken);
        var rows = await PopulateAsync(page.Items, cancellationToken);
        return Result.Ok(page with { Items = await hooks.MapRows(rows, cancellationToken) });
    }

    public virtual async Task<Result<TRow>> GetByIdAsync(EntityId id, CancellationToken cancellationToken)
    {
        var row = await hooks.BeforeGetById(Scope(Set.AsNoTracking()))
            .Where(x => x.Id == id)
            .FirstRowOrDefaultAsync(Row, cancellationToken);
        if (row is null)
        {
            return Error.NotFound();
        }

        var mapped = await hooks.MapRows(await PopulateAsync([row], cancellationToken), cancellationToken);
        return Result.Ok(mapped[0]);
    }

    public virtual async Task<Result<TRow>> CreateAsync(TCreate body, CancellationToken cancellationToken)
    {
        var entity = MapCreate(body);
        if ((await ApplyCreateRelationsAsync(entity, body, cancellationToken) ?? await CheckRelationsAsync(entity, cancellationToken)
            ?? await CheckUniqueAsync(entity, cancellationToken)) is { } invalid)
        {
            return invalid;
        }

        if (await hooks.BeforeCreate(entity, body, cancellationToken) is { } error)
        {
            return error;
        }

        Set.Add(entity);
        await db.SaveChangesAsync(cancellationToken);
        await hooks.AfterCreate(entity, cancellationToken);
        return Result.Ok(await ReadRowAsync(entity.Id, cancellationToken), Messages.Created);
    }

    public virtual async Task<Result<TRow>> UpdateAsync(EntityId id, TUpdate body, CancellationToken cancellationToken)
    {
        var entity = await ForUpdate(Scope(Set)).FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (entity is null)
        {
            return Error.NotFound();
        }

        MapUpdate(entity, body);
        if ((await ApplyUpdateRelationsAsync(entity, body, cancellationToken) ?? await CheckRelationsAsync(entity, cancellationToken)
            ?? await CheckUniqueAsync(entity, cancellationToken)) is { } invalid)
        {
            return invalid;
        }

        if (await hooks.BeforeUpdate(entity, body, cancellationToken) is { } error)
        {
            return error;
        }

        await db.SaveChangesAsync(cancellationToken);
        await hooks.AfterUpdate(entity, cancellationToken);
        return Result.Ok(await ReadRowAsync(entity.Id, cancellationToken), Messages.Updated);
    }

    public virtual async Task<Result> DeleteAsync(EntityId id, CancellationToken cancellationToken)
    {
        var entity = await ForUpdate(Scope(Set)).FirstOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (entity is null)
        {
            return Result.Fail(Error.NotFound());
        }

        if ((await CheckInUseAsync(entity, cancellationToken) ?? await hooks.BeforeDelete(entity, cancellationToken)) is { } error)
        {
            return Result.Fail(error);
        }

        await DetachReferencesAsync(entity, cancellationToken);
        Set.Remove(entity);
        await db.SaveChangesAsync(cancellationToken);
        await hooks.AfterDelete(entity, cancellationToken);
        return Result.Ok(Messages.Deleted);
    }

    /// <summary>Kaydedilen satır <see cref="WriteRow"/> ile yeniden okunur.</summary>
    protected Task<TRow> ReadRowAsync(EntityId id, CancellationToken cancellationToken) =>
        Set.AsNoTracking().Where(x => x.Id == id).FirstRowAsync(WriteRow, cancellationToken);

    /// <summary>Unique kontrol yardımcısı: aynı değerde başka kayıt var mı.</summary>
    protected async Task<Error?> ConflictIfExistsAsync(
        Expression<Func<TEntity, bool>> sameValue, EntityId ownId, string field, CancellationToken cancellationToken) =>
        await Set.Where(sameValue).AnyAsync(x => x.Id != ownId, cancellationToken)
            ? Error.Conflict(string.Format(Messages.Duplicate, field))
            : null;
}
