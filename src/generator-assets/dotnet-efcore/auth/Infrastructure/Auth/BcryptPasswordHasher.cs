using __App__.Application.Auth;

namespace __App__.Infrastructure.Auth;

/// <summary>bcrypt cost 12 (BCrypt.Net-Next): Express (bcryptjs) ve Python (bcrypt) hash'leriyle karşılıklı uyumlu.</summary>
public sealed class BcryptPasswordHasher : IPasswordHasher
{
    public const int Cost = 12;

    private static readonly Lazy<string> DummyHash = new(() => BCrypt.Net.BCrypt.HashPassword("dummy-password-for-timing-1", Cost));

    public string Hash(string password) => BCrypt.Net.BCrypt.HashPassword(password, Cost);

    public bool Verify(string? hash, string password)
    {
        if (string.IsNullOrEmpty(hash))
        {
            BCrypt.Net.BCrypt.Verify(password, DummyHash.Value);
            return false;
        }

        try
        {
            return BCrypt.Net.BCrypt.Verify(password, hash);
        }
        catch (BCrypt.Net.SaltParseException)
        {
            return false;
        }
    }
}
