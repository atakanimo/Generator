using Microsoft.EntityFrameworkCore;
using __App__.Domain.Auth;

namespace __App__.Application.Common.Abstractions;

/// <summary>Auth katmanının iç tabloları (docs/backend/auth.md); admin CRUD'ları yok.</summary>
public partial interface IAppDbContext
{
    DbSet<RefreshToken> RefreshTokens { get; }
    // @if register|password-reset
    DbSet<OtpCode> OtpCodes { get; }
    // @endif
}
