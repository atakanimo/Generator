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
import { NORMAL_OPERATIONS, adminExportEnabled, resolveAdminOperations, updateNullClears } from '../../../shared/normalizedModel.js';
import { constraintsForField, EMAIL_PATTERN, isNumericEnum } from '../../../shared/fieldConstraints.js';
import { effectiveFilterType } from '../../../shared/fieldFilter.js';
import { kebabCase, moduleNameFromEntity, pascalCase, pluralize, singularize } from '../../utils/namingUtils.js';
import type { DotnetRegistryModule } from './DotnetHostBootstrap.js';
import type { DotnetDbProvider } from './providers/DotnetDbProvider.js';

/** Provided by `AuditableEntity`; never emitted as model fields. */
const BASE_FIELDS = new Set(['id', '_id', 'createdAt', 'updatedAt']);
const SCALAR_KINDS = new Set(['string', 'number', 'decimal', 'boolean', 'date', 'enum']);

export class DotnetUnsupportedError extends Error {}

export interface DotnetEnum {
  name: string;
  /** JSON number: each member carries its explicit `number` (`Name = n`). Absent → string enum. */
  numeric?: boolean;
  members: Array<{ name: string; value: string; literal: string; number?: number }>;
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

export type DotnetFieldCategory = 'scalar' | 'scalarArray' | 'enumArray' | 'object' | 'objectArray' | 'json' | 'map' | 'ref' | 'refArray';

export interface DotnetFieldInfo {
  source: NormalizedField;
  json: string;
  /** Property name in Row / bodies / filters (JSON name = `json`). */
  prop: string;
  category: DotnetFieldCategory;
  /** C# value type without `?` as seen in Row / bodies for non-relation fields. */
  type: string;
  isValueType: boolean;
  required: boolean;
  defaultLiteral?: string;
  enumName?: string;
  enumNumeric?: boolean;
  /** ref: FK property. */
  fk?: string;
  /** Navigation (relational reference strategy only): ref → target entity, refArray → collection of targets. */
  nav?: string;
  /** Name of the reference without `Id` / `Ids` (`EventType`, `Documents`): the navigation, the populate record. */
  refStem?: string;
  target?: DotnetTargetInfo;
  populate?: string[];
}

export interface DotnetTargetInfo {
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
  /** `Row` with `detailOnly` columns as `null`; list pages project with it (`ListRow`). */
  listRowArgs: string[];
  hasListRow: boolean;
  filterProps: string[];
  filterCalls: string[];
  sortEntries: string[];
  configLines: string[];
  infraUsings: string[];
  usesErrors: boolean;
  uniqueChecks: string[];
  relationChecks: string[];
  relationLoaders: Array<{ nav: string; folder: string; json: string }>;
  /** Document strategy: `CheckInUseAsync` terms (`|| …` from the second on); empty when no single reference points here. */
  inUseChecks: string[];
  /** Document strategy: `DetachReferencesAsync` statements (the id leaves the `reference[]` lists pointing here). */
  detachReferences: string[];
  /** Document strategy: `PopulateAsync` statements and the `with` assignments of the populated references. */
  populateLoads: string[];
  populateAssigns: string[];
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
  /** Admin endpoints (`api.adminOperations`; `list` always; `export` only when listed, PY12). */
  adminOps: Record<NormalOperation | 'export', boolean>;
  /** Export columns (`id`, visible fields in order, timestamps) and populated reference → `reference.display`. */
  exportFields: string[];
  exportDisplay: Array<{ name: string; display: string }>;
  /** Export file name module (api-contract §2: `kebabCase(entityName)`). */
  exportModule: string;
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

function clrScalar(field: NormalizedField): { type: string; isValueType: boolean } {
  if (field.kind === 'number') {
    return field.numberFormat === 'int' ? { type: 'int', isValueType: true } : { type: 'double', isValueType: true };
  }
  if (field.kind === 'date') {
    return field.dateFormat === 'date' ? { type: 'DateOnly', isValueType: true } : { type: 'DateTimeOffset', isValueType: true };
  }
  const known = SCALAR_TYPES[field.kind];
  if (!known) throw new DotnetUnsupportedError(`${field.name}: ${field.kind}`);
  return known;
}

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
  if (sub.kind === 'reference') type = 'EntityId';
  else if (sub.kind === 'enum') {
    type = 'string';
    isValueType = false;
  } else if (sub.kind === 'number' && sub.numberFormat === 'int') type = 'int';
  else if (SCALAR_TYPES[sub.kind]) ({ type, isValueType } = SCALAR_TYPES[sub.kind]);
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

/** Filter type actually applied (`effectiveFilterType`): the model's choice when it fits the kind, otherwise the kind's default. */
function effectiveFilter(f: DotnetFieldInfo): FilterType | null {
  if (f.category === 'ref') return 'reference';
  if (f.category === 'refArray') return f.target ? 'reference' : null;
  if (f.category !== 'scalar') return null;
  return effectiveFilterType(f.source) ?? null;
}

function filterLine(f: DotnetFieldInfo, filter: FilterType): { prop: string; call: string } {
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
        ? { prop: `public OneOrMany<EntityId>? ${p} { get; init; }`, call: `.WhereIn(x => x.${f.fk}, filters.${p})` }
        : f.nav
          ? { prop: `public OneOrMany<EntityId>? ${p} { get; init; }`, call: `.WhereAnyIn(x => x.${f.nav}, filters.${p})` }
          : { prop: `public OneOrMany<EntityId>? ${p} { get; init; }`, call: `.WhereAnyIdIn(x => x.${f.prop}, filters.${p})` };
    default:
      throw new DotnetUnsupportedError(`filter ${filter}`);
  }
}

interface ModelInfo {
  model: NormalizedModel;
  names: ReturnType<typeof dotnetModuleNames>;
  fields: DotnetFieldInfo[];
  enums: DotnetEnum[];
  complexTypes: DotnetComplexType[];
}

/** First pass: C# shapes of every field; references are resolved against `targets`. */
const isComputed = (f: DotnetFieldInfo): boolean => f.source.access?.computed === true;

function describeModel(model: NormalizedModel, targets: Map<string, DotnetTargetInfo>, provider: DotnetDbProvider): ModelInfo {
  const relational = provider.referenceStrategy === 'relational';
  const names = dotnetModuleNames(model.entityName);
  const { entity } = names;
  const enums: DotnetEnum[] = [];
  const complexTypes: DotnetComplexType[] = [];
  const fields: DotnetFieldInfo[] = [];

  for (const field of model.fields) {
    if (BASE_FIELDS.has(field.name)) continue;
    const prop = pascalCase(field.name);
    // `computed`: `[NotMapped]`, never stored, so always nullable, with no navigation and no populate.
    const computed = field.access?.computed === true;
    const required = field.required === true && field.nullable !== true && !computed;
    const base = { source: field, json: field.name, prop, required };
    const where = `${model.entityName}.${field.name}`;

    if (field.kind === 'reference') {
      const target = field.reference?.target ? targets.get(field.reference.target) : undefined;
      const include = field.reference?.include === true && (field.reference?.populate?.length ?? 0) > 0;
      const populate = target && include && !computed ? field.reference!.populate : undefined;
      if (field.isArray) {
        const refStem = /Ids$/.test(prop) ? pluralize(prop.slice(0, -3)) : prop;
        const nav = target && relational && !computed ? refStem : undefined;
        fields.push({ ...base, category: 'refArray', type: 'EntityId', isValueType: true, nav, refStem, target, populate });
      } else {
        const refStem = /Id$/.test(prop) && prop.length > 2 ? prop.slice(0, -2) : prop;
        const fk = /Id$/.test(prop) ? prop : `${prop}Id`;
        fields.push({ ...base, category: 'ref', type: 'EntityId', isValueType: true, fk, nav: target && relational && !computed ? refStem : undefined, refStem, target, populate });
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
      const numbers = isNumericEnum(field.enum) ? field.enum.numbers : undefined;
      const numeric = numbers !== undefined;
      enumDef = {
        name: `${entity}${field.isArray ? singularize(prop) : prop}`,
        numeric,
        members: values.map((value, i) => ({ name: enumMemberName(value), value, literal: csString(value), number: numbers?.[i] }))
      };
      enums.push(enumDef);
    }
    const { type, isValueType } = enumDef ? { type: enumDef.name, isValueType: true } : clrScalar(field);
    fields.push({
      ...base,
      category: field.isArray ? (enumDef ? 'enumArray' : 'scalarArray') : 'scalar',
      type,
      isValueType,
      defaultLiteral: defaultLiteral(field, enumDef),
      enumName: enumDef?.name,
      enumNumeric: enumDef?.numeric
    });
  }
  return { model, names, fields, enums, complexTypes };
}

function isHidden(f: DotnetFieldInfo): boolean {
  return f.source.access?.hidden === true;
}

/** Row / body C# type of a non-relation field (lists are never null). */
function valueType(f: DotnetFieldInfo): string {
  switch (f.category) {
    case 'scalarArray':
    case 'enumArray':
    case 'objectArray':
      return `List<${f.type}>`;
    default:
      return f.type;
  }
}

function boundLiteral(type: string, value: number): string {
  if (type === 'decimal') return `${value}m`;
  if (type === 'double') return Number.isInteger(value) ? `${value}d` : String(value);
  return String(value);
}

/** One FluentValidation call each, so `.When` applies to that check (optional bodies). */
function validatorChecks(f: DotnetFieldInfo, provider: DotnetDbProvider): string[] {
  const checks: string[] = [];
  // Same limits and email pattern as the other stacks (`fieldConstraints.ts`); arrays carry none.
  const c = constraintsForField(f.source, f.source.constraints);
  if (f.category === 'scalar' && f.type === 'string') {
    if (f.required) checks.push('NotEmpty()');
    if (f.source.format === 'email') checks.push(`Matches(${csString(EMAIL_PATTERN)})`);
    if (c?.minLength != null) checks.push(`MinimumLength(${c.minLength})`);
    // A unique column the provider bounds (SQL Server `nvarchar(850)`) is bounded here too: longer is 400, not a
    // truncation error (500) from the database.
    const maxLength = c?.maxLength ?? (f.source.unique ? provider.uniqueTextMaxLength : undefined);
    if (maxLength != null) checks.push(`MaximumLength(${maxLength})`);
    if (c?.pattern) checks.push(`Matches(${csString(c.pattern)})`);
  }
  if (f.category === 'scalar' && (f.type === 'int' || f.type === 'double' || f.type === 'decimal')) {
    if (c?.min != null) checks.push(`GreaterThanOrEqualTo(${boundLiteral(f.type, c.min)})`);
    if (c?.max != null) checks.push(`LessThanOrEqualTo(${boundLiteral(f.type, c.max)})`);
  }
  if (f.enumName && f.category === 'scalar') checks.push('IsInEnum()');
  if (f.category === 'ref' && f.required) checks.push('NotEmpty()');
  return checks;
}

function isCollection(f: DotnetFieldInfo): boolean {
  return f.category === 'scalarArray' || f.category === 'enumArray' || f.category === 'objectArray' || f.category === 'refArray';
}

function buildBody(name: string, fields: DotnetFieldInfo[], mode: 'create' | 'update', provider: DotnetDbProvider): DotnetBodyContext {
  const props: string[] = [];
  const rules: string[] = [];
  const mapCreate: string[] = [];
  const mapUpdate: string[] = [];
  const relations: string[] = [];
  for (const f of fields) {
    const t = f.category === 'ref' ? 'EntityId' : f.category === 'refArray' ? 'List<EntityId>' : valueType(f);
    const requiredHere = mode === 'create' && f.required && f.defaultLiteral === undefined && !isCollection(f);
    // Update (contract §5, JSON Merge Patch): `init` records that the property was in the JSON (`PatchBody.Has`),
    // so `null` (clear) and "omitted" (unchanged) differ. A required field or a list takes no `null` (400).
    const accessors = mode === 'update' ? '{ get; init { field = value; Sent(); } }' : '{ get; init; }';
    props.push(requiredHere ? `public required ${t} ${f.prop} { get; init; }` : `public ${t}? ${f.prop} ${accessors}`);
    const clears = mode === 'update' && updateNullClears({ required: f.required, isArray: isCollection(f) });
    if (mode === 'update' && !clears) {
      rules.push(`RuleFor(x => x.${f.prop}).NotNull().WithMessage(PatchBody.NullNotAllowed).When(x => x.Has(nameof(x.${f.prop})));`);
    }

    const when = requiredHere ? '' : `.When(x => x.${f.prop} is not null)`;
    for (const check of validatorChecks(f, provider)) rules.push(`RuleFor(x => x.${f.prop}).${check}${when};`);
    if ((f.category === 'object' || f.category === 'json') && requiredHere) rules.push(`RuleFor(x => x.${f.prop}).NotNull();`);

    const trim = f.source.trim === true && f.category === 'scalar' && f.type === 'string';
    const v = `body.${f.prop}`;
    if (f.category === 'refArray') {
      // Id list of a known target (document strategy) is a set, as the join table of the relational one.
      const ids = f.target ? `${v}.Distinct().ToList()` : v;
      if (f.nav) relations.push(`await Load${f.nav}Async(entity, ${v}, cancellationToken)`);
      else if (mode === 'create') mapCreate.push(`${f.prop} = ${f.target ? `${v}?.Distinct().ToList()` : v} ?? [],`);
      else mapUpdate.push(`if (${v} is not null) entity.${f.prop} = ${ids};`);
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
    } else if (clears) {
      // Sent → assign as is: `null` clears the (nullable) entity member.
      mapUpdate.push(`if (body.Has(nameof(body.${f.prop}))) entity.${member} = ${trim ? `${v}?.Trim()` : v};`);
    } else {
      const assigned = f.isValueType && !isCollection(f) ? `${v}.Value` : trim ? `${v}.Trim()` : v;
      mapUpdate.push(`if (${v} is not null) entity.${member} = ${assigned};`);
    }
  }
  return { name, validator: `${name}Validator`, props, rules, mapCreate, mapUpdate, relations };
}

/** Row param + projection for a populated reference (target's fields, in `populate` order). */
function refRecord(owner: string, f: DotnetFieldInfo, infos: Map<string, ModelInfo>, nav: string, usings: Set<string>) {
  const target = infos.get(f.target!.model.entityName)!;
  const name = `${owner}${f.category === 'refArray' ? singularize(f.refStem!) : f.refStem}Ref`;
  const params = ['EntityId Id'];
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
      params.push(`EntityId${tf.required ? '' : '?'} ${tf.prop}`);
      args.push(`${nav}.${tf.fk}`);
      continue;
    }
    if (tf.enumName || tf.category === 'object' || tf.category === 'objectArray') usings.add(target.names.folder);
    params.push(`${valueType(tf)}${tf.required || isCollection(tf) ? '' : '?'} ${tf.prop}`);
    args.push(`${nav}.${tf.prop}`);
  }
  return { record: { name, params }, args };
}

/**
 * `PopulateAsync` lines of one populated reference without a navigation: distinct ids of the page, one query for the
 * targets (dictionary by id), then the row's `Ref` gets its record (`null` when the target is gone). `target` is the
 * pattern variable the record arguments read (`t0`, `t1`, …: one per field, they share the `with` expression).
 */
function populateLines(f: DotnetFieldInfo, recordName: string, args: string[], target: string): { loads: string[]; assign: string } {
  const stem = f.refStem!.charAt(0).toLowerCase() + f.refStem!.slice(1);
  const ids = `${stem}Ids`;
  const targets = `${stem}Targets`;
  const r = `r.${f.prop}`;
  const pick =
    f.category === 'refArray'
      ? `rows.SelectMany(r => ${r}).Select(x => x.Id)`
      : f.required
        ? `rows.Select(r => ${r}.Id)`
        : `rows.Where(r => ${r} is not null).Select(r => ${r}!.Id)`;
  const record = (id: string) => `new Ref<${recordName}>(${id}, ${targets}.GetValueOrDefault(${id}) is { } ${target} ? new ${recordName}(${args.join(', ')}) : null)`;
  const assign =
    f.category === 'refArray'
      ? `${f.prop} = ${r}.Select(x => ${record('x.Id')}).ToList(),`
      : f.required
        ? `${f.prop} = ${record(`${r}.Id`)},`
        : `${f.prop} = ${r} is null ? null : ${record(`${r}.Id`)},`;
  return {
    loads: [
      `var ${ids} = ${pick}.Distinct().ToList();`,
      `var ${targets} = await Db.${f.target!.folder}.AsNoTracking().Where(t => ${ids}.Contains(t.Id)).ToDictionaryAsync(t => t.Id, cancellationToken);`
    ],
    assign
  };
}

function buildModuleContext(app: string, info: ModelInfo, infos: Map<string, ModelInfo>, provider: DotnetDbProvider): DotnetModuleContext {
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
  // Reference without a navigation (document strategy): the target travels in the marker (`ref=<Folder>`).
  const marker = (f: DotnetFieldInfo) =>
    ` // ${[f.json, f.source.unique ? 'unique' : '', f.source.trim ? 'trim' : '', f.required && isCollection(f) ? 'required' : '', f.target && !f.nav ? `ref=${f.target.folder}` : '', isComputed(f) ? 'computed' : ''].filter(Boolean).join(' ')}`;
  // `computed`: `[NotMapped]` keeps it out of the table / document; `MapRows` fills the row.
  const push = (f: DotnetFieldInfo, line: string) => {
    if (isComputed(f)) entityProps.push('[NotMapped]');
    entityProps.push(line + marker(f));
  };
  for (const f of fields) {
    if (f.nav) domainFolders.add(f.target!.folder);
    switch (f.category) {
      case 'ref':
        push(f, `public EntityId${f.required ? '' : '?'} ${f.fk} { get; set; }`);
        if (f.nav) entityProps.push(`public ${f.target!.entity}? ${f.nav} { get; set; } // nav`);
        break;
      case 'refArray':
        push(f, f.nav ? `public List<${f.target!.entity}> ${f.nav} { get; set; } = [];` : `public List<EntityId> ${f.prop} { get; set; } = [];`);
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
  const rowParams = ['EntityId Id'];
  const rowArgs = ['x.Id'];
  const writeRowArgs = ['x.Id'];
  const detailOnlyArgs = new Set<number>();
  const same = (expr: string) => {
    rowArgs.push(expr);
    writeRowArgs.push(expr);
  };
  // Document strategy (no navigation): the projection writes ids, `PopulateAsync` fills the records after the read.
  const populateLoads: string[] = [];
  const populateAssigns: string[] = [];
  const populate = (f: DotnetFieldInfo, recordName: string, args: string[], target: string) => {
    const lines = populateLines(f, recordName, args, target);
    populateLoads.push(...lines.loads);
    populateAssigns.push(lines.assign);
  };
  for (const f of visible) {
    if (isComputed(f)) {
      // Not stored: `null` in every projection; `MapRows` fills it (`row with { … }`).
      const type = f.category === 'ref' ? 'EntityId' : f.category === 'refArray' ? 'List<EntityId>' : valueType(f);
      rowParams.push(`${type}? ${f.prop}`);
      same('null');
      continue;
    }
    if (f.category === 'ref') {
      if (f.populate) {
        const id = f.required ? `x.${f.fk}` : `x.${f.fk}.Value`;
        const nav = f.nav ? `x.${f.nav}!` : `t${populateAssigns.length}`;
        const { record, args } = refRecord(entity, f, infos, nav, dtoFolders);
        refRecords.push(record);
        rowParams.push(`Ref<${record.name}>${f.required ? '' : '?'} ${f.prop}`);
        const bare = `new Ref<${record.name}>(${id}, null)`;
        writeRowArgs.push(f.required ? bare : `x.${f.fk} == null ? null : ${bare}`);
        if (f.nav) {
          const full = `new Ref<${record.name}>(${id}, new ${record.name}(${args.join(', ')}))`;
          rowArgs.push(f.required ? full : `x.${f.fk} == null ? null : ${full}`);
        } else {
          rowArgs.push(f.required ? bare : `x.${f.fk} == null ? null : ${bare}`);
          populate(f, record.name, args, nav);
        }
      } else {
        rowParams.push(`EntityId${f.required ? '' : '?'} ${f.prop}`);
        same(`x.${f.fk}`);
      }
      continue;
    }
    if (f.category === 'refArray') {
      if (f.populate && f.nav) {
        const { record, args } = refRecord(entity, f, infos, 't', dtoFolders);
        refRecords.push(record);
        rowParams.push(`List<Ref<${record.name}>> ${f.prop}`);
        rowArgs.push(`x.${f.nav}.Select(t => new Ref<${record.name}>(t.Id, new ${record.name}(${args.join(', ')}))).ToList()`);
        writeRowArgs.push(`x.${f.nav}.Select(t => new Ref<${record.name}>(t.Id, null)).ToList()`);
      } else if (f.populate) {
        const target = `t${populateAssigns.length}`;
        const { record, args } = refRecord(entity, f, infos, target, dtoFolders);
        refRecords.push(record);
        rowParams.push(`List<Ref<${record.name}>> ${f.prop}`);
        same(`x.${f.prop}.Select(id => new Ref<${record.name}>(id, null)).ToList()`);
        populate(f, record.name, args, target);
      } else if (f.nav) {
        rowParams.push(`List<EntityId> ${f.prop}`);
        same(`x.${f.nav}.Select(t => t.Id).ToList()`);
      } else {
        rowParams.push(`List<EntityId> ${f.prop}`);
        same(`x.${f.prop}`);
      }
      continue;
    }
    if (f.category === 'json') usesJson = true;
    // `detailOnly`: `null` in list rows (`ListRow`), so the row type is nullable.
    const detailOnly = f.source.access?.detailOnly === true;
    if (detailOnly) detailOnlyArgs.add(rowArgs.length);
    rowParams.push(`${valueType(f)}${(f.required || isCollection(f)) && !detailOnly ? '' : '?'} ${f.prop}`);
    same(`x.${f.prop}`);
  }
  rowParams.push('DateTimeOffset CreatedAt', 'DateTimeOffset UpdatedAt');
  same('x.CreatedAt');
  same('x.UpdatedAt');
  const hasWriteRow = rowArgs.join() !== writeRowArgs.join();
  // List page projection: `detailOnly` columns are not read (contract: `null` in list rows, getOne returns them).
  const listRowArgs = rowArgs.map((arg, i) => (detailOnlyArgs.has(i) ? 'null' : arg));
  const hasListRow = detailOnlyArgs.size > 0;

  // Filters + sort
  const filterProps = ['public EntityId? Id { get; init; }'];
  const filterCalls = ['.WhereEquals(x => x.Id, filters.Id)'];
  for (const f of visible) {
    if (f.source.filter?.searchable === false || f.source.access?.computed === true) continue;
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
      .filter((f) => (f.category === 'scalar' || f.category === 'ref') && f.source.access?.computed !== true)
      .map((f) => `.Add(${csString(f.json)}, ${provider.sortKey(f, f.category === 'ref' ? f.fk! : f.prop)})`),
    '.Add("createdAt", x => x.CreatedAt)',
    '.Add("updatedAt", x => x.UpdatedAt)'
  ];

  const config = provider.configure({ app, names, fields: fields.filter((f) => !isComputed(f)) });

  // Service: unique, relation checks, m-n loaders
  const uniqueChecks = fields
    .filter((f) => f.source.unique && (f.category === 'scalar' || f.category === 'ref'))
    .map((f) => {
      const m = f.category === 'ref' ? f.fk : f.prop;
      const check = `await ConflictIfExistsAsync(x => x.${m} == entity.${m}, entity.Id, ${csString(f.json)}, cancellationToken)`;
      return f.required ? check : `(entity.${m} is null ? null : ${check})`;
    })
    .map((expr, i) => (i === 0 ? expr : `?? ${expr}`));

  const missing = (f: DotnetFieldInfo) => `Error.BadRequest(string.Format(Messages.ReferenceNotFound, ${csString(f.json)}))`;
  const relationChecks = fields
    .filter((f) => (f.category === 'ref' || (f.category === 'refArray' && !f.nav)) && f.target)
    .map((f) => {
      if (f.category === 'refArray') {
        // Id list (document strategy): every distinct id must exist.
        const ids = `entity.${f.prop}`;
        return `if (${ids}.Count > 0 && await Db.${f.target!.folder}.CountAsync(t => ${ids}.Contains(t.Id), cancellationToken) != ${ids}.Distinct().Count()) return ${missing(f)};`;
      }
      const exists = `await Db.${f.target!.folder}.AnyAsync(t => t.Id == entity.${f.fk}, cancellationToken)`;
      return f.required
        ? `if (!${exists}) return ${missing(f)};`
        : `if (entity.${f.fk} is not null && !${exists}) return ${missing(f)};`;
    });

  // Document strategy, no foreign keys; on delete it answers as the relational one: a single reference to the record
  // refuses the delete (409, FK Restrict), the record's id leaves the id lists pointing to it (join-table cascade).
  const referrers = (category: 'ref' | 'refArray') =>
    provider.referenceStrategy === 'document'
      ? [...infos.values()].flatMap((other) =>
          other.fields
            .filter((rf) => rf.category === category && rf.target?.model.entityName === model.entityName)
            .map((rf) => ({ folder: other.names.folder, rf }))
        )
      : [];
  const inUseChecks = referrers('ref').map(({ folder, rf }) => `await Db.${folder}.AnyAsync(t => t.${rf.fk} == entity.Id, cancellationToken)`);
  const detachReferences = referrers('refArray').map(
    ({ folder, rf }) =>
      `foreach (var referrer in await Db.${folder}.Where(t => t.${rf.prop}.Contains(entity.Id)).ToListAsync(cancellationToken)) referrer.${rf.prop}.Remove(entity.Id);`
  );

  const relationFields = fields.filter((f) => f.category === 'refArray' && f.nav);
  const relationLoaders = relationFields.map((f) => ({ nav: f.nav!, folder: f.target!.folder, json: csString(f.json) }));
  const updateIncludes = relationFields.map((f) => `.Include(x => x.${f.nav})`);

  const writable = (f: DotnetFieldInfo, mode: 'create' | 'update') =>
    f.source.access?.readonly !== true && f.source.access?.computed !== true && (mode === 'create' ? f.source.access?.hiddenFromCreate !== true : f.source.access?.hiddenFromUpdate !== true);
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
  const normalCreate = buildBody(`${entity}CreateBody`, normalFields('create'), 'create', provider);
  if (ownership?.kind === 'field') normalCreate.mapCreate.push(`${ownership.fk} = currentUser.Id${ownerField!.required ? ' ?? default' : ''},`);

  const domainUsings = [...domainFolders].sort().map((folder) => `${app}.Domain.${folder}`);
  if (fields.some(isComputed)) domainUsings.unshift('System.ComponentModel.DataAnnotations.Schema');
  if (usesJson) domainUsings.unshift('System.Text.Json');
  if (enums.length) domainUsings.unshift('System.Text.Json.Serialization');
  const needsOwnDomain = enums.length > 0 || complexTypes.length > 0;
  const dtoUsings = [
    ...(usesJson ? ['System.Text.Json'] : []),
    `${app}.Application.Common.Patch`,
    ...(refRecords.length ? [`${app}.Application.Common.Relations`] : []),
    ...(needsOwnDomain ? [`${app}.Domain.${names.folder}`] : []),
    ...[...dtoFolders].filter((x) => x !== names.folder).sort().map((folder) => `${app}.Domain.${folder}`)
  ];
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
    listRowArgs,
    hasListRow,
    hasWriteRow,
    filterProps,
    filterCalls,
    sortEntries,
    configLines: config.lines,
    infraUsings: config.usings,
    uniqueChecks,
    relationChecks,
    relationLoaders,
    usesErrors: uniqueChecks.length + relationChecks.length + relationLoaders.length + inUseChecks.length > 0,
    inUseChecks: inUseChecks.map((check, i) => (i === 0 ? check : `|| ${check}`)),
    detachReferences,
    populateLoads,
    populateAssigns,
    updateIncludes,
    normal: {
      create: normalCreate,
      update: buildBody(`${entity}UpdateBody`, normalFields('update'), 'update', provider)
    },
    admin: {
      create: buildBody(`${entity}AdminCreateBody`, adminFields('create'), 'create', provider),
      update: buildBody(`${entity}AdminUpdateBody`, adminFields('update'), 'update', provider)
    },
    normalOperations,
    droppedOperations,
    ownership,
    ops,
    // Default is authenticated (as Express: `moduleApiDetect` → `requiresAuth: true`); anonymous only when asked for.
    normalAuth: model.api?.requiresAuth === false && !writes && !ownership ? 'anonymous' : 'authenticated',
    hasAdmin: model.api?.admin !== false,
    adminOps: {
      ...(Object.fromEntries(NORMAL_OPERATIONS.map((op) => [op, resolveAdminOperations(model.api).includes(op)])) as Record<NormalOperation, boolean>),
      export: adminExportEnabled(model.api)
    },
    exportFields: ['id', ...visible.map((f) => f.json), 'createdAt', 'updatedAt'],
    exportDisplay: visible
      .filter((f) => f.populate?.length && f.source.reference?.display)
      .map((f) => ({ name: f.json, display: f.source.reference!.display! })),
    exportModule: kebabCase(model.entityName),
    usesSerialization: enums.length > 0,
    usesJson
  };
}

/** Contexts for the host's whole module list (references resolve within it). */
export function buildDotnetModuleContexts(app: string, models: NormalizedModel[], provider: DotnetDbProvider): DotnetModuleContext[] {
  const targets = new Map<string, DotnetTargetInfo>();
  for (const model of models) {
    const { entity, folder } = dotnetModuleNames(model.entityName);
    targets.set(model.entityName, { entity, folder, model });
  }
  const infos = new Map(models.map((m) => [m.entityName, describeModel(m, targets, provider)]));
  return models.map((m) => buildModuleContext(app, infos.get(m.entityName)!, infos, provider));
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
