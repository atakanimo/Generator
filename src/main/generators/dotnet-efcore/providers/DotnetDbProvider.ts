/**
 * Database provider of a .NET host (plan backend-dotnet-database-providers K3): everything the generated code needs
 * to know about the database. `dotnetContext.ts` asks the provider; it never branches on the database name.
 */
import type { BackendDatabase } from '../../../../shared/backendDatabase.js';
import type { DotnetFieldInfo, dotnetModuleNames } from '../dotnetContext.js';

export interface DotnetEntityConfigInput {
  app: string;
  names: ReturnType<typeof dotnetModuleNames>;
  fields: DotnetFieldInfo[];
}

export interface DotnetEntityConfig {
  /** Statements of `<E>Configuration.Configure` (collection / table, keys, column mapping, relations, indexes). */
  lines: string[];
  /** Namespaces `<E>Configuration.cs` needs beyond the entity's own. */
  usings: string[];
}

export interface DotnetDbProvider {
  database: BackendDatabase;
  /** Folder under `generator-assets/dotnet-efcore/providers/`; its files replace the common assets on the same path (K4). */
  assetDir: string;
  /**
   * `relational`: foreign key + navigation, populate by join, join table for `reference[]`, FK Restrict on delete.
   * `document`: id / id list on the entity, populate after the read (`PopulateAsync`), in-use check before delete (K7, K8).
   */
  referenceStrategy: 'relational' | 'document';
  configure(input: DotnetEntityConfigInput): DotnetEntityConfig;
  /** Length a unique text column must have (SQL Server index key: `nvarchar(850)`); the validator enforces it too. */
  uniqueTextMaxLength?: number;
  /** Sort key of a sortable field (`SortMap.Add`); `member` is the entity member (property or FK). */
  sortKey(field: DotnetFieldInfo, member: string): string;
  /** Schema step after a generate (migration command, index note). */
  generateNote(app: string): string;
}
