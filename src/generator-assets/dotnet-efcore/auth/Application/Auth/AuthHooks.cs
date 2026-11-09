using __App__.Domain.Users;

namespace __App__.Application.Auth;

/// <summary>Projeye özel auth adımları (docs/backend/auth.md "Hook'lar"). Generator bir kez yazar.</summary>
public class AuthHooks
{
    /// <summary>Yeni kullanıcı kaydedilmeden önce (kayıt, Google / Apple ilk giriş).</summary>
    public virtual Task OnRegisterAsync(User user, CancellationToken cancellationToken) => Task.CompletedTask;

    /// <summary>Oturum cevabına (login, refresh, doğrulama, sosyal giriş) eklenecek alanlar; <c>null</c> = ek alan yok.</summary>
    public virtual Task<Dictionary<string, object>?> OnSessionAsync(User user, CancellationToken cancellationToken) =>
        Task.FromResult<Dictionary<string, object>?>(null);
    // @if account-delete

    public virtual Task OnAccountDeleteAsync(User user, CancellationToken cancellationToken) => Task.CompletedTask;
    // @endif
}
