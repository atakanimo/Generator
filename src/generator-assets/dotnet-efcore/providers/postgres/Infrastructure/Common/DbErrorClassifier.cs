using Microsoft.EntityFrameworkCore;
using Npgsql;
using __App__.Application.Common.Errors;

namespace __App__.Infrastructure.Common;

/// <summary>PostgreSQL: unique (23505) ve FK (23503) ihlali.</summary>
public sealed class DbErrorClassifier : IDbErrorClassifier
{
    public DbConflict? Classify(Exception exception) => exception switch
    {
        DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } pg } =>
            new DbConflict(DbConflictKind.Duplicate, pg.ConstraintName),
        DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.ForeignKeyViolation } } =>
            new DbConflict(DbConflictKind.InUse),
        _ => null,
    };
}
