/**
 * MongoDB (`MongoDB.EntityFrameworkCore`, plan backend-dotnet-database-providers K9–K12, K15): one collection per entity,
 * element names = JSON names (written per property: the provider's camel-case convention follows the current culture),
 * `DateTimeOffset` as BSON date, string enums by their JSON value, embedded objects as owned sub-documents, `json` as
 * JSON text. No migrations: `EnsureCreatedAsync` builds collections and indexes at startup.
 */
import { pascalCase } from '../../../utils/namingUtils.js';
import type { DotnetFieldInfo } from '../dotnetContext.js';
import type { DotnetDbProvider, DotnetEntityConfig, DotnetEntityConfigInput } from './DotnetDbProvider.js';

const BSON_DATE = '.HasBsonRepresentation(BsonType.DateTime)';

function element(param: string, prop: string, json: string, extra = ''): string {
  return `${param === 'x' ? 'builder' : 'b'}.Property(${param} => ${param}.${prop}).HasElementName(${JSON.stringify(json)})${extra};`;
}

/** `OwnsOne` / `OwnsMany` block; continuation lines carry their own indentation (the template indents the first). */
function owned(f: DotnetFieldInfo): string {
  const subs = (f.source.object?.fields ?? []).map((s) => element('y', pascalCase(s.name), s.name, s.kind === 'date' ? BSON_DATE : ''));
  const method = f.category === 'object' ? 'OwnsOne' : 'OwnsMany';
  return [`builder.${method}(x => x.${f.prop}, b =>`, '{', `    b.HasElementName(${JSON.stringify(f.json)});`, ...subs.map((l) => `    ${l}`), '});']
    .map((line, i) => (i === 0 ? line : `        ${line}`))
    .join('\n');
}

/**
 * Optional unique field: the provider writes `null` as a value (no `$unset`), and a plain unique index lets only one
 * document hold it; the second empty value would be 409. A partial filter on the BSON type indexes only documents
 * that have a value (PostgreSQL / SQL Server: NULLs never collide; Python: sparse). The service check skips `null` too.
 */
function optionalUniqueFilter(f: DotnetFieldInfo): string {
  if (f.required) return '';
  const types =
    f.category === 'ref'
      ? ['objectId', 'binData']
      : f.type === 'string' || (f.enumName && !f.enumNumeric)
        ? ['string']
        : f.enumName || ['int', 'long', 'double', 'decimal'].includes(f.type)
          ? ['number']
          : f.type === 'DateTimeOffset'
            ? ['date']
            : f.type === 'bool'
              ? ['bool']
              : [];
  if (!types.length) return '';
  const type = types.length === 1 ? JSON.stringify(types[0]) : `new BsonArray { ${types.map((t) => JSON.stringify(t)).join(', ')} }`;
  return `.HasCreateIndexOptions(new CreateIndexOptions<BsonDocument> { PartialFilterExpression = new BsonDocument(${JSON.stringify(f.json)}, new BsonDocument("$type", ${type})) })`;
}

function mongoConfig({ app, names, fields }: DotnetEntityConfigInput): DotnetEntityConfig {
  const lines = [`builder.ToCollection(${JSON.stringify(names.table)});`, 'builder.HasKey(x => x.Id);', 'builder.Property(x => x.Id).ValueGeneratedNever();'];
  let usesCommon = false;
  for (const f of fields) {
    switch (f.category) {
      case 'scalar':
        if (f.enumName && !f.enumNumeric) {
          usesCommon = true;
          lines.push(element('x', f.prop, f.json, '.HasEnumValueConversion()'));
        } else lines.push(element('x', f.prop, f.json, f.type === 'DateTimeOffset' ? BSON_DATE : ''));
        break;
      case 'enumArray':
        // The provider wraps a converted collection (`{ _v: [...] }`) and cannot read it back, and stores an enum list by
        // ordinal: a string enum list is JSON text with the values; a numeric one stays a BSON array of its numbers.
        if (f.enumNumeric) lines.push(element('x', f.prop, f.json));
        else {
          usesCommon = true;
          lines.push(element('x', f.prop, f.json, '.HasJsonConversion()'));
        }
        break;
      case 'json':
        usesCommon = true;
        lines.push(element('x', f.prop, f.json, '.HasJsonConversion()'));
        break;
      case 'object':
      case 'objectArray':
        lines.push(owned(f));
        break;
      case 'ref':
        lines.push(element('x', f.fk!, f.json));
        break;
      default:
        lines.push(element('x', f.prop, f.json));
    }
    if (f.source.unique && (f.category === 'scalar' || f.category === 'ref')) {
      lines.push(`builder.HasIndex(x => x.${f.category === 'ref' ? f.fk : f.prop}).IsUnique()${optionalUniqueFilter(f)};`);
    }
  }
  lines.push(element('x', 'CreatedAt', 'createdAt', BSON_DATE), element('x', 'UpdatedAt', 'updatedAt', BSON_DATE), 'builder.HasIndex(x => x.CreatedAt);');
  const driver = lines.some((l) => l.includes('CreateIndexOptions<')) ? ['MongoDB.Driver'] : [];
  return {
    lines,
    usings: ['MongoDB.Bson', ...driver, 'MongoDB.EntityFrameworkCore.Extensions', ...(usesCommon ? [`${app}.Infrastructure.Common`] : [])]
  };
}

export const mongoProvider: DotnetDbProvider = {
  database: 'mongodb',
  assetDir: 'mongodb',
  referenceStrategy: 'document',
  configure: mongoConfig,
  // The driver cannot sort a nullable enum stored through a converter; `?? default` sorts `null` with the first member.
  sortKey: (f, member) => (f.category === 'scalar' && f.enumName && !f.enumNumeric && !f.required ? `x => x.${member} ?? default` : `x => x.${member}`),
  generateNote: () => 'MongoDB: migration yok; collection ve index\'leri açılışta Database:EnsureIndexesOnStartup kurar (yeni index dahil).'
};
