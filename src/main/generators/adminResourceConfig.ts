/**
 * NormalizedModel v2 → `@atakanimo/ata-admin-base` `ResourceSchema` (contract §8.4, plan 6 §2).
 * Pure: no file system. The admin FE is config only; the package renders pages, tables and forms.
 */
import type { NormalizedField, NormalizedModel, NormalizedObjectSubField } from '../../shared/normalizedModel.js';
import { moduleNameFromEntity } from '../utils/namingUtils.js';

/** Mirrors `@atakanimo/ata-admin-base` `FieldConfig` (package `src/schema/fields.ts`). */
export type AdminFieldKind = 'string' | 'number' | 'decimal' | 'boolean' | 'datetime' | 'enum' | 'relation' | 'object' | 'map' | 'json';
/** Create default computed when the form opens (`@atakanimo/ata-admin-base` `DynamicDefault`). */
export interface AdminDynamicDefault {
  dynamic: 'now' | 'uuid' | 'currentUserId';
}
export type AdminFilterType = 'eq' | 'regex' | 'range' | 'date-range' | 'boolean' | 'enum' | 'relation';
export type AdminOperation = 'create' | 'update' | 'delete';

export interface AdminFieldConfig {
  name: string;
  kind: AdminFieldKind;
  label?: string;
  isArray?: true;
  required?: true;
  nullable?: true;
  readonly?: true;
  hideOnCreate?: true;
  hideOnUpdate?: true;
  /** Model `hidden` but writable (e.g. password): never in a response, written through the form. */
  writeOnly?: true;
  list?: true;
  filter?: AdminFilterType;
  default?: string | number | boolean | null | AdminDynamicDefault;
  component?: 'textarea' | 'image';
  options?: readonly string[];
  ref?: string;
  display?: string;
  populate?: readonly string[];
  fields?: readonly AdminFieldConfig[];
  typeName?: string;
  valueKind?: 'string' | 'number' | 'decimal' | 'boolean';
}

export interface AdminResourceConfig {
  schemaVersion: 1;
  name: string;
  endpoint: string;
  label?: string;
  fields: AdminFieldConfig[];
  operations?: AdminOperation[];
}

export interface AdminResourceInput {
  model: NormalizedModel;
  /** Admin router mount path, e.g. `/api/symboltypes/admin` (read from the BE app file). */
  endpoint: string;
  /** Generator UI table features; both on → every operation. */
  features?: { updatable?: boolean; deletable?: boolean };
}

/** A field the package cannot render (yet); reported, not emitted. */
export interface SkippedField {
  name: string;
  reason: string;
}

/** Resource registry key = backend module name (`SymbolTypes` → `symbol-types`); relations point at it. */
export function adminResourceName(entityName: string): string {
  return moduleNameFromEntity(entityName);
}

const SCALAR_KIND: Partial<Record<NormalizedField['kind'], AdminFieldKind>> = {
  string: 'string',
  number: 'number',
  decimal: 'decimal',
  boolean: 'boolean',
  date: 'datetime',
  enum: 'enum',
  reference: 'relation',
  object: 'object',
  map: 'map',
  json: 'json',
  // Parser type the Generator does not model (e.g. Buffer): shown and edited as JSON.
  unknown: 'json'
};

const FILTER_TYPE: Record<NonNullable<NonNullable<NormalizedField['filter']>['type']>, AdminFilterType> = {
  eq: 'eq',
  regex: 'regex',
  range: 'range',
  'date-range': 'date-range',
  boolean: 'boolean',
  enum: 'enum',
  reference: 'relation'
};

/** Generator UI "Default Value" choices → computed when the admin form opens (UI choice wins over the model default). */
const DYNAMIC_DEFAULT: Record<string, AdminDynamicDefault | undefined> = {
  currentDate: { dynamic: 'now' },
  uuid: { dynamic: 'uuid' },
  currentUserId: { dynamic: 'currentUserId' }
};

/** Filter when the model says searchable but no type: same defaults as the BE filter builder. */
function defaultFilter(kind: AdminFieldKind): AdminFilterType {
  switch (kind) {
    case 'relation':
      return 'relation';
    case 'enum':
      return 'enum';
    case 'boolean':
      return 'boolean';
    case 'datetime':
      return 'date-range';
    case 'number':
    case 'decimal':
      return 'eq';
    default:
      return 'regex';
  }
}

function resolveFilter(field: NormalizedField, kind: AdminFieldKind): AdminFilterType | undefined {
  if (field.filter?.searchable !== true || field.access?.hidden === true) return undefined;
  const explicit = field.filter.type ? FILTER_TYPE[field.filter.type] : undefined;
  // Enum fields filter by equality / `$in` unless another filter was chosen (contract §3, BE resolveTemplateFilterType).
  if (kind === 'enum' && !field.isArray && (explicit === undefined || explicit === 'regex' || explicit === 'eq')) return 'enum';
  return explicit ?? defaultFilter(kind);
}

function subFieldConfig(sub: NormalizedObjectSubField): AdminFieldConfig | null {
  const kind = SCALAR_KIND[sub.kind];
  if (!kind || kind === 'object' || kind === 'map') return null;
  const out: AdminFieldConfig = { name: sub.name, kind };
  if (sub.required) out.required = true;
  if (sub.nullable) out.nullable = true;
  if (kind === 'relation') {
    const target = sub.reference?.target ?? sub.reference?.ref;
    if (!target) return { name: sub.name, kind: 'string', ...(sub.required ? { required: true as const } : {}) };
    out.ref = adminResourceName(target);
  }
  return out;
}

function fieldConfig(field: NormalizedField, skipped: SkippedField[]): AdminFieldConfig | null {
  const kind = SCALAR_KIND[field.kind];
  if (!kind) {
    skipped.push({ name: field.name, reason: `kind '${field.kind}' has no admin field` });
    return null;
  }

  const out: AdminFieldConfig = { name: field.name, kind };
  if (field.ui?.label) out.label = field.ui.label;
  if (field.isArray) out.isArray = true;
  if (field.required) out.required = true;
  if (field.nullable === true || field.default === null) out.nullable = true;
  if (field.access?.readonly) out.readonly = true;
  if (field.access?.hiddenFromCreate) out.hideOnCreate = true;
  if (field.access?.hiddenFromUpdate) out.hideOnUpdate = true;
  if (field.ui?.list !== false) out.list = true;
  const filter = resolveFilter(field, kind);
  if (filter) out.filter = filter;
  const dynamicDefault = DYNAMIC_DEFAULT[field.ui?.defaultValue ?? ''];
  if (dynamicDefault) out.default = dynamicDefault;
  else if (field.default !== undefined && field.default !== null) out.default = field.default;
  if (kind === 'string' && !field.isArray) {
    if (field.ui?.component === 'TextArea') out.component = 'textarea';
    if (field.ui?.component === 'ImageField') out.component = 'image';
  }

  if (kind === 'enum') out.options = field.enum?.values ?? [];
  if (kind === 'relation') {
    const target = field.reference?.target;
    if (!target) {
      // A reference without a known target is just an id string for the admin.
      out.kind = 'string';
      if (out.filter === 'relation') out.filter = 'eq';
    } else {
      out.ref = adminResourceName(target);
      if (field.reference?.display) out.display = field.reference.display;
      // `_id` is `id` on the wire (K1) and always present; only data fields are listed.
      const populate = (field.reference?.populate ?? []).filter(p => p !== '_id' && p !== 'id');
      if (populate.length) out.populate = populate;
    }
  }
  if (kind === 'object') {
    out.fields = (field.object?.fields ?? []).map(subFieldConfig).filter((s): s is AdminFieldConfig => s !== null);
    if (field.object?.typeName) out.typeName = field.object.typeName;
    delete out.filter;
  }
  if (kind === 'map') out.valueKind = 'number';
  if (kind === 'json') delete out.filter;
  if (field.access?.hidden === true) {
    // Hidden (G2) but writable: the form writes it, nothing shows it (contract §2.1).
    out.writeOnly = true;
    delete out.list;
    delete out.filter;
    delete out.default;
  }
  return out;
}

/** A hidden field still belongs in the admin form when create or update can write it (e.g. password). */
function isWritable(field: NormalizedField): boolean {
  const access = field.access ?? {};
  return access.readonly !== true && !(access.hiddenFromCreate === true && access.hiddenFromUpdate === true);
}

/** Admin `ResourceSchema` of a model, plus the fields that could not be expressed. */
export function toAdminResourceConfig(input: AdminResourceInput): { config: AdminResourceConfig; skipped: SkippedField[] } {
  const { model, endpoint, features } = input;
  const skipped: SkippedField[] = [];
  const fields = model.fields
    .filter(f => f.name !== '_id' && f.name !== 'id' && (f.access?.hidden !== true || isWritable(f)))
    .map(f => fieldConfig(f, skipped))
    .filter((f): f is AdminFieldConfig => f !== null);

  const config: AdminResourceConfig = {
    schemaVersion: 1,
    name: adminResourceName(model.entityName),
    endpoint,
    // Menu / page title: the model's own label, else `SymbolTypes` → `Symbol Types`
    label: model.ui?.label?.trim() || model.entityName.replace(/([a-z0-9])([A-Z])/g, '$1 $2'),
    fields
  };
  const updatable = features?.updatable !== false;
  const deletable = features?.deletable !== false;
  if (!updatable || !deletable) {
    config.operations = [...(updatable ? (['create', 'update'] as const) : []), ...(deletable ? (['delete'] as const) : [])];
  }
  return { config, skipped };
}
