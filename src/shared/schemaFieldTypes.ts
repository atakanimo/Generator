export type GeneratorSourceType = 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null | undefined;

export type SchemaFieldLike = {
  name?: string;
  type?: string;
  required?: boolean;
  isArray?: boolean;
  hiddenFromCreate?: boolean;
  hiddenFromUpdate?: boolean;
};

export function isMongooseSourceType(sourceType: unknown): boolean {
  return String(sourceType ?? '') === 'nodejs-mongoose';
}

/** Mongo → `_id`; diğer stack'ler → `id`. */
export function resolvePrimaryKeyFieldName(sourceType: unknown): '_id' | 'id' {
  return isMongooseSourceType(sourceType) ? '_id' : 'id';
}

export function resolvePrimaryKeyMemberAccess(sourceType: unknown): '._id' | '.id' {
  return isMongooseSourceType(sourceType) ? '._id' : '.id';
}

export function fieldsIncludeNamedField(fields: unknown, fieldName: string): boolean {
  if (!Array.isArray(fields)) return false;
  return fields.some(f => f && String((f as SchemaFieldLike).name) === fieldName);
}

export function fieldsIncludePrimaryKey(sourceType: unknown, fields: unknown): boolean {
  return fieldsIncludeNamedField(fields, resolvePrimaryKeyFieldName(sourceType));
}

export function fieldsHaveSchemaType(fields: unknown): boolean {
  if (!Array.isArray(fields)) return false;
  return (fields as SchemaFieldLike[]).some(f => String(f?.type ?? '').toLowerCase() === 'schema');
}

export function needsMongooseImportForTypes(sourceType: unknown, fields: unknown): boolean {
  return isMongooseSourceType(sourceType) || fieldsHaveSchemaType(fields);
}

/** BE `types.hbs` / `getType` helper: şema alan tipi → TS tip string. */
export function schemaFieldToBackendTsType(type: unknown): string {
  const raw = String(type || '').trim();
  const t = raw.toLowerCase();
  if (t === 'schema') return 'mongoose.Types.ObjectId';
  if (t === 'date') return 'Date';
  if (t === 'object') return 'unknown';
  if (t.includes('mixed')) return 'unknown';
  return raw || 'string';
}

export function isPrimaryKeyFieldName(name: unknown, sourceType: unknown): boolean {
  const n = String(name ?? '').trim();
  if (!n) return false;
  const pk = resolvePrimaryKeyFieldName(sourceType);
  return n === pk || n === '_id' || n === 'id';
}

export function emitBackendInterfacePropLine(field: SchemaFieldLike): string {
  const name = String(field.name ?? '').trim();
  if (!name) return '';
  const optional = field.required ? '' : '?';
  const base = schemaFieldToBackendTsType(field.type);
  const ts = field.isArray ? `${base}[]` : base;
  return `  ${name}${optional}: ${ts};\n`;
}

export function emitBackendEntitySyntheticPrimaryKeyLine(sourceType: unknown, fields: unknown): string {
  if (fieldsIncludePrimaryKey(sourceType, fields)) return '';
  if (isMongooseSourceType(sourceType)) {
    return '  _id: mongoose.Types.ObjectId;\n';
  }
  return '  id?: string;\n';
}

function shouldSkipBackendInputProp(
  field: SchemaFieldLike,
  sourceType: unknown,
  isProtectedRoute: unknown
): boolean {
  const name = String(field.name ?? '').trim();
  if (!name) return true;
  if (isPrimaryKeyFieldName(name, sourceType)) return true;
  if (field.hiddenFromCreate && field.hiddenFromUpdate) return true;
  if (isProtectedRoute === true && name.toLowerCase() === 'userid') return true;
  return false;
}

export function emitBackendInputPropLines(
  fields: unknown,
  sourceType: unknown,
  isProtectedRoute: unknown
): string {
  if (!Array.isArray(fields)) return '';
  let out = '';
  for (const raw of fields) {
    const field = raw as SchemaFieldLike;
    if (shouldSkipBackendInputProp(field, sourceType, isProtectedRoute)) continue;
    out += emitBackendInterfacePropLine(field);
  }
  return out;
}
