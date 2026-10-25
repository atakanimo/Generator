using System.Text.RegularExpressions;
using MongoDB.Driver;
using __App__.Application.Common.Errors;

namespace __App__.Infrastructure.Common;

/// <summary>
/// MongoDB: unique index ihlali (11000). Sağlayıcı istisnayı <c>DbUpdateException</c>'a sarmaz, doğrudan
/// <see cref="MongoBulkWriteException"/> gelir. Kullanılan kaydı silme FK'sız, servisteki kontrolle 409.
/// </summary>
public sealed partial class DbErrorClassifier : IDbErrorClassifier
{
    public DbConflict? Classify(Exception exception) => exception switch
    {
        MongoBulkWriteException bulk when bulk.WriteErrors.FirstOrDefault(e => e.Category == ServerErrorCategory.DuplicateKey) is { } error =>
            new DbConflict(DbConflictKind.Duplicate, IndexField().Match(error.Message).Groups[1].Value),
        MongoWriteException { WriteError.Category: ServerErrorCategory.DuplicateKey } write =>
            new DbConflict(DbConflictKind.Duplicate, IndexField().Match(write.WriteError.Message).Groups[1].Value),
        _ => null,
    };

    /// <summary>Mesajdaki index adının alanı: <c>… index: name_1 dup key …</c> → <c>name</c>.</summary>
    [GeneratedRegex(@"index: (\S+?)_-?1\b")]
    private static partial Regex IndexField();
}
