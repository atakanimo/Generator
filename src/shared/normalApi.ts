/**
 * Normal (mobile / web) API surface of a model (contract §2 "Normal API", §5): which operations are open and which
 * fields each one reads or writes. Pure; client emitters read it so a client calls exactly what the BE serves.
 *
 * Mirrors the BE generators (Express `BackendGenerator.resolveNormalApi` + `zodFieldScoped`, .NET
 * `dotnetContext` `normalFields`): change them together.
 */
import {
  NORMAL_OPERATIONS,
  NORMAL_WRITE_OPERATIONS,
  type NormalOperation,
  type NormalizedField,
  type NormalizedModel
} from './normalizedModel.js';

export interface NormalOwnership {
  kind: 'field' | 'self';
  /** Owner reference field (`userId`) for `field`: taken from auth, never in a normal body or filter. */
  field?: string;
}

export interface NormalApiSurface {
  operations: NormalOperation[];
  /** Requested but closed by the contract (writes need auth + ownership; `self` has no create). */
  dropped: NormalOperation[];
  ownership?: NormalOwnership;
  requiresAuth: boolean;
  /** Fields a response carries (no `hidden`, no `id` / `_id`). */
  readFields: NormalizedField[];
  createFields: NormalizedField[];
  updateFields: NormalizedField[];
  /** Searchable, non-hidden fields; the owner field is not filterable on the normal API. */
  filterFields: NormalizedField[];
}

const ID_FIELDS = new Set(['id', '_id']);

/** Owner field: a `userId` reference (both BE generators look for exactly this). */
function ownerFieldOf(model: NormalizedModel): NormalizedField | undefined {
  return model.fields.find(f => f.name === 'userId' && f.kind === 'reference');
}

export function resolveNormalOwnership(model: NormalizedModel): NormalOwnership | undefined {
  const owner = ownerFieldOf(model);
  const kind = model.ownership?.kind ?? (owner ? 'field' : undefined);
  if (kind === 'self') return { kind };
  if (kind === 'field' && owner) return { kind, field: owner.name };
  return undefined;
}

function writable(field: NormalizedField, mode: 'create' | 'update'): boolean {
  const access = field.access ?? {};
  if (access.readonly === true || access.adminOnly === true) return false;
  return mode === 'create' ? access.hiddenFromCreate !== true : access.hiddenFromUpdate !== true;
}

export function resolveNormalApi(model: NormalizedModel): NormalApiSurface {
  const requiresAuth = model.api?.requiresAuth !== false;
  const ownership = resolveNormalOwnership(model);
  const canWrite = requiresAuth && ownership !== undefined;
  const requested = model.api?.normalOperations ?? [...NORMAL_OPERATIONS];

  const operations: NormalOperation[] = [];
  const dropped: NormalOperation[] = [];
  for (const op of NORMAL_OPERATIONS) {
    if (!requested.includes(op)) continue;
    const closed = (NORMAL_WRITE_OPERATIONS.includes(op) && !canWrite) || (op === 'create' && ownership?.kind === 'self');
    (closed ? dropped : operations).push(op);
  }

  const fields = model.fields.filter(f => !ID_FIELDS.has(f.name));
  const isOwner = (f: NormalizedField) => ownership?.kind === 'field' && f.name === ownership.field;
  return {
    operations,
    dropped,
    ownership,
    requiresAuth,
    readFields: fields.filter(f => f.access?.hidden !== true),
    createFields: fields.filter(f => writable(f, 'create') && !isOwner(f)),
    updateFields: fields.filter(f => writable(f, 'update') && !isOwner(f)),
    filterFields: fields.filter(f => f.filter?.searchable === true && f.access?.hidden !== true && !isOwner(f))
  };
}
