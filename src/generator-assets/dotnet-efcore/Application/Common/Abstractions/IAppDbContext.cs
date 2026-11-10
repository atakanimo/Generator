using System.Linq.Expressions;

namespace __App__.Application.Common.Abstractions;

/// <summary>DbSet'ler <c>IAppDbContext.Generated.cs</c>'te.</summary>
public partial interface IAppDbContext
{
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);

    Task<IAppTransaction> BeginTransactionAsync(CancellationToken cancellationToken = default);

    void ClearTracking();

    TProperty OriginalValue<TEntity, TProperty>(TEntity entity, Expression<Func<TEntity, TProperty>> property)
        where TEntity : class;
}

public interface IAppTransaction : IAsyncDisposable
{
    Task CommitAsync(CancellationToken cancellationToken = default);

    Task RollbackAsync(CancellationToken cancellationToken = default);
}
