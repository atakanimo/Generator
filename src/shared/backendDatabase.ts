/**
 * Database and id type of a backend host (plan backend-dotnet-database-providers K2, K14): chosen when the host is
 * bootstrapped, stored in the manifest (`workspace.database`, `workspace.idType`) and never changed afterwards.
 */

export type BackendStack = 'nodejs-mongoose' | 'dotnet-ef' | 'python-fastapi';
export type BackendDatabase = 'postgres' | 'sqlserver' | 'mongodb';
export type BackendIdType = 'uuid-v7' | 'objectid';

export interface HostDatabase {
  database: BackendDatabase;
  idType: BackendIdType;
}

export const DATABASE_LABELS: Record<BackendDatabase, string> = {
  postgres: 'PostgreSQL',
  sqlserver: 'SQL Server',
  mongodb: 'MongoDB'
};

/** EF Core provider package of each database a .NET host can use (host scan). */
export const DOTNET_DATABASE_PACKAGES: Partial<Record<BackendDatabase, string>> = {
  postgres: 'Npgsql.EntityFrameworkCore.PostgreSQL',
  sqlserver: 'Microsoft.EntityFrameworkCore.SqlServer',
  mongodb: 'MongoDB.EntityFrameworkCore'
};

/** Pairs each stack generates for. Express and Python: MongoDB only (K14). */
export const STACK_DATABASES: Record<BackendStack, Array<{ database: BackendDatabase; idTypes: BackendIdType[] }>> = {
  'dotnet-ef': [
    { database: 'postgres', idTypes: ['uuid-v7'] },
    { database: 'sqlserver', idTypes: ['uuid-v7'] },
    { database: 'mongodb', idTypes: ['uuid-v7', 'objectid'] }
  ],
  'nodejs-mongoose': [{ database: 'mongodb', idTypes: ['objectid'] }],
  'python-fastapi': [{ database: 'mongodb', idTypes: ['objectid'] }]
};

/** Written into manifests that predate the two fields (one-time migration, K2): what each stack generated before. */
export const LEGACY_HOST_DATABASE: Record<BackendStack, HostDatabase> = {
  'dotnet-ef': { database: 'postgres', idType: 'uuid-v7' },
  'nodejs-mongoose': { database: 'mongodb', idType: 'objectid' },
  'python-fastapi': { database: 'mongodb', idType: 'objectid' }
};

/** The stack's single allowed pair (Express, Python); stacks with a choice take it from the bootstrap dialog. */
export function onlyHostDatabase(stack: BackendStack): HostDatabase {
  const [entry, ...rest] = STACK_DATABASES[stack];
  if (rest.length || entry.idTypes.length !== 1) throw new Error(`${stack}: veritabanı seçimi gerekli.`);
  return { database: entry.database, idType: entry.idTypes[0] };
}

/** Error message for a pair the stack does not generate for; `null` when allowed. */
export function hostDatabaseError(stack: BackendStack, db: Partial<HostDatabase> | undefined): string | null {
  const entry = STACK_DATABASES[stack].find((e) => e.database === db?.database);
  if (!entry) {
    return `${stack}: veritabanı "${db?.database ?? '(yok)'}" desteklenmiyor (${STACK_DATABASES[stack].map((e) => e.database).join(', ')}).`;
  }
  if (!db?.idType || !entry.idTypes.includes(db.idType)) {
    return `${stack} + ${entry.database}: id tipi "${db?.idType ?? '(yok)'}" desteklenmiyor (${entry.idTypes.join(', ')}).`;
  }
  return null;
}
