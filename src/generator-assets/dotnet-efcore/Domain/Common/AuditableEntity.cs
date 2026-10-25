namespace __App__.Domain.Common;

/// <summary>Kimlik (<see cref="EntityIds"/>) + zaman damgaları. Zaman damgalarını Infrastructure'daki interceptor yazar.</summary>
public abstract class AuditableEntity : IEntity, ITimestamped
{
    public EntityId Id { get; init; } = EntityIds.New();
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
