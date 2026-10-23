/**
 * Model editor (AddModelModal → `project:createModel` / `project:updateModel`): the model is NormalizedModel v2.
 *
 * The modal edits v2 fields in place, so a field the user does not touch is saved exactly as it was parsed
 * (enum, default, verbatim options, declared TS type, JSDoc, hidden). Its "Type" select is a view over
 * `kind` + `isArray` (`editorTypeOf` / `withEditorType`).
 */
import type { NormalizedField, NormalizedModel, NormalizedObjectSubField } from './normalizedModel.js';
import { typeTokenOf } from './fieldTypeToken.js';
import { constraintsForField, syncEnumNumbers } from './fieldConstraints.js';

/** `numberFormat` is a C# / Python choice (JSON number is the same). Hidden for Express. */
export function editorShowsNumberFormat(sourceType: string | null | undefined): boolean {
  return sourceType === 'dotnet-ef' || sourceType === 'python-fastapi';
}

/** What the model editor saves: the model plus the seed (`initialize<Model>`) function, which only the file holds. */
export interface ModelDraft {
  /** `entityName` = model name; fields without `_id` / `createdAt` / `updatedAt`. */
  model: NormalizedModel;
  /** Present → the file gets an `initialize<Model>()` seed function with these rows. */
  seed?: { data?: Array<Record<string, unknown>> };
}

/** Fields the Generator adds itself (record id, timestamps) — never edited in the model editor. */
export const SYNTHETIC_FIELD_NAMES: readonly string[] = ['_id', 'createdAt', 'updatedAt'];

/** `id` / `_id` are the record identity on the wire / in Mongo (contract K1) — never a model field name. */
export function isReservedFieldName(name: string): boolean {
  const n = name.trim();
  return n === 'id' || n === '_id';
}

// --- Editor type select ------------------------------------------------------------------------------------

/** `Other`: a kind the editor cannot create (`json`, `unknown`); shown read-only, kept as parsed. */
export type EditorFieldType = 'String' | 'Number' | 'Boolean' | 'Date' | 'ObjectId' | 'Array' | 'Object' | 'Map' | 'Other';
export type EditorSubFieldType = 'String' | 'Number' | 'Boolean' | 'ObjectId' | 'Date';

export const EDITOR_FIELD_TYPES: readonly Exclude<EditorFieldType, 'Other'>[] = [
  'String',
  'Number',
  'Boolean',
  'Date',
  'ObjectId',
  'Array',
  'Object',
  'Map'
];
export const EDITOR_SUB_FIELD_TYPES: readonly EditorSubFieldType[] = ['String', 'Number', 'Boolean', 'ObjectId', 'Date'];

export function editorTypeOf(field: NormalizedField): EditorFieldType {
  if (field.kind === 'object') return 'Object';
  if (field.kind === 'map') return 'Map';
  if (field.isArray) return 'Array';
  switch (field.kind) {
    case 'number':
    case 'decimal':
      return 'Number';
    case 'boolean':
      return 'Boolean';
    case 'date':
      return 'Date';
    case 'reference':
      return 'ObjectId';
    case 'string':
      return 'String';
    case 'enum':
      return typeTokenOf(field) === 'number' ? 'Number' : 'String';
    default:
      return 'Other';
  }
}

export function editorSubTypeOf(sub: NormalizedObjectSubField): EditorSubFieldType {
  switch (sub.kind) {
    case 'number':
    case 'decimal':
      return 'Number';
    case 'boolean':
      return 'Boolean';
    case 'date':
      return 'Date';
    case 'reference':
      return 'ObjectId';
    default:
      return 'String';
  }
}

export function newObjectSubField(): NormalizedObjectSubField {
  return { name: '', kind: 'string', required: false, trim: true };
}

/** A field of the chosen editor type: name / required / unique / trim carry over; enum, default and type details reset. */
export function withEditorType(field: NormalizedField, type: Exclude<EditorFieldType, 'Other'>): NormalizedField {
  const base = { name: field.name, required: field.required };
  switch (type) {
    case 'Object':
      return { ...base, kind: 'object', isArray: false, unique: false, trim: false, object: { fields: [newObjectSubField()] } };
    case 'Array':
      return { ...base, kind: 'string', isArray: true, unique: field.unique, trim: field.trim };
    case 'Map':
      return { ...base, kind: 'map', isArray: false, unique: field.unique, trim: field.trim };
    case 'ObjectId':
      return { ...base, kind: 'reference', isArray: false, unique: field.unique, trim: field.trim };
    case 'Number':
      return { ...base, kind: 'number', isArray: false, unique: field.unique, trim: field.trim };
    case 'Boolean':
      return { ...base, kind: 'boolean', isArray: false, unique: field.unique, trim: field.trim };
    case 'Date':
      return { ...base, kind: 'date', isArray: false, unique: field.unique, trim: field.trim };
    default:
      return { ...base, kind: 'string', isArray: false, unique: field.unique, trim: field.trim };
  }
}

export function withEditorSubType(sub: NormalizedObjectSubField, type: EditorSubFieldType): NormalizedObjectSubField {
  const base = { name: sub.name, required: sub.required };
  switch (type) {
    case 'Number':
      return { ...base, kind: 'number', trim: false };
    case 'Boolean':
      return { ...base, kind: 'boolean', trim: false };
    case 'Date':
      return { ...base, kind: 'date', trim: false };
    case 'ObjectId':
      return { ...base, kind: 'reference', trim: false };
    default:
      return { ...base, kind: 'string', trim: sub.trim ?? true };
  }
}

/** Mongoose `ref` of an ObjectId field. */
export function referenceTargetOf(field: NormalizedField): string {
  return field.reference?.target ?? '';
}

export function withReferenceTarget(field: NormalizedField, target: string | undefined): NormalizedField {
  const { target: _t, include: _i, ...rest } = field.reference ?? {};
  const reference = target ? { ...rest, include: true, target } : rest;
  const out: NormalizedField = { ...field, reference };
  if (Object.keys(reference).length === 0) delete out.reference;
  return out;
}

export function subReferenceOf(sub: NormalizedObjectSubField): string {
  return sub.reference?.ref ?? sub.reference?.target ?? '';
}

export function withSubReference(sub: NormalizedObjectSubField, ref: string | undefined): NormalizedObjectSubField {
  const { ref: _r, target: _t, ...rest } = sub.reference ?? {};
  const reference = ref ? { ...rest, ref } : rest;
  const out: NormalizedObjectSubField = { ...sub, reference };
  if (Object.keys(reference).length === 0) delete out.reference;
  return out;
}

export function withConstraint(field: NormalizedField, key: 'minLength' | 'maxLength' | 'min' | 'max', raw: string): NormalizedField {
  const constraints = { ...field.constraints };
  if (raw.trim() === '') delete constraints[key];
  else {
    const n = Number(raw);
    if (!Number.isFinite(n)) return field;
    constraints[key] = n;
  }
  const out = { ...field };
  if (Object.keys(constraints).length) out.constraints = constraints;
  else delete out.constraints;
  return out;
}

export function withPattern(field: NormalizedField, raw: string): NormalizedField {
  const constraints = { ...field.constraints };
  if (!raw.trim()) delete constraints.pattern;
  else constraints.pattern = raw;
  const out = { ...field };
  if (Object.keys(constraints).length) out.constraints = constraints;
  else delete out.constraints;
  return out;
}

/** String field enum values: set → `kind: 'enum'`, cleared → `kind: 'string'`. */
export function withEnumValues(field: NormalizedField, values: string[] | undefined): NormalizedField {
  const out = { ...field };
  if (values?.length) {
    out.kind = 'enum';
    // A numeric enum stays numeric; labels added at the end get the next free number.
    out.enum = field.enum?.numbers ? { values, numbers: syncEnumNumbers(field.enum.numbers, values.length) } : { values };
  } else {
    if (out.kind === 'enum') out.kind = 'string';
    delete out.enum;
  }
  return out;
}

/**
 * Numeric enum on / off, or new numbers (`numbers[i]` is the stored value of label i). `undefined` → string enum.
 * Turning it on starts from 0, 1, 2… which the user may then change.
 */
export function withEnumNumbers(field: NormalizedField, numbers: number[] | undefined): NormalizedField {
  if (!field.enum) return field;
  const out = { ...field };
  out.enum = numbers ? { values: field.enum.values, numbers: syncEnumNumbers(numbers, field.enum.values.length) } : { values: field.enum.values };
  return out;
}

/** Schema `default:` applies to String / Number / Boolean fields only. */
export function editorTypeHasDefault(type: EditorFieldType): boolean {
  return type === 'String' || type === 'Number' || type === 'Boolean';
}

/**
 * Tidy a field the user edited, before save: trimmed names, named sub-fields only, sub-field options that
 * belong to their type, no default on types without one.
 */
/** Drop type details that do not belong to the kind the editor saved. */
function tidyTypeDetails(out: NormalizedField): void {
  if (out.kind !== 'number' || out.numberFormat !== 'int') delete out.numberFormat;
  if (out.kind !== 'date' || out.dateFormat !== 'date') delete out.dateFormat;
  if (out.kind !== 'string' || out.enum?.values?.length || out.format !== 'email') delete out.format;
  if (out.enum?.numbers) {
    out.enum = out.enum.numbers.length ? { ...out.enum, numbers: syncEnumNumbers(out.enum.numbers, out.enum.values.length) } : { values: out.enum.values };
  }
  const constraints = constraintsForField(out, out.constraints);
  if (constraints) out.constraints = constraints;
  else delete out.constraints;
}

export function normalizeEditedField(field: NormalizedField): NormalizedField {
  const out: NormalizedField = { ...field, name: field.name.trim() };
  if (out.kind === 'object') {
    delete out.enum;
    delete out.default;
    delete out.numberFormat;
    delete out.dateFormat;
    delete out.format;
    delete out.constraints;
    if (out.object) {
      const typeName = out.object.typeName?.trim();
      const schemaName = out.object.schemaName?.trim();
      const object = { ...out.object };
      if (typeName) object.typeName = typeName;
      else delete object.typeName;
      if (schemaName) object.schemaName = schemaName;
      else delete object.schemaName;
      if (object.fields) {
        object.fields = object.fields
          .map(sub => ({ ...sub, name: sub.name.trim() }))
          .filter(sub => sub.name)
          .map(sub => {
            const s: NormalizedObjectSubField = { ...sub, trim: sub.kind === 'string' ? Boolean(sub.trim) : false };
            if (sub.kind === 'number') s.nullable = Boolean(sub.nullable);
            else delete s.nullable;
            if (sub.kind !== 'reference') delete s.reference;
            return s;
          });
      }
      out.object = object;
    }
    return out;
  }
  if (!editorTypeHasDefault(editorTypeOf(out))) delete out.default;
  tidyTypeDetails(out);
  return out;
}
