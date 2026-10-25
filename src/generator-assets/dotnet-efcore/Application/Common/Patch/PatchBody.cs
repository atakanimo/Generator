using System.Runtime.CompilerServices;

namespace __App__.Application.Common.Patch;

/// <summary>
/// Update gövdesi (api-contract §5, JSON Merge Patch): gönderilmeyen alan değişmez, opsiyonel alana <c>null</c> alanı
/// temizler, zorunlu alan ve dizi <c>null</c> almaz (400). Gövdede <c>null</c> ile "gönderilmedi" ayrı olsun diye her
/// özelliğin <c>init</c>'i <see cref="Sent"/> çağırır: System.Text.Json setter'ı yalnız JSON'da olan özellik için çağırır.
/// </summary>
public abstract record PatchBody
{
    public const string NullNotAllowed = "Bu alan boş bırakılamaz.";

    private readonly HashSet<string> _sent = [];

    /// <summary>Özellik (C# adı, <c>nameof</c>) gövdede var mıydı (değeri <c>null</c> olsa da)?</summary>
    public bool Has(string property) => _sent.Contains(property);

    protected void Sent([CallerMemberName] string property = "") => _sent.Add(property);
}
