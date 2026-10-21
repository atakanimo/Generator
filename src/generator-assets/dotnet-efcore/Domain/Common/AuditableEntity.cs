namespace __App__.Domain.Common;

/// <summary>uuid v7 kimlik + zaman damgaları. Zaman damgalarını Infrastructure'daki interceptor yazar.</summary>
public abstract class AuditableEntity : IEntity, ITimestamped
{
    public Guid Id { get; init; } = Guid.CreateVersion7();
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
