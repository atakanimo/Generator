import { hostDatabaseError, type BackendDatabase, type HostDatabase } from '../../../../shared/backendDatabase.js';
import { DotnetUnsupportedError } from '../dotnetContext.js';
import type { DotnetDbProvider } from './DotnetDbProvider.js';
import { mongoProvider } from './mongodb.js';
import { postgresProvider } from './postgres.js';
import { sqlServerProvider } from './sqlserver.js';

export type { DotnetDbProvider } from './DotnetDbProvider.js';

const PROVIDERS: Partial<Record<BackendDatabase, DotnetDbProvider>> = {
  postgres: postgresProvider,
  sqlserver: sqlServerProvider,
  mongodb: mongoProvider
};

/** Provider of the host's database; refused for a pair `dotnet-ef` does not generate for (`STACK_DATABASES`). */
export function dotnetDbProvider(db: HostDatabase): DotnetDbProvider {
  const error = hostDatabaseError('dotnet-ef', db);
  const provider = PROVIDERS[db.database];
  if (error || !provider) throw new DotnetUnsupportedError(error ?? `dotnet-ef: ${db.database} sağlayıcısı yok.`);
  return provider;
}
