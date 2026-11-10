using __App__.Application.Auth;

namespace __App__.Infrastructure.Auth;

/// <summary>bcrypt cost 12 (BCrypt.Net-Next): Express (bcryptjs) ve Python (bcrypt) hash'leriyle karşılıklı uyumlu.</summary>
public sealed partial class BcryptPasswordHasher : IPasswordHasher
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

        if (!IsBcrypt(hash))
        {
            var verified = false;
            VerifyLegacyHash(hash, password, ref verified);
            return verified;
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

    public bool NeedsRehash(string? hash) =>
        !string.IsNullOrEmpty(hash) && (!IsBcrypt(hash) || BCrypt.Net.BCrypt.PasswordNeedsRehash(hash, Cost));

    private static bool IsBcrypt(string hash) => hash.StartsWith("$2", StringComparison.Ordinal);

    static partial void VerifyLegacyHash(string hash, string password, ref bool verified);
}
