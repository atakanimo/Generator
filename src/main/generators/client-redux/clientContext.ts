/**
 * NormalizedModel v2 → template context of a client data-layer module (plan client-data-layer §3).
 * Pure: no file system. Types follow the wire shape of the contract (§4 rows, §5 bodies), not the DB.
 */
import type { NormalOperation, NormalizedField, NormalizedModel, NormalizedObjectSubField } from '../../../shared/normalizedModel.js';
import { resolveNormalApi, type NormalApiSurface } from '../../../shared/normalApi.js';
import { effectiveFilterType } from '../../../shared/fieldFilter.js';
import type { ClientPreset } from './clientPreset.js';

export interface ClientContextOptions {
  model: NormalizedModel;
  /** Every model of the backend (populated relation types are read from the target). */
  models: NormalizedModel[];
  /** Normal router mount path, e.g. `/api/transactions`. */
  endpoint: string;
  preset: ClientPreset;
  /** The BE writes `null` for an empty optional field (.NET); Express leaves it out (contract §4). */
  optionalAsNull: boolean;
}

export interface ClientTypeProp {
  name: string;
  optional: boolean;
  type: string;
}

export interface ClientModuleContext {
  entity: string;
  /** File base + slice key: `Transactions` → `transactions`, `UserWatchList` → `userWatchList`. */
  camel: string;
  endpoint: string;
  imports: ClientPreset['imports'];
  surface: NormalApiSurface;
  ops: Record<NormalOperation, boolean>;
  hasOps: boolean;
  names: {
    row: string;
    saved: string;
    createInput: string;
    updateInput: string;
    query: string;
    listBody: string;
    deleteFn: string;
  };
  rowProps: ClientTypeProp[];
  /** Create / update answer: relations are ids there (contract §4); absent when it equals the row. */
  savedProps?: ClientTypeProp[];
  /** Relations that are populated objects in the row but ids in the saved answer (slice merge). */
  populatedRefs: Array<{ name: string; isArray: boolean }>;
  createProps: ClientTypeProp[];
  updateProps: ClientTypeProp[];
  queryProps: ClientTypeProp[];
}

export function clientModuleName(entityName: string): string {
  return entityName.charAt(0).toLowerCase() + entityName.slice(1);
}

// --- Scalars ---------------------------------------------------------------------------------------------

type Mode = 'read' | 'write';

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function enumType(values: readonly string[] | undefined): string {
  return values && values.length ? values.map(quote).join(' | ') : 'string';
}

function scalarType(kind: NormalizedField['kind'], mode: Mode, enumValues?: readonly string[]): string {
  switch (kind) {
    case 'string':
    case 'decimal':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    // ISO-8601 on the wire; a `Date` serializes to the same string on the way in.
    case 'date':
      return mode === 'read' ? 'string' : 'string | Date';
    case 'enum':
      return enumType(enumValues);
    case 'reference':
      return 'string';
    case 'map':
    case 'object':
      return 'Record<string, unknown>';
    default:
      return 'unknown';
  }
}

function arrayOf(type: string): string {
  return /^[\w.<>, ]+$/.test(type) && !type.includes(',') ? `${type}[]` : `Array<${type}>`;
}

function inlineObject(props: ClientTypeProp[]): string {
  if (!props.length) return 'Record<string, unknown>';
  return `{ ${props.map(p => `${p.name}${p.optional ? '?' : ''}: ${p.type}`).join('; ')} }`;
}

function subFieldProp(sub: NormalizedObjectSubField, mode: Mode): ClientTypeProp {
  let type = scalarType(sub.kind, mode);
  if (sub.nullable) type = `${type} | null`;
  return { name: sub.name, optional: !sub.required, type };
}

// --- Relations -------------------------------------------------------------------------------------------

/** `{ id; <populate fields> }` as the BE returns it on list / getOne (contract §4). */
function populatedType(field: NormalizedField, models: NormalizedModel[], optionalAsNull: boolean): string | null {
  const ref = field.reference;
  if (!ref?.include || !ref.target) return null;
  const selected = (ref.populate?.length ? ref.populate : ref.display ? [ref.display] : []).filter(n => n !== '_id' && n !== 'id');
  const target = models.find(m => m.entityName === ref.target);
  const props: ClientTypeProp[] = [{ name: 'id', optional: false, type: 'string' }];
  if (!target) return `{ id: string; [key: string]: unknown }`;
  for (const name of selected) {
    const tf = target.fields.find(f => f.name === name);
    if (!tf || tf.access?.hidden === true) continue;
    // A relation inside the populated object is its id (populate is one level deep).
    props.push(valueProp(tf, 'read', models, optionalAsNull, false));
  }
  return inlineObject(props);
}

// --- Fields ----------------------------------------------------------------------------------------------

function baseType(field: NormalizedField, mode: Mode, models: NormalizedModel[], optionalAsNull: boolean, populate: boolean): string {
  if (field.kind === 'reference' && mode === 'read' && populate) {
    const populated = populatedType(field, models, optionalAsNull);
    if (populated) return populated;
  }
  if (field.kind === 'object' && field.object?.fields) return inlineObject(field.object.fields.map(sub => subFieldProp(sub, mode)));
  return scalarType(field.kind, mode, field.enum?.values);
}

function valueProp(field: NormalizedField, mode: Mode, models: NormalizedModel[], optionalAsNull: boolean, populate: boolean): ClientTypeProp {
  let type = baseType(field, mode, models, optionalAsNull, populate);
  if (field.isArray) type = arrayOf(type);
  const nullable = field.nullable === true || field.default === null || (mode === 'read' && optionalAsNull && !field.required);
  if (nullable) type = `${type} | null`;
  return { name: field.name, optional: !field.required, type };
}

// --- Filters (contract §3) -------------------------------------------------------------------------------

type ContractFilter = 'eq' | 'regex' | 'range' | 'date-range' | 'boolean' | 'enum' | 'reference';

function filterTypeOf(field: NormalizedField): ContractFilter {
  // Same rule as the BE (`effectiveFilterType`); kinds without a BE filter fall back to a text value.
  return effectiveFilterType(field) ?? field.filter?.type ?? 'regex';
}

function filterProp(field: NormalizedField): ClientTypeProp {
  const scalar = scalarType(field.kind, 'write', field.enum?.values);
  let type: string;
  switch (filterTypeOf(field)) {
    case 'reference':
    case 'regex':
      type = 'string';
      break;
    case 'range':
      type = `${scalar} | { min?: ${scalar}; max?: ${scalar} }`;
      break;
    case 'date-range':
      type = '{ from?: string | Date; to?: string | Date } | string | Date';
      break;
    case 'boolean':
      type = 'boolean';
      break;
    case 'enum': {
      const values = enumType(field.enum?.values);
      type = values === 'string' ? 'string | string[]' : `${values} | Array<${values}>`;
      break;
    }
    default:
      type = scalar;
  }
  return { name: field.name, optional: true, type };
}

// --- Context ---------------------------------------------------------------------------------------------

const TIMESTAMPS = ['createdAt', 'updatedAt'] as const;

export function buildClientModuleContext(options: ClientContextOptions): ClientModuleContext {
  const { model, models, endpoint, preset, optionalAsNull } = options;
  const entity = model.entityName;
  const surface = resolveNormalApi(model);
  const ops = { list: false, getOne: false, create: false, update: false, delete: false } as Record<NormalOperation, boolean>;
  for (const op of surface.operations) ops[op] = true;

  const readProps = (populate: boolean): ClientTypeProp[] => {
    const props = [
      { name: 'id', optional: false, type: 'string' },
      ...surface.readFields.map(f => valueProp(f, 'read', models, optionalAsNull, populate))
    ];
    // Schema timestamps are always set, whether or not the model file declares them as fields.
    for (const ts of TIMESTAMPS) {
      if (!model.timestamps?.[ts]) continue;
      const at = props.findIndex(p => p.name === ts);
      const prop = { name: ts, optional: false, type: 'string' };
      if (at === -1) props.push(prop);
      else props[at] = prop;
    }
    return props;
  };
  const rowProps = readProps(true);
  const populatedRefs = surface.readFields
    .filter(f => f.kind === 'reference' && populatedType(f, models, optionalAsNull) !== null)
    .map(f => ({ name: f.name, isArray: f.isArray }));
  const savedProps = populatedRefs.length ? readProps(false) : undefined;

  const write = (fields: NormalizedField[], allOptional: boolean) =>
    fields.map(f => {
      const prop = valueProp(f, 'write', models, optionalAsNull, false);
      return allOptional ? { ...prop, optional: true } : prop;
    });

  return {
    entity,
    camel: clientModuleName(entity),
    endpoint: endpoint.replace(/\/+$/, ''),
    imports: preset.imports,
    surface,
    ops,
    hasOps: surface.operations.length > 0,
    names: {
      row: `I${entity}`,
      saved: savedProps ? `I${entity}Saved` : `I${entity}`,
      createInput: `I${entity}Input`,
      updateInput: `I${entity}UpdateInput`,
      query: `Get${entity}Query`,
      listBody: `Get${entity}ListBody`,
      deleteFn: `delete${entity}`
    },
    rowProps,
    savedProps,
    populatedRefs,
    // A field with a schema default may be left out of create (the BE fills it).
    createProps: write(surface.createFields, false).map((p, i) =>
      surface.createFields[i].default !== undefined ? { ...p, optional: true } : p
    ),
    updateProps: write(surface.updateFields, true),
    queryProps: [{ name: 'id', optional: true, type: 'string' }, ...surface.filterFields.map(filterProp)]
  };
}
