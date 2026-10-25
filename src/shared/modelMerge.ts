/**
 * Schema designer model: the parsed model file merged with the stored UI / API settings (manifest row), as
 * NormalizedModel v2. The model file is the source of truth for types and schema options; the manifest keeps
 * what only the Generator UI sets (labels, components, filters, relations, access, API settings).
 */
import {
  canonicalField,
  canonicalModel,
  type NormalizedField,
  type NormalizedModel,
  type NormalizedReference,
  type RelationType
} from './normalizedModel.js';
import { constraintsForField, isNumericEnum } from './fieldConstraints.js';
import { filterFromToken, filterTokenOf, typeTokenOf, type FilterToken } from './fieldTypeToken.js';
import { isMongooseSourceType } from './schemaFieldTypes.js';

export type SourceType = 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | 'python-fastapi' | null;

export type UIComponent =
  | 'TextField'
  | 'TextArea'
  | 'NumberField'
  | 'Switch'
  | 'Select'
  | 'DatePicker'
  | 'MultiSelect'
  | 'ImageField'
  | 'Autocomplete'
  | 'AsyncSelect'
  | 'Chips';

const token = (field: NormalizedField): string => typeTokenOf(field).toLowerCase();

function isActiveRelation(field: NormalizedField): boolean {
  return field.reference?.include === true && token(field) === 'schema' && Boolean(field.reference.target);
}

function resolveRelationType(field: NormalizedField): RelationType | undefined {
  if (!isActiveRelation(field)) return undefined;
  if (field.reference?.relationType) return field.reference.relationType;
  return field.isArray ? 'oneToMany' : 'manyToOne';
}

function withReference(field: NormalizedField, reference: Partial<NormalizedReference>): NormalizedField {
  return canonicalField({ ...field, reference });
}

/** Drop relationType (and keep relation meta consistent) when the relation is off. */
export function sanitizeFieldRelationMeta(field: NormalizedField): NormalizedField {
  return withReference(field, { ...field.reference, relationType: resolveRelationType(field) });
}

/** Mongo `_id`: always required, ObjectId (`reference`). */
export function normalizeMongoIdField(field: NormalizedField, sourceType?: SourceType | null): NormalizedField {
  if (!isMongooseSourceType(sourceType) || field.name !== '_id') return field;
  const kind = field.enum ? 'enum' : 'reference';
  const { type: _type, ...native } = field.native ?? {};
  return canonicalField({
    ...field,
    kind,
    native: { ...(kind === 'enum' ? { type: 'schema' } : {}), ...native },
    required: true,
    isArray: false
  });
}

function formatLabel(name: string): string {
  let formatted = name.replace(/([a-z])([A-Z])/g, '$1 $2');
  formatted = formatted.replace(/_/g, ' ');
  formatted = formatted.replace(/-/g, ' ');
  return formatted
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * UI components that fit the field's kind (plan 6 §3.1). The schema designer offers only these; a
 * stored component outside the list is still shown so it can be changed.
 */
export function uiComponentOptionsFor(field: Pick<NormalizedField, 'kind' | 'isArray' | 'reference'>): UIComponent[] {
  if (field.kind === 'reference' || field.reference?.target) return ['Autocomplete', 'AsyncSelect'];
  switch (field.kind) {
    case 'enum':
      return field.isArray ? ['MultiSelect'] : ['Select'];
    case 'string':
      return field.isArray ? ['Chips'] : ['TextField', 'TextArea', 'ImageField'];
    case 'number':
    case 'decimal':
      return ['NumberField'];
    case 'boolean':
      return ['Switch'];
    case 'date':
      return ['DatePicker'];
    default:
      // object / map / json / unknown: rendered by the package from the kind; no choice to make.
      return [];
  }
}

/** The suggestion when it fits the kind, else the kind's first option (plan 6 §3.1). */
function fitComponent(field: NormalizedField, suggested: UIComponent): UIComponent {
  const options = uiComponentOptionsFor(field);
  return options.length === 0 || options.includes(suggested) ? suggested : options[0];
}

export function getComponentForType(field: { name: string; type: string; isArray: boolean }): UIComponent {
  const name = field.name.toLowerCase();
  const type = field.type.toLowerCase();

  if (field.isArray) {
    return 'MultiSelect';
  }
  if (type === 'boolean') {
    return 'Switch';
  }
  if (type === 'date' || name.includes('date') || name.includes('time')) {
    return 'DatePicker';
  }
  if (type === 'number' || type === 'integer' || type === 'float') {
    return 'NumberField';
  }
  if (name.includes('description') || name.includes('content') || name.includes('body') || name.includes('message')) {
    return 'TextArea';
  }
  return 'TextField';
}

function defaultFilterToken(field: NormalizedField): FilterToken {
  const name = field.name.toLowerCase();
  const t = token(field);
  if (name === '_id' || name === 'id') return 'objectId';
  if (t === 'schema' && !field.isArray) return 'objectId';
  if (t === 'boolean') return 'boolean';
  if (t === 'number') return 'exact';
  if (t === 'date') return 'date-range';
  return 'regex';
}

function isSystemReadonly(field: NormalizedField): boolean {
  const name = field.name.toLowerCase();
  return name === '_id' || name === 'createdat' || name === 'updatedat';
}

/** UI defaults for a field the schema designer has no settings for yet. */
export function enrichFieldWithUIConfig(field: NormalizedField): NormalizedField {
  const name = field.name.toLowerCase();
  const t = token(field);
  const isObjectField = t === 'object';
  const isMapField = t === 'map';
  const isNestedObjectArray = isObjectField && field.isArray === true;
  const componentView = { name: field.name, type: typeTokenOf(field), isArray: field.isArray };
  const suggestedArrayComponent: UIComponent = name === 'userid' ? 'Select' : 'MultiSelect';

  return withReference(
    {
      ...field,
      trim: t === 'string' ? field.trim : undefined,
      filter: {
        // Nested objects, maps, and array-of-subdocs are not list-filterable by default
        searchable: !isObjectField && !isMapField && !isNestedObjectArray,
        ...filterFromToken(defaultFilterToken(field))
      },
      access: { ...field.access, readonly: isSystemReadonly(field) },
      ui: {
        label: formatLabel(field.name),
        list: true,
        component: fitComponent(
          field,
          isActiveRelation(field)
            ? 'Autocomplete'
            : isNestedObjectArray || isMapField || isObjectField
              ? getComponentForType(componentView)
              : field.isArray
                ? suggestedArrayComponent
                : getComponentForType(componentView)
        ),
        defaultValue: ''
      }
    },
    { ...field.reference, relationType: resolveRelationType(field) }
  );
}

/**
 * Enum values come from the model file. A numeric Mongoose enum (`enum: [0, 5]`) carries only the numbers; the labels
 * come from the manifest, matched by number (not by position), so a reordered or extended enum keeps its labels.
 */
function mergeEnum(code: NormalizedField['enum'], saved: NormalizedField['enum']): NormalizedField['enum'] {
  if (!code?.values.length) return undefined;
  if (!isNumericEnum(code)) return { values: code.values };
  const savedLabels = new Map<number, string>();
  if (isNumericEnum(saved)) saved.numbers.forEach((n, i) => savedLabels.set(n, saved.values[i]));
  const labelsFromFile = code.values.some((v, i) => v !== String(code.numbers[i]));
  const values = labelsFromFile ? code.values : code.numbers.map(n => savedLabels.get(n) ?? String(n));
  return { values, numbers: code.numbers };
}

function mergeField(code: NormalizedField, saved: NormalizedField): NormalizedField {
  const pick = <K extends keyof NormalizedReference>(key: K) =>
    code.reference?.[key] !== undefined ? code.reference[key] : saved.reference?.[key];
  const codeSubs = code.object?.fields;
  const savedSubs = saved.object?.fields;
  const defaults = enrichFieldWithUIConfig(code);

  return {
    ...saved,
    kind: code.kind,
    native: code.native,
    required: code.required,
    isArray: code.isArray,
    reference: {
      include: pick('include'),
      target: pick('target'),
      display: pick('display'),
      populate: saved.reference?.populate,
      displayObjectFields: pick('displayObjectFields'),
      relationType: saved.reference?.relationType
    },
    filter: {
      // Object fields are not filterable; if a field became an object, drop stale searchable config.
      searchable: token(code) === 'object' ? false : saved.filter?.searchable !== undefined ? saved.filter.searchable : true,
      ...filterFromToken(filterTokenOf(saved.filter) || filterTokenOf(defaults.filter))
    },
    access: {
      readonly: saved.access?.readonly ?? defaults.access?.readonly,
      hiddenFromCreate: saved.access?.hiddenFromCreate,
      hiddenFromUpdate: saved.access?.hiddenFromUpdate,
      hidden: code.access?.hidden ?? saved.access?.hidden,
      adminOnly: saved.access?.adminOnly
    },
    ui: {
      ...saved.ui,
      list: saved.ui?.list !== undefined ? saved.ui.list : true,
      defaultValue: saved.ui?.defaultValue ?? ''
    },
    // Schema options come from the model file (P3): a stale saved `unique` would add a real DB index.
    trim: code.trim,
    unique: code.unique,
    // File wins when it says (C# `int` / `DateOnly`, Mongoose `match`). Express keeps int / date-only only in the manifest.
    numberFormat: code.kind === 'number' ? (code.numberFormat ?? saved.numberFormat) : undefined,
    dateFormat: code.kind === 'date' ? (code.dateFormat ?? saved.dateFormat) : undefined,
    format: code.kind === 'string' ? (code.format ?? saved.format) : undefined,
    constraints: constraintsForField(code, code.constraints ?? saved.constraints),
    object: {
      // Embedded object sub-fields: parsed model wins when non-empty; empty [] must not wipe saved subs.
      fields:
        Array.isArray(codeSubs) && codeSubs.length > 0
          ? codeSubs
          : Array.isArray(savedSubs) && savedSubs.length > 0
            ? savedSubs
            : (codeSubs ?? savedSubs),
      typeName: code.object?.typeName ?? saved.object?.typeName,
      schemaName: code.object?.schemaName ?? saved.object?.schemaName
    },
    // File-derived fidelity (P3): the parsed model is the source of truth, never a stale saved copy.
    enum: mergeEnum(code.enum, saved.enum),
    default: code.default
  };
}

/** Parsed model + stored settings (`saved`: manifest row, null for a new model). */
export function mergeModel(code: NormalizedModel, saved: NormalizedModel | null, sourceType?: SourceType): NormalizedModel {
  const codeFields = [...code.fields];
  if (isMongooseSourceType(sourceType) && !codeFields.some(f => f.name === '_id')) {
    codeFields.unshift({ name: '_id', kind: 'reference', isArray: false, required: true });
  }

  const savedFields = new Map((saved?.fields ?? []).map(f => [f.name, f]));
  const fields = codeFields.map(field => {
    const codeField = normalizeMongoIdField(field, sourceType);
    const savedField = saved ? savedFields.get(codeField.name) : undefined;
    return savedField
      ? sanitizeFieldRelationMeta(normalizeMongoIdField(canonicalField(mergeField(codeField, savedField)), sourceType))
      : sanitizeFieldRelationMeta(enrichFieldWithUIConfig(codeField));
  });

  return canonicalModel({
    schemaVersion: code.schemaVersion,
    entityName: code.entityName,
    fields,
    nestedSchemas: code.nestedSchemas?.map(nested => ({
      entityName: nested.entityName,
      fields: nested.fields.map(field => sanitizeFieldRelationMeta(enrichFieldWithUIConfig(field)))
    })),
    timestamps: code.timestamps,
    native:
      code.native?.modelName || code.native?.collection
        ? { modelName: code.native.modelName, collection: code.native.collection }
        : undefined,
    ownership: saved?.ownership,
    api: saved?.api,
    ui: saved?.ui
  });
}
