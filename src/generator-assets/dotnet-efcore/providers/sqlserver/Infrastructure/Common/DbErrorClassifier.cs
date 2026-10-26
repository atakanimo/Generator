using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using __App__.Application.Common.Errors;

namespace __App__.Infrastructure.Common;

/// <summary>SQL Server: unique index (2601) / unique kısıt (2627) ve FK (547) ihlali.</summary>
public sealed partial class DbErrorClassifier : IDbErrorClassifier
{
    public DbConflict? Classify(Exception exception) => exception switch
    {
        DbUpdateException { InnerException: SqlException { Number: 2601 or 2627 } sql } =>
            new DbConflict(DbConflictKind.Duplicate, UniqueIndexName.Field(ConstraintName().Match(sql.Message).Groups[1].Value)),
        DbUpdateException { InnerException: SqlException { Number: 547 } } => new DbConflict(DbConflictKind.InUse),
        _ => null,
    };

    /// <summary>Mesajdaki index / kısıt adı: <c>… unique index 'ux_event_types__name'</c>.</summary>
    [GeneratedRegex("(?:index|constraint) '([^']+)'")]
    private static partial Regex ConstraintName();
}
