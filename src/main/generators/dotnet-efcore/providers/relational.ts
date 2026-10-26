/**
 * Relational providers (PostgreSQL, SQL Server; K13): tables, foreign keys with navigations, join tables for many-to-many
 * references, unique indexes, EF migrations. A dialect gives only what differs between them.
 */
import { constraintsForField } from '../../../../shared/fieldConstraints.js';
import { kebabCase } from '../../../utils/namingUtils.js';
import { DotnetUnsupportedError } from '../dotnetContext.js';
import type { DotnetFieldInfo } from '../dotnetContext.js';
import type { DotnetEntityConfig, DotnetEntityConfigInput } from './DotnetDbProvider.js';

export interface RelationalDialect {
  /** Call on `map` / enum-array properties: the provider asset under `Infrastructure/Common` that stores them as JSON. */
  jsonConversion: string;
  /** Call on a `json` (`JsonDocument`) property; `usesCommon`: it is a provider asset under `Infrastructure/Common`. */
  jsonDocument: { call: string; usesCommon: boolean };
  /** Unique text columns (string, string enum) need a length: the database cannot index unbounded text (SQL Server). */
  uniqueTextMaxLength?: number;
  /**
   * `false`: a `reference[]` to the entity itself is refused. Its join table has two cascading foreign keys to the same
   * table, which SQL Server rejects (error 1785, "multiple cascade paths"); PostgreSQL allows it.
   */
  selfManyToManyCascade?: boolean;
}

function snake(name: string): string {
  return kebabCase(name).replace(/-/g, '_');
}

export function relationalConfig({ app, names, fields }: DotnetEntityConfigInput, dialect: RelationalDialect): DotnetEntityConfig {
  const lines = [`builder.ToTable(${JSON.stringify(names.table)});`, 'builder.HasKey(x => x.Id);', 'builder.Property(x => x.Id).ValueGeneratedNever();'];
  let usesCommon = false;
  for (const f of fields) {
    switch (f.category) {
      case 'scalar':
        if (f.type === 'string' && f.required) lines.push(`builder.Property(x => x.${f.prop}).IsRequired();`);
        if (f.enumName && !f.enumNumeric) lines.push(`builder.Property(x => x.${f.prop}).HasConversion<string>();`);
        break;
      case 'enumArray':
      case 'map':
        usesCommon = true;
        lines.push(`builder.Property(x => x.${f.prop}).${dialect.jsonConversion};`);
        break;
      case 'object':
        lines.push(`builder.ComplexProperty(x => x.${f.prop}, b => b.ToJson());`);
        break;
      case 'objectArray':
        lines.push(`builder.ComplexCollection(x => x.${f.prop}, b => b.ToJson());`);
        break;
      case 'json':
        usesCommon ||= dialect.jsonDocument.usesCommon;
        lines.push(`builder.Property(x => x.${f.prop}).${dialect.jsonDocument.call};`);
        break;
      case 'ref':
        if (f.nav) {
          lines.push(
            `builder.HasOne(x => x.${f.nav}).WithMany().HasForeignKey(x => x.${f.fk}).IsRequired(${f.required}).OnDelete(DeleteBehavior.Restrict);`
          );
        } else lines.push(`builder.HasIndex(x => x.${f.fk});`);
        break;
      case 'refArray':
        if (f.nav && dialect.selfManyToManyCascade === false && f.target?.entity === names.entity) {
          throw new DotnetUnsupportedError(
            `${f.json}: SQL Server'da varlığın kendisine reference[] (çoka çok) ilişkisi desteklenmiyor (join tablosunda iki cascade FK, hata 1785).`
          );
        }
        if (f.nav) {
          lines.push(`builder.HasMany(x => x.${f.nav}).WithMany().UsingEntity(j => j.ToTable(${JSON.stringify(`${names.table}_${snake(f.prop)}`)}));`);
        }
        break;
    }
    if (f.source.unique && (f.category === 'scalar' || f.category === 'ref')) {
      const text = f.category === 'scalar' && (f.type === 'string' || (f.enumName && !f.enumNumeric));
      if (text && dialect.uniqueTextMaxLength) {
        const max = constraintsForField(f.source, f.source.constraints)?.maxLength ?? dialect.uniqueTextMaxLength;
        if (max > dialect.uniqueTextMaxLength) {
          throw new DotnetUnsupportedError(`${f.json}: unique metin alanı en fazla ${dialect.uniqueTextMaxLength} karakter olabilir (maxLength ${max}).`);
        }
        lines.push(`builder.Property(x => x.${f.prop}).HasMaxLength(${max});`);
      }
      lines.push(`builder.HasIndex(x => x.${f.category === 'ref' ? f.fk : f.prop}).IsUnique().HasDatabaseName(${JSON.stringify(`ux_${names.table}__${f.json}`)});`);
    }
  }
  lines.push('builder.HasIndex(x => x.CreatedAt);');
  return { lines, usings: usesCommon ? [`${app}.Infrastructure.Common`] : [] };
}

export const relationalSortKey = (_field: DotnetFieldInfo, member: string): string => `x => x.${member}`;

export function migrationNote(app: string): string {
  return `Şema değiştiyse migration ekleyin: dotnet ef migrations add <Ad> -p src/${app}.Infrastructure -s src/${app}.Api`;
}
