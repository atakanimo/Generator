using __App__.Domain.Users;

namespace __App__.Application.Auth;

/// <summary>
/// Host'a özel auth adımları (docs/backend/auth.md "Hook'lar"). Generator bu dosyayı bir kez yazar; değiştirmek serbest.
/// <c>Users</c> modeline eklenen alanlar (ör. bölge) burada doldurulur ya da oturum cevabına eklenir.
/// </summary>
public class AuthHooks
{
    /// <summary>Yeni kullanıcı kaydedilmeden önce (kayıt, Google / Apple ilk giriş).</summary>
    public virtual Task OnRegisterAsync(User user, CancellationToken cancellationToken) => Task.CompletedTask;

    /// <summary>Oturum cevabına (login, refresh, doğrulama, sosyal giriş) eklenecek alanlar; <c>null</c> = ek alan yok.</summary>
    public virtual Task<Dictionary<string, object>?> OnSessionAsync(User user, CancellationToken cancellationToken) =>
        Task.FromResult<Dictionary<string, object>?>(null);
    // @if account-delete

    /// <summary>Hesap silinmeden önce: kullanıcının host'a özel verisini temizleyin.</summary>
    public virtual Task OnAccountDeleteAsync(User user, CancellationToken cancellationToken) => Task.CompletedTask;
    // @endif
}
