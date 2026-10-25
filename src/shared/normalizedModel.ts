/**
 * NormalizedModel v2 — the single model shape the Generator works with
 * (docs: `docs/normalized-model.md`).
 *
 * Stack-agnostic: no Mongoose / EF / Prisma names. The only exception is `native`, which keeps the parser's
 * raw type string when it is not the canonical spelling for `kind` (parser types are open-ended, e.g.
 * `schema.types.decimal128`); only the same stack's emitter reads it.
 *
 * Optional properties mirror presence: a property is set exactly when the source had it.
 */

export const NORMALIZED_MODEL_VERSION = 2;

export type FieldKind =
  | 'string'
  | 'number'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'enum'
  | 'reference'
  | 'object'
  | 'map'
  /** Opaque value (Mongoose `Mixed`). */
  | 'json'
  /** Parser type the Generator does not model yet (e.g. `buffer`); see `native.type`. */
  | 'unknown';

export type FilterType = 'eq' | 'regex' | 'range' | 'date-range' | 'boolean' | 'enum' | 'reference';

/** `number` storage. Absent → `float` (JSON number; C# `double`). Editor shows this only for C# and Python. */
export type NumberFormat = 'int' | 'float';
/** `date` storage. Absent → `datetime` (ISO-8601). `date` → calendar day (`YYYY-MM-DD`; C# `DateOnly`). */
export type DateFormat = 'datetime' | 'date';
/** `string` wire format. Absent → plain text. */
export type StringFormat = 'email';
/**
 * Enum definition. `values` are the labels (string enums: also the stored / JSON value).
 * `numbers` → numeric enum: `numbers[i]` is the stored / JSON value of `values[i]` (C# `Name = 5`, Python `IntEnum`,
 * Mongoose `enum: [0, 5]`). Explicit, so reordering or inserting labels never changes stored numbers.
 */
export interface NormalizedEnum {
  values: string[];
  numbers?: number[];
}

/**
 * Request limits. Written into the BE schema and the admin form rules. Only on single (non-array) fields:
 * `minLength` / `maxLength` / `pattern` on strings (text length), `min` / `max` on number / decimal.
 * `constraintsForField` (`fieldConstraints.ts`) drops the rest.
 */
export interface FieldConstraints {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
}

export type RelationType = 'oneToOne' | 'oneToMany' | 'manyToOne' | 'manyToMany';

/** Normal (mobile) API endpoints a model exposes (contract §2.1, G3). */
export type NormalOperation = 'list' | 'getOne' | 'create' | 'update' | 'delete';
export const NORMAL_OPERATIONS: readonly NormalOperation[] = ['list', 'getOne', 'create', 'update', 'delete'];
export const NORMAL_WRITE_OPERATIONS: readonly NormalOperation[] = ['create', 'update', 'delete'];

/**
 * Stack-native details kept for fidelity; only the same stack's parser / emitter reads them.
 * Mongoose: raw type string, verbatim field options, declared TS type and JSDoc of the interface property.
 */
export interface NativeType {
  /** Raw parser type string (e.g. `schema.types.decimal128`); absent when canonical for `kind`. */
  type?: string;
  /** Field options the Generator does not model, verbatim (e.g. `uppercase: true`). */
  options?: string[];
  /** Declared TS type of the model interface property (e.g. `UserSubscriptionStatus`). */
  tsType?: string;
  tsOptional?: boolean;
  /** JSDoc above the interface property, verbatim. */
  doc?: string;
}

export interface NormalizedReference {
  /** UI toggle "include relation" (populate on list / detail). */
  include?: boolean;
  /** Target model name. */
  target?: string;
  /** Field shown for the related record (Generator UI: relation property). */
  display?: string;
  /** Fields the backend populates into the related object. */
  populate?: string[];
  /** Sub-fields of `display` when it is an object (resolved from the target at codegen time). */
  displayObjectFields?: Array<{ name: string; type: string; required: boolean; trim?: boolean }>;
  relationType?: RelationType;
}

export interface NormalizedSubReference {
  include?: boolean;
  /** Target model name as set in the Generator UI. */
  target?: string;
  /** Model name from the schema's own `ref:` (kept separately; both exist in saved data). */
  ref?: string;
  /** Target field the admin shows for the id (autocomplete option, selected value). Sub-field references are
   * not populated by the BE, so the admin reads the label from the target's list. */
  display?: string;
}

/** Field of an embedded object (`object.fields`). */
export interface NormalizedObjectSubField {
  name: string;
  kind: FieldKind;
  required: boolean;
  nullable?: boolean;
  trim?: boolean;
  /** Set only for `kind: 'number'` (C# `int`, Python `int`). Absent → float. */
  numberFormat?: NumberFormat;
  reference?: NormalizedSubReference;
  native?: NativeType;
}

export interface NormalizedObject {
  /** Absent → no sub-field info (opaque object). */
  fields?: NormalizedObjectSubField[];
  /** Named nested TS interface, e.g. `ISubscriptionLimits`. */
  typeName?: string;
  /** Named nested schema, e.g. `SubscriptionLimitsSchema`. */
  schemaName?: string;
}

export interface NormalizedFilter {
  /** Generator UI "searchable". */
  searchable?: boolean;
  type?: FilterType;
  /** Filter type string the Generator does not know (kept for round trip). */
  nativeType?: string;
}

export interface NormalizedAccess {
  readonly?: boolean;
  hiddenFromCreate?: boolean;
  hiddenFromUpdate?: boolean;
  /** Never returned by generated CRUD (contract §2.1, G2) — filled from P3. */
  hidden?: boolean;
  /** Not writable through the normal (mobile) API; admin create / update schemas keep it (G5, P4). */
  adminOnly?: boolean;
  /**
   * Derived when read (e.g. a live price): never stored, not in create / update bodies, no filter, no sort. The row
   * carries it (optional); the module's `map_rows` / `mapRows` hook fills it.
   */
  computed?: boolean;
  /** Heavy body read only by getOne (e.g. a report's analysis blob): left out of list reads, `null` in list rows. */
  detailOnly?: boolean;
}

export interface NormalizedUi {
  label?: string;
  /** Shown as a table column. */
  list?: boolean;
  /** UI component hint (`TextField`, `DatePicker`, …). */
  component?: string;
  /** Form default typed in the Generator UI (string). */
  defaultValue?: string;
}

export interface NormalizedField {
  name: string;
  kind: FieldKind;
  isArray: boolean;
  required: boolean;
  nullable?: boolean;
  unique?: boolean;
  trim?: boolean;
  /** Set only for `kind: 'number'`. Absent → float. */
  numberFormat?: NumberFormat;
  /** Set only for `kind: 'date'`. Absent → datetime. */
  dateFormat?: DateFormat;
  /** Set only for `kind: 'string'`. */
  format?: StringFormat;
  constraints?: FieldConstraints;
  native?: NativeType;
  /** Enum values — filled from P3 (parser `enum: [...]`). `numbers` → numeric enum (see `NormalizedEnum`). */
  enum?: NormalizedEnum;
  /** Schema default — filled from P3 (parser `default:`). */
  default?: string | number | boolean | null;
  reference?: NormalizedReference;
  object?: NormalizedObject;
  filter?: NormalizedFilter;
  access?: NormalizedAccess;
  ui?: NormalizedUi;
}

export interface NormalizedNestedSchema {
  entityName: string;
  fields: NormalizedField[];
  nestedSchemas?: NormalizedNestedSchema[];
  nestedTypeName?: string;
}

export interface NormalizedApi {
  /** Normal (mobile) API operations. Absent → every operation is requested (pre-P4 behaviour, non-UI callers). */
  normalOperations?: NormalOperation[];
  /** Normal API requires auth (`authMiddleware`); forced on when a write operation is selected. */
  requiresAuth?: boolean;
  /** Admin API (`*.routes.admin.ts` / `*.service.admin.ts`). */
  admin?: boolean;
  /** Admin API operations. Absent → every operation; `list` is always on (the admin screen is a list). */
  adminOperations?: NormalOperation[];
}

/** Admin operations a model exposes (`api.adminOperations`, `list` forced); every BE generator and the admin config read this. */
export function resolveAdminOperations(api: NormalizedApi | undefined): NormalOperation[] {
  const requested = api?.adminOperations;
  return NORMAL_OPERATIONS.filter(op => op === 'list' || requested === undefined || requested.includes(op));
}

export interface NormalizedModel {
  schemaVersion: typeof NORMALIZED_MODEL_VERSION;
  entityName: string;
  fields: NormalizedField[];
  /** Named sub-schemas declared next to the model (e.g. `SubscriptionLimitsSchema`). */
  nestedSchemas?: NormalizedNestedSchema[];
  /** Interface name from `new Schema<IFoo>` when present. */
  nestedTypeName?: string;
  /** Schema timestamps (P3); absent when the source does not say. */
  timestamps?: { createdAt: boolean; updatedAt: boolean };
  /**
   * Stack-native model details (P3). Mongoose: the name given to `mongoose.model()` and the schema's
   * `collection` option; together they decide the collection, so both survive a regenerate.
   */
  native?: { modelName?: string; collection?: string };
  /**
   * Who owns a record for the normal API (P4). Absent → derived: a `userId` field means `field`.
   * `self`: the record is the user (`users`) → normal API scope `{ _id: authUserId }` (G5).
   */
  ownership?: { kind: 'field' | 'self' };
  /** Per-model API settings, stored in the manifest (P5, G3). */
  api?: NormalizedApi;
  /** Model-level UI settings, stored in the manifest: `label` = admin menu / page title (default: humanized entity name). */
  ui?: { label?: string };
}

// --- Canonical shape --------------------------------------------------------------------------------------

/** Keys in canonical order; `undefined` values and empty sub-objects are dropped. */
function ordered<T extends object>(value: T, keys: Array<keyof T>, rest = false): T {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const v = (value as Record<string, unknown>)[key as string];
    if (v !== undefined) out[key as string] = v;
  }
  if (rest) {
    for (const [key, v] of Object.entries(value)) if (v !== undefined && !(key in out)) out[key] = v;
  }
  return out as T;
}

function sub<T extends object>(value: T | undefined, keys: Array<keyof T>, rest = false): T | undefined {
  if (!value) return undefined;
  const out = ordered(value, keys, rest);
  return Object.keys(out).length ? out : undefined;
}

function canonicalSubField(f: NormalizedObjectSubField): NormalizedObjectSubField {
  return ordered(
    {
      ...f,
      reference: sub(f.reference, ['include', 'target', 'ref', 'display']),
      native: sub(f.native, ['type', 'options', 'tsType', 'tsOptional', 'doc'], true)
    },
    ['name', 'kind', 'required', 'nullable', 'trim', 'numberFormat', 'reference', 'native']
  );
}

export function canonicalField(f: NormalizedField): NormalizedField {
  return ordered(
    {
      ...f,
      native: sub(f.native, ['type'], true),
      reference: sub(f.reference, ['include', 'target', 'display', 'populate', 'displayObjectFields', 'relationType']),
      object: sub({ ...f.object, fields: f.object?.fields?.map(canonicalSubField) }, ['fields', 'typeName', 'schemaName']),
      enum: sub(f.enum, ['values', 'numbers']),
      constraints: sub(f.constraints, ['minLength', 'maxLength', 'min', 'max', 'pattern']),
      filter: sub(f.filter, ['searchable', 'type', 'nativeType']),
      access: sub(f.access, ['readonly', 'hiddenFromCreate', 'hiddenFromUpdate', 'hidden', 'adminOnly', 'computed', 'detailOnly']),
      ui: sub(f.ui, ['label', 'list', 'component', 'defaultValue'])
    },
    [
      'name',
      'kind',
      'isArray',
      'required',
      'nullable',
      'unique',
      'trim',
      'numberFormat',
      'dateFormat',
      'format',
      'constraints',
      'native',
      'enum',
      'default',
      'reference',
      'object',
      'filter',
      'access',
      'ui'
    ]
  );
}

function canonicalNested(n: NormalizedNestedSchema): NormalizedNestedSchema {
  return ordered({ ...n, fields: n.fields.map(canonicalField), nestedSchemas: n.nestedSchemas?.map(canonicalNested) }, [
    'entityName',
    'fields',
    'nestedSchemas',
    'nestedTypeName'
  ]);
}

/**
 * The model in canonical form: keys in schema order, no `undefined` values, no empty sub-objects. Stored JSON
 * (manifest) is written from this form, so editing a model in the UI does not reorder its manifest row.
 */
export function canonicalModel(m: NormalizedModel): NormalizedModel {
  return ordered(
    {
      ...m,
      fields: m.fields.map(canonicalField),
      nestedSchemas: m.nestedSchemas?.map(canonicalNested),
      native: sub(m.native, ['modelName', 'collection']),
      ownership: sub(m.ownership, ['kind']),
      api: sub(m.api, ['normalOperations', 'requiresAuth', 'admin', 'adminOperations']),
      ui: sub(m.ui, ['label'])
    },
    ['schemaVersion', 'entityName', 'fields', 'nestedSchemas', 'nestedTypeName', 'timestamps', 'native', 'ownership', 'api', 'ui']
  );
}

/**
 * Update body `null` rule (api-contract §5, JSON Merge Patch): an omitted field is unchanged; `null` clears a single
 * optional (or `nullable`) field (Mongo `$unset`, SQL `NULL`). A required field and an array take no `null` (400);
 * an array is emptied with `[]`. Express (zod), Python (`NotNull`) and .NET (`PatchBody`) generators read this one rule.
 */
export function updateNullClears(field: { required?: boolean; nullable?: boolean; isArray?: boolean }): boolean {
  if (field.isArray === true) return false;
  return field.required !== true || field.nullable === true;
}
