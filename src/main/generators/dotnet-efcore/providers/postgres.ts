/** PostgreSQL (Npgsql): `map` / enum arrays and `json` in `jsonb` columns. */
import type { DotnetDbProvider } from './DotnetDbProvider.js';
import { migrationNote, relationalConfig, relationalSortKey } from './relational.js';

export const postgresProvider: DotnetDbProvider = {
  database: 'postgres',
  assetDir: 'postgres',
  referenceStrategy: 'relational',
  configure: (input) =>
    relationalConfig(input, {
      jsonConversion: 'HasJsonbConversion()',
      jsonDocument: { call: 'HasColumnType("jsonb")', usesCommon: false }
    }),
  sortKey: relationalSortKey,
  generateNote: migrationNote
};
