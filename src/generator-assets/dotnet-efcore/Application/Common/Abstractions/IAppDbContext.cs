namespace __App__.Application.Common.Abstractions;

/// <summary>DbSet'ler <c>IAppDbContext.Generated.cs</c>'te.</summary>
public partial interface IAppDbContext
{
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
