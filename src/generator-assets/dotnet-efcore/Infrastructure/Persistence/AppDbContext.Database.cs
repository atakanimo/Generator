using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using __App__.Application.Common.Abstractions;

namespace __App__.Infrastructure.Persistence;

public sealed partial class AppDbContext
{
    public async Task<IAppTransaction> BeginTransactionAsync(CancellationToken cancellationToken = default) =>
        new AppTransaction(await Database.BeginTransactionAsync(cancellationToken));

    public void ClearTracking() => ChangeTracker.Clear();

    public TProperty OriginalValue<TEntity, TProperty>(TEntity entity, Expression<Func<TEntity, TProperty>> property)
        where TEntity : class =>
        Entry(entity).Property(property).OriginalValue;

    private sealed class AppTransaction(IDbContextTransaction transaction) : IAppTransaction
    {
        public Task CommitAsync(CancellationToken cancellationToken = default) => transaction.CommitAsync(cancellationToken);

        public Task RollbackAsync(CancellationToken cancellationToken = default) => transaction.RollbackAsync(cancellationToken);

        public ValueTask DisposeAsync() => transaction.DisposeAsync();
    }
}
