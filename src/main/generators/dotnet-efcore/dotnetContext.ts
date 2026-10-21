/**
 * NormalizedModel → .NET EF Core template context (plan backend-dotnet-efcore §5, §7).
 * Every decision lives here; templates only loop over the prepared lines.
 *
 * Contexts are built for the whole module list at once: references resolve their target (FK + navigation,
 * populated fields with the target's C# types) only when the target is in the list.
 */
import type {
  FilterType,
  NormalOperation,
  NormalizedField,
  NormalizedModel,
  NormalizedObjectSubField
} from '../../../shared/normalizedModel.js';
import { NORMAL_OPERATIONS } from '../../../shared/normalizedModel.js';
import { kebabCase, moduleNameFromEntity, pascalCase, pluralize, singularize } from '../../utils/namingUtils.js';
import type { DotnetRegistryModule } from './DotnetHostBootstrap.js';

/** Provided by `AuditableEntity`; never emitted as model fields. */
const BASE_FIELDS = new Set(['id', '_id', 'createdAt', 'updatedAt']);
const SCALAR_KINDS = new Set(['string', 'number', 'decimal', 'boolean', 'date', 'enum']);

export class DotnetUnsupportedError extends Error {}

export interface DotnetEnum {
  name: string;
  members: Array<{ name: string; value: string; literal: string }>;
}

/** Embedded object class (EF complex type, `ToJson()`). */
export interface DotnetComplexType {
  name: string;
  props: string[];
}

/** Populated reference shape in the Row (`{ id, ...populate }`). */
export interface DotnetRefRecord {
  name: string;
  params: string[];
}

type Category = 'scalar' | 'scalarArray' | 'enumArray' | 'object' | 'objectArray' | 'json' | 'map' | 'ref' | 'refArray';

interface FieldInfo {
  source: NormalizedField;
  json: string;
  /** Property name in Row / bodies / filters (JSON name = `json`). */
  prop: string;
  category: Category;
  /** C# value type without `?` as seen in Row / bodies for non-relation fields. */
  type: string;
  isValueType: boolean;
  required: boolean;
  defaultLiteral?: string;
  enumName?: string;
  /** ref: FK property; refArray: navigation collection. */
  fk?: string;
  nav?: string;
  target?: TargetInfo;
  populate?: string[];
}

interface TargetInfo {
  entity: string;
  folder: string;
  model: NormalizedModel;
}

export interface DotnetBodyContext {
  name: string;
  validator: string;
  props: string[];
  rules: string[];
  mapCreate: string[];
  mapUpdate: string[];
  /** `ApplyCreateRelationsAsync` / `ApplyUpdateRelationsAsync` statements (m-n). */
  relations: string[];
}

export interface DotnetModuleContext {
  app: string;
  entity: string;
  folder: string;
  route: string;
  table: string;
  enums: DotnetEnum[];
  complexTypes: DotnetComplexType[];
  refRecords: DotnetRefRecord[];
  domainUsings: string[];
  dtoUsings: string[];
  entityProps: string[];
  rowParams: string[];
  rowArgs: string[];
  /** Create / update response projection; only when populated references exist. */
  writeRowArgs: string[];
  hasWriteRow: boolean;
  filterProps: string[];
  filterCalls: string[];
  sortEntries: string[];
  configLines: string[];
  infraUsings: string[];
  usesErrors: boolean;
  uniqueChecks: string[];
  relationChecks: string[];
  relationLoaders: Array<{ nav: string; folder: string; json: string }>;
  updateIncludes: string[];
  normal: { create: DotnetBodyContext; update: DotnetBodyContext };
  admin: { create: DotnetBodyContext; update: DotnetBodyContext };
  normalOperations: NormalOperation[];
  /** Requested normal operations the contract does not allow (writes without ownership, create on `self`). */
  droppedOperations: NormalOperation[];
  ownership?: { kind: 'field' | 'self'; fk?: string; filterProp?: string };
  ops: Record<NormalOperation, boolean>;
  normalAuth: 'anonymous' | 'authenticated';
  hasAdmin: boolean;
  usesSerialization: boolean;
  usesJson: boolean;
}

export function dotnetModuleNames(entityName: string) {
  const entity = singularize(pascalCase(entityName));
  const folder = pluralize(entity);
  return {
    entity,
    folder,
    route: `/api/${moduleNameFromEntity(entityName)}`,
    table: snake(folder)
  };
}

function snake(name: string): string {
  return kebabCase(name).replace(/-/g, '_');
}

function csString(value: string): string {
  return JSON.stringify(value);
}

function enumMemberName(value: string): string {
  const name = value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return /^[0-9]/.test(name) || !name ? `V${name}` : name;
}

const SCALAR_TYPES: Record<string, { type: string; isValueType: boolean }> = {
  string: { type: 'string', isValueType: false },
  number: { type: 'double', isValueType: true },
  decimal: { type: 'decimal', isValueType: true },
  boolean: { type: 'bool', isValueType: true },
  date: { type: 'DateTimeOffset', isValueType: true }
};

function mapValueType(field: NormalizedField): string {
  const native = field.native?.type ?? '';
  if (/number/i.test(native)) return 'double';
  if (/boolean/i.test(native)) return 'bool';
  return 'string';
}

function complexName(entity: string, prop: string, field: NormalizedField): string {
  const fromType = field.object?.typeName?.replace(/^I(?=[A-Z])/, '');
  const fromSchema = field.object?.schemaName?.replace(/Schema$/, '');
  const name = fromType || fromSchema || `${entity}${prop}`;
  return field.isArray ? singularize(name) : name;
}

function subFieldProp(sub: NormalizedObjectSubField): string {
  const required = sub.required && sub.nullable !== true;
  let type: string;
  let isValueType = true;
  if (sub.kind === 'reference') type = 'Guid';
  else if (sub.kind === 'enum') {
    type = 'string';
    isValueType = false;
  } else if (SCALAR_TYPES[sub.kind]) ({ type, isValueType } = SCALAR_TYPES[sub.kind]);
  else throw new DotnetUnsupportedError(`alt alan ${sub.name}: ${sub.kind} (iç içe obje / json / map) desteklenmiyor.`);
  const init = required && !isValueType ? ' = string.Empty;' : '';
  return `public ${type}${required ? '' : '?'} ${pascalCase(sub.name)} { get; set; }${init} // ${sub.name}${sub.trim ? ' trim' : ''}`;
}

function defaultLiteral(field: NormalizedField, enumDef?: DotnetEnum): string | undefined {
  const value = field.default;
  if (value === undefined || value === null || field.isArray) return undefined;
  switch (field.kind) {
    case 'string':
      return typeof value === 'string' ? csString(value) : undefined;
    case 'number':
      return typeof value === 'number' ? String(value) : undefined;
    case 'decimal':
      return typeof value === 'number' || (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) ? `${value}m` : undefined;
    case 'boolean':
      return typeof value === 'boolean' ? String(value) : undefined;
    case 'enum': {
      const member = enumDef?.members.find((m) => m.value === String(value));
      return member ? `${enumDef!.name}.${member.name}` : undefined;
    }
    default:
      return undefined;
  }
}

/** Filter type actually applied: the model's choice when it fits the kind, otherwise the kind's default. */
function effectiveFilter(f: FieldInfo): FilterType | null {
  const byCategory: Partial<Record<Category, FilterType[]>> = {
    ref: ['reference'],
    refArray: ['reference']
  };
  const byKind: Record<string, FilterType[]> = {
    string: ['regex', 'eq'],
    number: ['range', 'eq'],
    decimal: ['range', 'eq'],
    boolean: ['boolean'],
    date: ['date-range'],
    enum: ['enum']
  };
  const allowed = f.category === 'scalar' ? byKind[f.source.kind] : byCategory[f.category];
  if (!allowed) return null;
  // Enum: always `IN` (one value or an array, contract §3). `eq` would accept a single value only, and the merged model
  // (`mergeModel`) may carry `eq` for an enum the manifest stores as `enum`: same output either way (admin config does the same).
  if (f.category === 'scalar' && f.source.kind === 'enum') return 'enum';
  if (f.category === 'refArray' && !f.target) return null;
  const wanted = f.source.filter?.type;
  return wanted && allowed.includes(wanted) ? wanted : allowed[0];
}

function filterLine(f: FieldInfo, filter: FilterType): { prop: string; call: string } {
  const p = f.prop;
  switch (filter) {
    case 'regex':
      return { prop: `public string? ${p} { get; init; }`, call: `.WhereContains(x => x.${p}, filters.${p})` };
    case 'eq':
      return { prop: `public ${f.type}? ${p} { get; init; }`, call: `.WhereEquals(x => x.${p}, filters.${p})` };
    case 'boolean':
      return { prop: `public bool? ${p} { get; init; }`, call: `.WhereEquals(x => x.${p}, filters.${p})` };
    case 'range':
      return { prop: `public RangeFilter<${f.type}>? ${p} { get; init; }`, call: `.WhereRange(x => x.${p}, filters.${p})` };
    case 'date-range':
      return { prop: `public DateRangeFilter? ${p} { get; init; }`, call: `.WhereDateRange(x => x.${p}, filters.${p})` };
    case 'enum':
      return { prop: `public OneOrMany<${f.type}>? ${p} { get; init; }`, call: `.WhereIn(x => x.${p}, filters.${p})` };
    case 'reference':
      return f.category === 'ref'
        ? { prop: `public OneOrMany<Guid>? ${p} { get; init; }`, call: `.WhereIn(x => x.${f.fk}, filters.${p})` }
        : { prop: `public OneOrMany<Guid>? ${p} { get; init; }`, call: `.WhereAnyIn(x => x.${f.nav}, filters.${p})` };
    default:
      throw new DotnetUnsupportedError(`filter ${filter}`);
  }
}

interface ModelInfo {
  model: NormalizedModel;
  names: ReturnType<typeof dotnetModuleNames>;
  fields: FieldInfo[];
  enums: DotnetEnum[];
  complexTypes: DotnetComplexType[];
}

/** First pass: C# shapes of every field; references are resolved against `targets`. */
function describeModel(model: NormalizedModel, targets: Map<string, TargetInfo>): ModelInfo {
  const names = dotnetModuleNames(model.entityName);
  const { entity } = names;
  const enums: DotnetEnum[] = [];
  const complexTypes: DotnetComplexType[] = [];
  const fields: FieldInfo[] = [];

  for (const field of model.fields) {
    if (BASE_FIELDS.has(field.name)) continue;
    const prop = pascalCase(field.name);
    const required = field.required === true && field.nullable !== true;
    const base = { source: field, json: field.name, prop, required };
    const where = `${model.entityName}.${field.name}`;

    if (field.kind === 'reference') {
      const target = field.reference?.target ? targets.get(field.reference.target) : undefined;
      const include = field.reference?.include === true && (field.reference?.populate?.length ?? 0) > 0;
      if (field.isArray) {
        const nav = target ? (/Ids$/.test(prop) ? pluralize(prop.slice(0, -3)) : prop) : undefined;
        fields.push({ ...base, category: 'refArray', type: 'Guid', isValueType: true, nav, target, populate: target && include ? field.reference!.populate : undefined });
      } else {
        const stem = /Id$/.test(prop) && prop.length > 2 ? prop.slice(0, -2) : prop;
        const fk = /Id$/.test(prop) ? prop : `${prop}Id`;
        fields.push({ ...base, category: 'ref', type: 'Guid', isValueType: true, fk, nav: target ? stem : undefined, target, populate: target && include ? field.reference!.populate : undefined });
      }
      continue;
    }
    if (field.kind === 'object') {
      if (!field.object?.fields?.length) {
        fields.push({ ...base, category: 'json', type: 'JsonDocument', isValueType: false });
        continue;
      }
      const name = complexName(entity, prop, field);
      complexTypes.push({ name, props: field.object.fields.map(subFieldProp) });
      fields.push({ ...base, category: field.isArray ? 'objectArray' : 'object', type: name, isValueType: false });
      continue;
    }
    if (field.kind === 'json') {
      fields.push({ ...base, category: 'json', type: 'JsonDocument', isValueType: false });
      continue;
    }
    if (field.kind === 'map') {
      fields.push({ ...base, category: 'map', type: `Dictionary<string, ${mapValueType(field)}>`, isValueType: false });
      continue;
    }
    if (!SCALAR_KINDS.has(field.kind)) {
      throw new DotnetUnsupportedError(`${where}: ${field.kind} .NET üreticisinde desteklenmiyor.`);
    }

    let enumDef: DotnetEnum | undefined;
    if (field.kind === 'enum') {
      const values = field.enum?.values ?? [];
      if (values.length === 0) throw new DotnetUnsupportedError(`${where}: enum değeri yok.`);
      enumDef = { name: `${entity}${field.isArray ? singularize(prop) : prop}`, members: values.map((value) => ({ name: enumMemberName(value), value, literal: csString(value) })) };
      enums.push(enumDef);
    }
    const { type, isValueType } = enumDef ? { type: enumDef.name, isValueType: true } : SCALAR_TYPES[field.kind];
    fields.push({
      ...base,
      category: field.isArray ? (enumDef ? 'enumArray' : 'scalarArray') : 'scalar',
      type,
      isValueType,
      defaultLiteral: defaultLiteral(field, enumDef),
      enumName: enumDef?.name
    });
  }
  return { model, names, fields, enums, complexTypes };
}

function isHidden(f: FieldInfo): boolean {
  return f.source.access?.hidden === true;
}

/** Row / body C# type of a non-relation field (lists are never null). */
function valueType(f: FieldInfo): string {
  switch (f.category) {
    case 'scalarArray':
    case 'enumArray':
    case 'objectArray':
      return `List<${f.type}>`;
    default:
      return f.type;
  }
}

function isCollection(f: FieldInfo): boolean {
  return f.category === 'scalarArray' || f.category === 'enumArray' || f.category === 'objectArray' || f.category === 'refArray';
}

function buildBody(name: string, fields: FieldInfo[], mode: 'create' | 'update'): DotnetBodyContext {
  const props: string[] = [];
  const rules: string[] = [];
  const mapCreate: string[] = [];
  const mapUpdate: string[] = [];
  const relations: string[] = [];
  for (const f of fields) {
    const t = f.category === 'ref' ? 'Guid' : f.category === 'refArray' ? 'List<Guid>' : valueType(f);
    const requiredHere = mode === 'create' && f.required && f.defaultLiteral === undefined && !isCollection(f);
    props.push(requiredHere ? `public required ${t} ${f.prop} { get; init; }` : `public ${t}? ${f.prop} { get; init; }`);

    const when = requiredHere ? '' : `.When(x => x.${f.prop} is not null)`;
    if (f.category === 'scalar' && f.type === 'string' && f.required) rules.push(`RuleFor(x => x.${f.prop}).NotEmpty()${when};`);
    if (f.enumName && f.category === 'scalar') rules.push(`RuleFor(x => x.${f.prop}).IsInEnum()${when};`);
    if (f.category === 'ref' && f.required) rules.push(`RuleFor(x => x.${f.prop}).NotEmpty()${when};`);
    if ((f.category === 'object' || f.category === 'json') && requiredHere) rules.push(`RuleFor(x => x.${f.prop}).NotNull();`);

    const trim = f.source.trim === true && f.category === 'scalar' && f.type === 'string';
    const v = `body.${f.prop}`;
    if (f.category === 'refArray') {
      if (f.target) relations.push(`await Load${f.nav}Async(entity, ${v}, cancellationToken)`);
      else if (mode === 'create') mapCreate.push(`${f.prop} = ${v} ?? [],`);
      else mapUpdate.push(`if (${v} is not null) entity.${f.prop} = ${v};`);
      continue;
    }
    const member = f.category === 'ref' ? f.fk! : f.prop;
    if (mode === 'create') {
      let expr: string;
      if (requiredHere) expr = trim ? `${v}.Trim()` : v;
      else {
        const nullable = trim ? `${v}?.Trim()` : v;
        if (f.defaultLiteral) expr = `${nullable} ?? ${f.defaultLiteral}`;
        else if (isCollection(f)) expr = `${v} ?? []`;
        else if (f.required && f.type === 'string' && f.category === 'scalar') expr = `${nullable} ?? string.Empty`;
        else if (f.required && f.category === 'object') expr = `${v} ?? new()`;
        else if (f.required && f.category === 'map') expr = `${v} ?? []`;
        else if (f.required && f.isValueType) expr = `${v} ?? default`;
        else if (f.required && f.category === 'json') expr = `${v}!`;
        else expr = nullable;
      }
      mapCreate.push(`${member} = ${expr},`);
    } else {
      const assigned = f.isValueType && !isCollection(f) ? `${v}.Value` : trim ? `${v}.Trim()` : v;
      mapUpdate.push(`if (${v} is not null) entity.${member} = ${assigned};`);
    }
  }
  return { name, validator: `${name}Validator`, props, rules, mapCreate, mapUpdate, relations };
}

/** Row param + projection for a populated reference (target's fields, in `populate` order). */
function refRecord(owner: string, f: FieldInfo, infos: Map<string, ModelInfo>, nav: string, usings: Set<string>) {
  const target = infos.get(f.target!.model.entityName)!;
  const name = `${owner}${f.category === 'refArray' ? singularize(f.nav!) : f.nav}Ref`;
  const params = ['Guid Id'];
  const args = [`${nav}.Id`];
  const seen = new Set<string>();
  for (const key of f.populate ?? []) {
    if (key === '_id' || key === 'id' || seen.has(key)) continue;
    seen.add(key);
    if (key === 'createdAt' || key === 'updatedAt') {
      params.push(`DateTimeOffset ${pascalCase(key)}`);
      args.push(`${nav}.${pascalCase(key)}`);
      continue;
    }
    const tf = target.fields.find((x) => x.json === key);
    if (!tf || isHidden(tf) || tf.category === 'refArray') continue;
    if (tf.category === 'ref') {
      params.push(`Guid${tf.required ? '' : '?'} ${tf.prop}`);
      args.push(`${nav}.${tf.fk}`);
      continue;
    }
    if (tf.enumName || tf.category === 'object' || tf.category === 'objectArray') usings.add(target.names.folder);
    params.push(`${valueType(tf)}${tf.required || isCollection(tf) ? '' : '?'} ${tf.prop}`);
    args.push(`${nav}.${tf.prop}`);
  }
  return { record: { name, params }, args };
}

function buildModuleContext(app: string, info: ModelInfo, infos: Map<string, ModelInfo>): DotnetModuleContext {
  const { model, names, fields, enums, complexTypes } = info;
  const { entity } = names;
  const visible = fields.filter((f) => !isHidden(f));
  const refRecords: DotnetRefRecord[] = [];
  const dtoFolders = new Set<string>();
  const domainFolders = new Set<string>();
  let usesJson = false;

  // Entity. Every model property ends with a marker comment (`// <json name> [unique] [trim] [required]`): the
  // .NET entity parser reads the JSON name and the flags the C# declaration cannot carry (D5).
  const entityProps: string[] = [];
  const marker = (f: FieldInfo) =>
    ` // ${[f.json, f.source.unique ? 'unique' : '', f.source.trim ? 'trim' : '', f.required && isCollection(f) ? 'required' : ''].filter(Boolean).join(' ')}`;
  const push = (f: FieldInfo, line: string) => entityProps.push(line + marker(f));
  for (const f of fields) {
    if (f.target) domainFolders.add(f.target.folder);
    switch (f.category) {
      case 'ref':
        push(f, `public Guid${f.required ? '' : '?'} ${f.fk} { get; set; }`);
        if (f.nav) entityProps.push(`public ${f.target!.entity}? ${f.nav} { get; set; } // nav`);
        break;
      case 'refArray':
        push(f, f.nav ? `public List<${f.target!.entity}> ${f.nav} { get; set; } = [];` : `public List<Guid> ${f.prop} { get; set; } = [];`);
        break;
      case 'scalarArray':
      case 'enumArray':
      case 'objectArray':
        push(f, `public List<${f.type}> ${f.prop} { get; set; } = [];`);
        break;
      case 'object':
        push(f, f.required ? `public ${f.type} ${f.prop} { get; set; } = new();` : `public ${f.type}? ${f.prop} { get; set; }`);
        break;
      case 'map':
        push(f, f.required ? `public ${f.type} ${f.prop} { get; set; } = [];` : `public ${f.type}? ${f.prop} { get; set; }`);
        break;
      case 'json':
        usesJson = true;
        push(f, `public JsonDocument${f.required ? '' : '?'} ${f.prop} { get; set; }${f.required ? ' = JsonDocument.Parse("{}");' : ''}`);
        break;
      default: {
        const init = f.defaultLiteral ? ` = ${f.defaultLiteral};` : f.required && f.type === 'string' ? ' = string.Empty;' : '';
        push(f, `public ${f.type}${f.required ? '' : '?'} ${f.prop} { get; set; }${init}`);
      }
    }
  }
  domainFolders.delete(names.folder);

  // Row. Populated references are `Ref<TRecord>`: object in list / getOne (`Row`), id only in create / update
  // responses (`WriteRow`), as Express returns them (contract §4).
  const rowParams = ['Guid Id'];
  const rowArgs = ['x.Id'];
  const writeRowArgs = ['x.Id'];
  const same = (expr: string) => {
    rowArgs.push(expr);
    writeRowArgs.push(expr);
  };
  for (const f of visible) {
    if (f.category === 'ref') {
      if (f.populate) {
        const nav = `x.${f.nav}!`;
        const { record, args } = refRecord(entity, f, infos, nav, dtoFolders);
        refRecords.push(record);
        rowParams.push(`Ref<${record.name}>${f.required ? '' : '?'} ${f.prop}`);
        const id = f.required ? `x.${f.fk}` : `x.${f.fk}.Value`;
        const full = `new Ref<${record.name}>(${id}, new ${record.name}(${args.join(', ')}))`;
        const bare = `new Ref<${record.name}>(${id}, null)`;
        rowArgs.push(f.required ? full : `x.${f.fk} == null ? null : ${full}`);
        writeRowArgs.push(f.required ? bare : `x.${f.fk} == null ? null : ${bare}`);
      } else {
        rowParams.push(`Guid${f.required ? '' : '?'} ${f.prop}`);
        same(`x.${f.fk}`);
      }
      continue;
    }
    if (f.category === 'refArray') {
      if (f.populate) {
        const { record, args } = refRecord(entity, f, infos, 't', dtoFolders);
        refRecords.push(record);
        rowParams.push(`List<Ref<${record.name}>> ${f.prop}`);
        rowArgs.push(`x.${f.nav}.Select(t => new Ref<${record.name}>(t.Id, new ${record.name}(${args.join(', ')}))).ToList()`);
        writeRowArgs.push(`x.${f.nav}.Select(t => new Ref<${record.name}>(t.Id, null)).ToList()`);
      } else if (f.nav) {
        rowParams.push(`List<Guid> ${f.prop}`);
        same(`x.${f.nav}.Select(t => t.Id).ToList()`);
      } else {
        rowParams.push(`List<Guid> ${f.prop}`);
        same(`x.${f.prop}`);
      }
      continue;
    }
    if (f.category === 'json') usesJson = true;
    rowParams.push(`${valueType(f)}${f.required || isCollection(f) ? '' : '?'} ${f.prop}`);
    same(`x.${f.prop}`);
  }
  rowParams.push('DateTimeOffset CreatedAt', 'DateTimeOffset UpdatedAt');
  same('x.CreatedAt');
  same('x.UpdatedAt');
  const hasWriteRow = refRecords.length > 0;

  // Filters + sort
  const filterProps = ['public Guid? Id { get; init; }'];
  const filterCalls = ['.WhereEquals(x => x.Id, filters.Id)'];
  for (const f of visible) {
    if (f.source.filter?.searchable === false) continue;
    const filter = effectiveFilter(f);
    if (!filter) continue;
    const line = filterLine(f, filter);
    filterProps.push(line.prop);
    filterCalls.push(line.call);
  }
  // Timestamps: filterable unless the model's own `createdAt` / `updatedAt` field says otherwise (Express `mongoAuditFields`).
  for (const ts of ['createdAt', 'updatedAt']) {
    if (model.fields.find((f) => f.name === ts)?.filter?.searchable === false) continue;
    const p = pascalCase(ts);
    filterProps.push(`public DateRangeFilter? ${p} { get; init; }`);
    filterCalls.push(`.WhereDateRange(x => x.${p}, filters.${p})`);
  }

  const sortEntries = [
    ...visible
      .filter((f) => f.category === 'scalar' || f.category === 'ref')
      .map((f) => `.Add(${csString(f.json)}, x => x.${f.category === 'ref' ? f.fk : f.prop})`),
    '.Add("createdAt", x => x.CreatedAt)',
    '.Add("updatedAt", x => x.UpdatedAt)'
  ];

  // Configuration
  const configLines = [`builder.ToTable(${csString(names.table)});`, 'builder.HasKey(x => x.Id);', 'builder.Property(x => x.Id).ValueGeneratedNever();'];
  let usesJsonb = false;
  for (const f of fields) {
    switch (f.category) {
      case 'scalar':
        if (f.type === 'string' && f.required) configLines.push(`builder.Property(x => x.${f.prop}).IsRequired();`);
        if (f.enumName) configLines.push(`builder.Property(x => x.${f.prop}).HasConversion<string>();`);
        break;
      case 'enumArray':
      case 'map':
        usesJsonb = true;
        configLines.push(`builder.Property(x => x.${f.prop}).HasJsonbConversion();`);
        break;
      case 'object':
        configLines.push(`builder.ComplexProperty(x => x.${f.prop}, b => b.ToJson());`);
        break;
      case 'objectArray':
        configLines.push(`builder.ComplexCollection(x => x.${f.prop}, b => b.ToJson());`);
        break;
      case 'json':
        configLines.push(`builder.Property(x => x.${f.prop}).HasColumnType("jsonb");`);
        break;
      case 'ref':
        if (f.nav) {
          configLines.push(
            `builder.HasOne(x => x.${f.nav}).WithMany().HasForeignKey(x => x.${f.fk}).IsRequired(${f.required}).OnDelete(DeleteBehavior.Restrict);`
          );
        } else configLines.push(`builder.HasIndex(x => x.${f.fk});`);
        break;
      case 'refArray':
        if (f.nav) {
          configLines.push(`builder.HasMany(x => x.${f.nav}).WithMany().UsingEntity(j => j.ToTable(${csString(`${names.table}_${snake(f.prop)}`)}));`);
        }
        break;
    }
    if (f.source.unique && (f.category === 'scalar' || f.category === 'ref')) {
      configLines.push(`builder.HasIndex(x => x.${f.category === 'ref' ? f.fk : f.prop}).IsUnique();`);
    }
  }
  configLines.push('builder.HasIndex(x => x.CreatedAt);');

  // Service: unique, relation checks, m-n loaders
  const uniqueChecks = fields
    .filter((f) => f.source.unique && (f.category === 'scalar' || f.category === 'ref'))
    .map((f) => {
      const m = f.category === 'ref' ? f.fk : f.prop;
      const check = `await ConflictIfExistsAsync(x => x.${m} == entity.${m}, entity.Id, ${csString(f.json)}, cancellationToken)`;
      return f.required ? check : `(entity.${m} is null ? null : ${check})`;
    })
    .map((expr, i) => (i === 0 ? expr : `?? ${expr}`));

  const relationChecks = fields
    .filter((f) => f.category === 'ref' && f.target)
    .map((f) => {
      const exists = `await Db.${f.target!.folder}.AnyAsync(t => t.Id == entity.${f.fk}, cancellationToken)`;
      const missing = `Error.BadRequest(string.Format(Messages.ReferenceNotFound, ${csString(f.json)}))`;
      return f.required
        ? `if (!${exists}) return ${missing};`
        : `if (entity.${f.fk} is not null && !${exists}) return ${missing};`;
    });

  const relationFields = fields.filter((f) => f.category === 'refArray' && f.target);
  const relationLoaders = relationFields.map((f) => ({ nav: f.nav!, folder: f.target!.folder, json: csString(f.json) }));
  const updateIncludes = relationFields.map((f) => `.Include(x => x.${f.nav})`);

  const writable = (f: FieldInfo, mode: 'create' | 'update') =>
    f.source.access?.readonly !== true && (mode === 'create' ? f.source.access?.hiddenFromCreate !== true : f.source.access?.hiddenFromUpdate !== true);
  // Ownership (contract §2, §5): explicit kind, or derived from a `userId` reference.
  const ownerField = fields.find((f) => f.json === 'userId' && f.category === 'ref');
  const ownershipKind = model.ownership?.kind ?? (ownerField ? 'field' : undefined);
  if (ownershipKind === 'field' && !ownerField) {
    throw new DotnetUnsupportedError(`${model.entityName}: ownership "field" için \`userId\` reference alanı yok.`);
  }
  const ownership = ownershipKind
    ? { kind: ownershipKind, fk: ownershipKind === 'field' ? ownerField!.fk : undefined, filterProp: ownershipKind === 'field' ? ownerField!.prop : undefined }
    : undefined;
  const normalFields = (mode: 'create' | 'update') =>
    fields.filter((f) => writable(f, mode) && f.source.access?.adminOnly !== true && !(ownership?.kind === 'field' && f === ownerField));
  const adminFields = (mode: 'create' | 'update') => fields.filter((f) => writable(f, mode));

  const requested = model.api?.normalOperations ?? [...NORMAL_OPERATIONS];
  const allowed = (op: NormalOperation) =>
    ownership ? !(ownership.kind === 'self' && op === 'create') : !['create', 'update', 'delete'].includes(op);
  const normalOperations = requested.filter(allowed);
  const droppedOperations = requested.filter((op) => !allowed(op));
  const ops = Object.fromEntries(NORMAL_OPERATIONS.map((op) => [op, normalOperations.includes(op)])) as Record<NormalOperation, boolean>;
  const writes = ops.create || ops.update || ops.delete;
  const normalCreate = buildBody(`${entity}CreateBody`, normalFields('create'), 'create');
  if (ownership?.kind === 'field') normalCreate.mapCreate.push(`${ownership.fk} = currentUser.Id${ownerField!.required ? ' ?? Guid.Empty' : ''},`);

  const domainUsings = [...domainFolders].sort().map((folder) => `${app}.Domain.${folder}`);
  if (usesJson) domainUsings.unshift('System.Text.Json');
  if (enums.length) domainUsings.unshift('System.Text.Json.Serialization');
  const needsOwnDomain = enums.length > 0 || complexTypes.length > 0;
  const dtoUsings = [
    ...(usesJson ? ['System.Text.Json'] : []),
    ...(refRecords.length ? [`${app}.Application.Common.Relations`] : []),
    ...(needsOwnDomain ? [`${app}.Domain.${names.folder}`] : []),
    ...[...dtoFolders].filter((x) => x !== names.folder).sort().map((folder) => `${app}.Domain.${folder}`)
  ];
  const infraUsings = [...(usesJsonb ? [`${app}.Infrastructure.Common`] : [])];

  return {
    app,
    ...names,
    enums,
    complexTypes,
    refRecords,
    domainUsings,
    dtoUsings,
    entityProps,
    rowParams,
    rowArgs,
    writeRowArgs,
    hasWriteRow,
    filterProps,
    filterCalls,
    sortEntries,
    configLines,
    infraUsings,
    uniqueChecks,
    relationChecks,
    relationLoaders,
    usesErrors: uniqueChecks.length + relationChecks.length + relationLoaders.length > 0,
    updateIncludes,
    normal: {
      create: normalCreate,
      update: buildBody(`${entity}UpdateBody`, normalFields('update'), 'update')
    },
    admin: {
      create: buildBody(`${entity}AdminCreateBody`, adminFields('create'), 'create'),
      update: buildBody(`${entity}AdminUpdateBody`, adminFields('update'), 'update')
    },
    normalOperations,
    droppedOperations,
    ownership,
    ops,
    // Default is authenticated (as Express: `moduleApiDetect` → `requiresAuth: true`); anonymous only when asked for.
    normalAuth: model.api?.requiresAuth === false && !writes && !ownership ? 'anonymous' : 'authenticated',
    hasAdmin: model.api?.admin !== false,
    usesSerialization: enums.length > 0,
    usesJson
  };
}

/** Contexts for the host's whole module list (references resolve within it). */
export function buildDotnetModuleContexts(app: string, models: NormalizedModel[]): DotnetModuleContext[] {
  const targets = new Map<string, TargetInfo>();
  for (const model of models) {
    const { entity, folder } = dotnetModuleNames(model.entityName);
    targets.set(model.entityName, { entity, folder, model });
  }
  const infos = new Map(models.map((m) => [m.entityName, describeModel(m, targets)]));
  return models.map((m) => buildModuleContext(app, infos.get(m.entityName)!, infos));
}

export function dotnetRegistryModule(ctx: DotnetModuleContext): DotnetRegistryModule {
  const { entity } = ctx;
  return {
    entity,
    folder: ctx.folder,
    hasNormalEndpoints: true,
    hasAdmin: ctx.hasAdmin,
    registrations: [
      `services.AddScoped<I${entity}Hooks, ${entity}Hooks>();`,
      `services.AddScoped<I${entity}AdminHooks, ${entity}AdminHooks>();`,
      `services.AddScoped<I${entity}Service, ${entity}Service>();`,
      `services.AddScoped<I${entity}AdminService, ${entity}AdminService>();`,
      `services.AddSingleton<IValidator<ListBody<${entity}Filters>>, ${entity}ListBodyValidator>();`,
      ...[ctx.normal.create, ctx.normal.update, ctx.admin.create, ctx.admin.update].map(
        (b) => `services.AddSingleton<IValidator<${b.name}>, ${b.validator}>();`
      )
    ]
  };
}
