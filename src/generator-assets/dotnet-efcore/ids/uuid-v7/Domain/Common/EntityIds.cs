namespace __App__.Domain.Common;

/// <summary>Kimlik tipi <c>EntityId</c> = <see cref="Guid"/> (uuid v7; takma ad <c>Directory.Build.props</c>'ta).</summary>
public static class EntityIds
{
    public static EntityId New() => Guid.CreateVersion7();

    public static bool TryParse(string? value, out EntityId id) => Guid.TryParse(value, out id);
}
