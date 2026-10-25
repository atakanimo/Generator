using MongoDB.Bson;

namespace __App__.Domain.Common;

/// <summary>Kimlik tipi <c>EntityId</c> = <see cref="ObjectId"/> (MongoDB; takma ad <c>Directory.Build.props</c>'ta).</summary>
public static class EntityIds
{
    public static EntityId New() => ObjectId.GenerateNewId();

    public static bool TryParse(string? value, out EntityId id) => ObjectId.TryParse(value, out id);
}
