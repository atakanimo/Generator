/**
 * SQL Server: `map` / enum arrays and `json` as JSON text (`nvarchar(max)`); unique text columns get a length (an index
 * key is at most 1700 bytes = `nvarchar(850)`). Collation and decimal precision: the provider's `AppDbContext.cs`.
 */
import type { DotnetDbProvider } from './DotnetDbProvider.js';
import { migrationNote, relationalConfig, relationalSortKey } from './relational.js';

const UNIQUE_TEXT_MAX_LENGTH = 850;

export const sqlServerProvider: DotnetDbProvider = {
  database: 'sqlserver',
  assetDir: 'sqlserver',
  referenceStrategy: 'relational',
  uniqueTextMaxLength: UNIQUE_TEXT_MAX_LENGTH,
  configure: (input) =>
    relationalConfig(input, {
      jsonConversion: 'HasJsonConversion()',
      jsonDocument: { call: 'HasJsonConversion()', usesCommon: true },
      uniqueTextMaxLength: UNIQUE_TEXT_MAX_LENGTH,
      selfManyToManyCascade: false
    }),
  sortKey: relationalSortKey,
  generateNote: migrationNote
};
