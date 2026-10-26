namespace __App__.Infrastructure.Common;

/// <summary>
/// İlişkisel unique index adı <c>ux_&lt;tablo&gt;__&lt;jsonAlan&gt;</c> (generator, <c>HasDatabaseName</c>): 409 mesajı her
/// sağlayıcıda JSON alan adını verir. Bu biçimde olmayan (elle yazılmış) index'te ad olduğu gibi döner.
/// </summary>
public static class UniqueIndexName
{
    private const string Separator = "__";

    public static string Field(string? indexName)
    {
        if (string.IsNullOrEmpty(indexName))
        {
            return string.Empty;
        }

        var at = indexName.LastIndexOf(Separator, StringComparison.Ordinal);
        return indexName.StartsWith("ux_", StringComparison.Ordinal) && at > 0 ? indexName[(at + Separator.Length)..] : indexName;
    }
}
