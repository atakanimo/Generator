namespace __App__.Application.Common.Errors;

public enum DbConflictKind
{
    /// <summary>Unique ihlali; <see cref="DbConflict.Field"/> ihlal edilen kısıt / index.</summary>
    Duplicate,
    /// <summary>Kayıt başka kayıtlar tarafından kullanılıyor (FK).</summary>
    InUse,
}

public sealed record DbConflict(DbConflictKind Kind, string? Field = null);

/// <summary>
/// Servis kontrollerinden kaçan veritabanı kısıt ihlallerini tanır (yarış durumları → 409). Uygulaması veritabanı
/// sağlayıcısının asset'i: <c>Infrastructure/Common/DbErrorClassifier.cs</c>.
/// </summary>
public interface IDbErrorClassifier
{
    /// <summary>Kısıt ihlali değilse <c>null</c>.</summary>
    DbConflict? Classify(Exception exception);
}
