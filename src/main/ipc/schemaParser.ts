import { readFileSync } from 'fs';
import { dirname } from 'path';
import { findDotnetHost, listDotnetEntityFiles } from '../parsers/dotnet/dotnetHost.js';
import { parseDotnetEntity } from '../parsers/dotnet/entityParser.js';
import {
  canonicalModel,
  type NativeType,
  type NormalizedField,
  type NormalizedModel,
  type NormalizedNestedSchema,
  type NormalizedObjectSubField
} from '../../shared/normalizedModel.js';
import { kindFromTypeToken, nativeTypeFor, templateScalarToken, typeTokenOf } from '../../shared/fieldTypeToken.js';
import {
  entityNameFromModelFileName,
  resolveMainMongooseSchemaName,
  extractMainSchemaRegions,
  parseSchemaOptionsMeta,
  parseMongooseFieldModifiers,
  parseMongooseEmbeddedObjectSubFields,
  mongooseEmbeddedObjectRequired,
  type ParsedEmbeddedObjectSubField,
  parseNamedNestedSchemaRef,
  parseMongooseFieldExtras,
  parseSchemaTimestamps,
  parseInterfaceProperties,
  scanBalancedDelimiters
} from '../utils/mongooseSchemaExtract.js';

export { entityNameFromModelFileName };

type SourceTypeArg = 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | 'python-fastapi' | null;

// --- Field construction ---------------------------------------------------------------------------------
// The parser reads Mongoose / TS type names as parser tokens (`string`, `schema`, `schema.types.decimal128`, …);
// `kind` + `native.type` store them (`fieldTypeToken.ts`).

function withNative(field: NormalizedField, native: NativeType): NormalizedField {
  const merged: NativeType = { ...field.native, ...native };
  return Object.keys(merged).length > 0 ? { ...field, native: merged } : field;
}

/** Set `kind` / `native.type` from a parser token (an enum field stays `enum`). */
function withTypeToken(field: NormalizedField, token: string): NormalizedField {
  const kind = field.enum ? 'enum' : kindFromTypeToken(token);
  const { type: _type, ...restNative } = field.native ?? {};
  const native = { ...nativeTypeFor(kind, token), ...restNative };
  const out: NormalizedField = { ...field, kind };
  if (Object.keys(native).length > 0) out.native = native;
  else delete out.native;
  return out;
}

function scalarField(name: string, token: string, required: boolean, isArray: boolean): NormalizedField {
  return withTypeToken({ name, kind: 'unknown', isArray, required }, token);
}

/** `trim` / `unique` from a Mongoose field block. */
function withModifiers(field: NormalizedField, fieldContent: string, token: string): NormalizedField {
  const { trim, unique } = parseMongooseFieldModifiers(fieldContent, token);
  const out = { ...field };
  if (unique !== undefined) out.unique = unique;
  if (trim !== undefined) out.trim = trim;
  return out;
}

/** Attach enum / default / select / verbatim options parsed from a Mongoose field block (P3). */
function withFieldExtras(fieldContent: string, field: NormalizedField): NormalizedField {
  const extras = parseMongooseFieldExtras(fieldContent);
  let out: NormalizedField = { ...field };
  if (extras.enumValues) {
    const token = typeTokenOf(field);
    out.enum = extras.enumNumbers ? { values: extras.enumValues, numbers: extras.enumNumbers } : { values: extras.enumValues };
    out = withTypeToken(out, token);
  }
  // Date-only fields are stored as `YYYY-MM-DD` strings; the `match` pattern marks them.
  if (extras.dateOnly) out = { ...withTypeToken(out, 'Date'), dateFormat: 'date' };
  if (extras.constraints) out.constraints = { ...out.constraints, ...extras.constraints };
  if (extras.format) out.format = extras.format;
  if (extras.schemaDefault !== undefined) out.default = extras.schemaDefault;
  if (extras.hidden) out.access = { ...out.access, hidden: true };
  if (extras.nativeOptions) out = withNative(out, { options: extras.nativeOptions });
  return out;
}

/** `ref: 'symbol-types'` → `SymbolTypes`. */
function relationTargetFromRef(fieldContent: string): string | undefined {
  const refMatch = /ref\s*:\s*['"]([^'"]+)['"]/.exec(fieldContent);
  return refMatch?.[1] ? relationTargetFromRefName(refMatch[1]) : undefined;
}

function relationTargetFromRefName(refName: string): string {
  if (refName.includes('-') || refName.includes('_') || refName.includes(' ')) {
    return refName
      .split(/[-_\s]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }
  return refName.charAt(0).toUpperCase() + refName.slice(1);
}

/** `field: { type: Schema.Types.ObjectId, ref: '…' }` (or an array of them). */
function referenceField(fieldName: string, fieldContent: string): NormalizedField {
  const isArrayField = fieldContent.includes('type: [Schema.Types.ObjectId]') || fieldContent.includes('type:[Schema.Types.ObjectId]');
  const target = relationTargetFromRef(fieldContent);
  const field = scalarField(fieldName, 'schema', isRequiredBlock(fieldContent), isArrayField);
  field.reference = target !== undefined ? { include: true, target } : { include: true };
  return withModifiers(field, fieldContent, 'schema');
}

function isRequiredBlock(fieldContent: string): boolean {
  return /required\s*:\s*(true|1)/i.test(fieldContent);
}

function isArrayTypeBlock(fieldContent: string): boolean {
  return fieldContent.includes('type: [') || fieldContent.includes('type:[');
}

const MONGOOSE_TYPE_PATTERN = /type\s*:\s*\[?\s*(\w+(?:\.\w+)*)\s*\]?/;

/**
 * Top-level `name: { … }` blocks of a schema body. Scanning resumes after each full body so nested keys
 * (e.g. embedded object sub-fields like `tr` / `en`) are not mistaken for fields.
 */
function scanFieldBlocks(schemaContent: string): Array<{ name: string; content: string }> {
  const blocks: Array<{ name: string; content: string }> = [];
  const fieldPattern = /(\w+)\s*:\s*\{/g;
  let fieldMatch: RegExpExecArray | null;
  while ((fieldMatch = fieldPattern.exec(schemaContent)) !== null) {
    const fieldStart = fieldMatch.index;
    const end = scanBalancedDelimiters(schemaContent, fieldStart + fieldMatch[0].length - 1);
    const fieldEnd = end < 0 ? fieldStart + fieldMatch[0].length : end;
    fieldPattern.lastIndex = fieldEnd;
    blocks.push({ name: fieldMatch[1], content: schemaContent.substring(fieldStart, fieldEnd) });
  }
  return blocks;
}

/** Sub-field of an inline object; an ObjectId sub-field has the same shape as one bound from a named schema. */
function embeddedSubField(sub: ParsedEmbeddedObjectSubField): NormalizedObjectSubField {
  if (sub.type === 'ObjectId') {
    const out: NormalizedObjectSubField = { name: sub.name, kind: 'reference', required: sub.required, trim: sub.trim };
    const target = sub.ref ? relationTargetFromRefName(sub.ref) : undefined;
    out.reference = target ? { include: true, target, ref: target } : { include: true };
    out.native = { type: 'objectId' };
    return out;
  }
  const kind =
    sub.type === 'Number'
      ? 'number'
      : sub.type === 'Decimal128'
        ? 'decimal'
        : sub.type === 'Boolean'
          ? 'boolean'
          : sub.type === 'Date'
            ? 'date'
            : 'string';
  const out: NormalizedObjectSubField = { name: sub.name, kind, required: sub.required };
  if (sub.nullable !== undefined) out.nullable = sub.nullable;
  out.trim = sub.trim;
  return out;
}

/** Synthetic field the Generator adds for Mongoose models (`_id`, timestamps). */
function syntheticTimestampField(name: 'createdAt' | 'updatedAt', label: string): NormalizedField {
  return {
    name,
    kind: 'date',
    isArray: false,
    required: false,
    filter: { searchable: true, type: 'date-range' },
    access: { readonly: true, hiddenFromCreate: true, hiddenFromUpdate: true },
    ui: { label, list: true }
  };
}

/**
 * Check if the file contains model-related code (Mongoose or TypeScript model patterns)
 */
function isModelFile(content: string, fileName: string): { isValid: boolean; reason?: string } {
  // Check if filename contains "model" (case insensitive)
  const lowerFileName = fileName.toLowerCase();
  if (!lowerFileName.includes('model')) {
    return {
      isValid: false,
      reason: 'File name must contain "model" (e.g., User.model.ts, UserModel.ts)'
    };
  }

  // Check for Mongoose Schema pattern: new Schema<...>({...})
  const mongooseSchemaPattern = /new\s+Schema\s*<[^>]*>\s*\(/i;
  const hasMongooseSchema = mongooseSchemaPattern.test(content);

  // Check for mongoose.model export: mongoose.model<...>('...', ...Schema)
  const mongooseModelPattern = /mongoose\.model\s*<[^>]*>\s*\(/i;
  const hasMongooseModel = mongooseModelPattern.test(content);

  // If both Schema and model are present, it's definitely a model file
  if (hasMongooseSchema && hasMongooseModel) {
    return { isValid: true };
  }

  // Check for alternative patterns
  const alternativeSchemaPattern = /Schema\s*\(/i;
  const hasAlternativeSchema = alternativeSchemaPattern.test(content);
  const hasMongooseImport = /from\s+['"]mongoose['"]/i.test(content);

  if (hasAlternativeSchema && hasMongooseImport) {
    return { isValid: true };
  }

  // Check for TypeScript model patterns (interface/class with properties)
  const tsModelPatterns = [
    /(interface|class)\s+\w+\s*\{[\s\S]{0,500}?\w+\s*:\s*(string|number|boolean|Date|ObjectId)/i,
    /export\s+(interface|class)\s+\w+/i
  ];

  const hasTsModel = tsModelPatterns.some(pattern => pattern.test(content));
  if (hasTsModel && hasMongooseImport) {
    return { isValid: true };
  }

  return {
    isValid: false,
    reason: 'File does not contain Mongoose Schema and model export patterns'
  };
}

export interface ParseModelFileOptions {
  /** When the file stem differs from mongoose.model('ThisName'), pass the registered name so the correct schema is resolved. */
  preferredMongooseModelName?: string;
}

/** .NET entity (`src/<App>.Domain/<Folder>/<Entity>.cs`); references resolve against the host's entities. */
function parseDotnetEntityFile(filePath: string): ParseNormalizedModelResult {
  try {
    const host = findDotnetHost(dirname(dirname(dirname(dirname(filePath)))));
    const folders = new Map(host ? listDotnetEntityFiles(host).map(f => [f.fileName.replace(/\.cs$/, ''), f.folder] as [string, string]) : []);
    return { success: true, model: parseDotnetEntity(filePath, folders) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export interface ParseNormalizedModelResult {
  success: boolean;
  model?: NormalizedModel;
  error?: string;
}

/**
 * Parse a Mongoose (or plain TypeScript interface / class) model file into NormalizedModel v2.
 */
export function parseNormalizedModel(
  filePath: string,
  sourceType?: SourceTypeArg,
  options?: ParseModelFileOptions | null
): ParseNormalizedModelResult {
  if (sourceType === 'dotnet-ef' && filePath.endsWith('.cs')) return parseDotnetEntityFile(filePath);
  try {
    const content = readFileSync(filePath, 'utf-8');
    const fileName = filePath.split(/[/\\]/).pop() || '';

    const modelCheck = isModelFile(content, fileName);
    if (!modelCheck.isValid) {
      return {
        success: false,
        error: modelCheck.reason || 'File does not appear to be a model file'
      };
    }

    const fileEntityName = entityNameFromModelFileName(fileName);
    const preferred = options?.preferredMongooseModelName?.trim();

    const mainSchemaName = resolveMainMongooseSchemaName(content, fileName, preferred ?? undefined);

    let schemaContent = content;
    let hasTimestamps = false;
    let timestamps: { createdAt: boolean; updatedAt: boolean } | undefined;
    let deletedInToJSON: string[] = [];
    let collection: string | undefined;

    if (mainSchemaName) {
      const regions = extractMainSchemaRegions(content, mainSchemaName);
      if (regions) {
        schemaContent = regions.fieldsBlock;
        const meta = parseSchemaOptionsMeta(regions.optionsBlock);
        hasTimestamps = meta.hasTimestamps;
        timestamps = parseSchemaTimestamps(regions.optionsBlock);
        collection = regions.optionsBlock ? /\bcollection\s*:\s*['"]([^'"]+)['"]/.exec(regions.optionsBlock)?.[1] : undefined;
        deletedInToJSON = meta.deletedInToJSON;
      }
    }

    const fields: NormalizedField[] = [];

    // Strategy 1: Mongoose schema fields (`fieldName: { ... }`)
    const blocks = scanFieldBlocks(schemaContent);
    const hasMongooseSchema = blocks.length > 0;

    for (const { name: fieldName, content: fieldContent } of blocks) {
      // Array of named nested schema, e.g. `items: { type: [PortfolioSnapshotItemSchema] }` — sub-fields bound in linkNamedNestedObjectFields
      const nestedSchemaArrayMatch = fieldContent.match(/type\s*:\s*\[\s*(\w+Schema)\s*\]/);
      if (nestedSchemaArrayMatch) {
        const schemaName = nestedSchemaArrayMatch[1];
        const field = scalarField(fieldName, 'object', isRequiredBlock(fieldContent), true);
        field.object = { typeName: `I${schemaName.replace(/Schema$/, '')}`, schemaName };
        fields.push(withFieldExtras(fieldContent, field));
        continue;
      }

      // Inline object (`displayText: { tr: { … }, en: { … } }`): no `type:` at depth 0. Checked before the
      // reference branch — an ObjectId sub-field must not turn the whole object into a reference.
      const embeddedSubFields = parseMongooseEmbeddedObjectSubFields(fieldContent);
      if (embeddedSubFields) {
        const field = scalarField(fieldName, 'object', mongooseEmbeddedObjectRequired(fieldContent), false);
        field.object = { fields: embeddedSubFields.map(embeddedSubField) };
        fields.push(field);
        continue;
      }

      if (fieldContent.includes('Schema.Types.ObjectId') && fieldContent.includes('ref:')) {
        fields.push(withFieldExtras(fieldContent, referenceField(fieldName, fieldContent)));
        continue;
      }

      // Named nested schema ref: `type: SubscriptionLimitsSchema` (resolved after nestedSchemas parse)
      const namedNestedRef = parseNamedNestedSchemaRef(fieldContent);
      if (namedNestedRef) {
        const field = scalarField(fieldName, 'object', isRequiredBlock(fieldContent), false);
        field.object = { typeName: `I${namedNestedRef.replace(/Schema$/, '')}`, schemaName: namedNestedRef };
        fields.push(withFieldExtras(fieldContent, field));
        continue;
      }

      // Standard Mongoose types: `type: String` / `type: [String]`
      const mongooseTypeMatch = fieldContent.match(MONGOOSE_TYPE_PATTERN);
      if (mongooseTypeMatch) {
        const mapped = mapMongooseTypeToGeneric(mongooseTypeMatch[1]);
        const token = fieldName === '_id' ? 'schema' : mapped;
        const field = scalarField(fieldName, token, isRequiredBlock(fieldContent), isArrayTypeBlock(fieldContent));
        fields.push(withFieldExtras(fieldContent, withModifiers(field, fieldContent, token)));
      }
    }

    // Strategy 2: TypeScript interface / class properties (`name: string;`, `name?: string[];`)
    if (!hasMongooseSchema) {
      const tsInterfacePattern = /(?:public\s+|private\s+|protected\s+)?(\w+)(\??)\s*:\s*(\w+)(\[\])?(\s*;|\s*=|)/g;
      let match: RegExpExecArray | null;

      while ((match = tsInterfacePattern.exec(schemaContent)) !== null) {
        const fieldName = match[1];
        const matchIndex = match.index ?? 0;
        // Skip methods / constructors
        if (
          ['constructor', 'function', 'async'].some(keyword => schemaContent.substring(Math.max(0, matchIndex - 20), matchIndex).includes(keyword))
        ) {
          continue;
        }
        const token = fieldName === '_id' ? 'schema' : mapTypeScriptTypeToGeneric(match[3]);
        fields.push(scalarField(fieldName, token, match[2] !== '?', match[4] === '[]'));
      }

      // Simpler pattern for interface properties
      if (fields.length === 0) {
        const simplePattern = /(\w+)(\??)\s*:\s*(\w+)(\[\])?/g;
        while ((match = simplePattern.exec(schemaContent)) !== null) {
          // Skip if inside a function or method
          const beforeMatch = schemaContent.substring(Math.max(0, match.index! - 50), match.index!);
          if (beforeMatch.includes('(') && !beforeMatch.includes(')')) {
            continue;
          }
          const fieldName = match[1];
          if (!fields.some(f => f.name === fieldName)) {
            const token = fieldName === '_id' ? 'schema' : mapTypeScriptTypeToGeneric(match[3]);
            fields.push(scalarField(fieldName, token, match[2] !== '?', match[4] === '[]'));
          }
        }
      }
    }

    if (sourceType === 'nodejs-mongoose') {
      // `_id` first; always a required single id
      if (!fields.some(f => f.name === '_id')) {
        fields.unshift({
          name: '_id',
          kind: 'reference',
          isArray: false,
          required: true,
          filter: { searchable: true },
          ui: { label: 'ID', list: true }
        });
      }
      for (let i = 0; i < fields.length; i++) {
        if (fields[i].name === '_id') {
          fields[i] = withTypeToken({ ...fields[i], required: true, isArray: false }, 'schema');
        }
      }
    }

    // createdAt / updatedAt when timestamps are on and not deleted in toJSON
    if (hasTimestamps) {
      if ((timestamps?.createdAt ?? true) && !deletedInToJSON.includes('createdAt') && !fields.some(f => f.name === 'createdAt')) {
        fields.push(syntheticTimestampField('createdAt', 'Created At'));
      }
      if ((timestamps?.updatedAt ?? true) && !deletedInToJSON.includes('updatedAt') && !fields.some(f => f.name === 'updatedAt')) {
        fields.push(syntheticTimestampField('updatedAt', 'Updated At'));
      }
    }

    if (fields.length === 0 && !mainSchemaName) {
      return {
        success: false,
        error: 'No fields found in the model file'
      };
    }

    // Sibling schemas (`const FooSchema = new Schema(...)`) other than the main one
    const nestedSchemas: NormalizedNestedSchema[] = [];
    if (mainSchemaName) {
      const allSchemaPattern = /const\s+(\w+Schema)\s*=\s*new\s+Schema\s*(?:<[^>]*>)?\s*\(/gi;
      let schemaMatch: RegExpExecArray | null;
      while ((schemaMatch = allSchemaPattern.exec(content)) !== null) {
        if (schemaMatch[1] === mainSchemaName) continue;
        const nested = parseNestedSchema(content, schemaMatch[1]);
        if (nested) nestedSchemas.push(nested);
      }
    }

    const modelName = mainSchemaName
      ? new RegExp(`mongoose\\.model\\s*(?:<[^>]*>)?\\s*\\(\\s*['"]([^'"]+)['"]\\s*,\\s*${mainSchemaName}\\b`).exec(content)?.[1]
      : undefined;
    const linkedFields = attachInterfaceTypes(content, mainSchemaName, linkNamedNestedObjectFields(fields, nestedSchemas));

    const model: NormalizedModel = { schemaVersion: 2, entityName: fileEntityName, fields: linkedFields };
    if (nestedSchemas.length > 0) model.nestedSchemas = nestedSchemas;
    if (timestamps) model.timestamps = timestamps;
    if (modelName || collection) model.native = { modelName, collection };
    return { success: true, model: canonicalModel(model) };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/** Declared TS type / `?` / JSDoc of each field from the main model interface (`new Schema<IFoo>`), P3. */
function attachInterfaceTypes(content: string, mainSchemaName: string | null, fields: NormalizedField[]): NormalizedField[] {
  if (!mainSchemaName) return fields;
  const generic = new RegExp(`const\\s+${mainSchemaName}\\s*=\\s*new\\s+Schema\\s*<\\s*(\\w+)\\s*>`).exec(content);
  if (!generic) return fields;
  const props = parseInterfaceProperties(content, generic[1]);
  const typed = fields.map(field => {
    const prop = props.get(field.name);
    if (!prop || field.name === '_id' || field.name === 'createdAt' || field.name === 'updatedAt') return field;
    const native: NativeType = { tsType: prop.tsType, tsOptional: prop.optional };
    if (prop.doc) native.doc = prop.doc;
    return withNative(field, native);
  });
  // `access.computed`: in the interface with a `computed` JSDoc, not in the Schema (never stored). Other
  // interface-only properties (hand-written virtuals …) stay out of the model as before.
  // Placed after the interface property before it, so the field order survives a round trip.
  const inSchema = new Set(fields.map(f => f.name));
  let after: string | undefined;
  for (const [name, prop] of props) {
    if (inSchema.has(name) || !prop.doc || !/\bcomputed\b/.test(prop.doc)) {
      if (typed.some(f => f.name === name)) after = name;
      continue;
    }
    const at = after === undefined ? typed.findIndex(f => f.name !== '_id') : typed.findIndex(f => f.name === after) + 1;
    typed.splice(at < 0 ? typed.length : at, 0, computedInterfaceField(name, prop));
    after = name;
  }
  return typed;
}

/** Field of an interface-only `computed` property: scalar / scalar array, else JSON; the TS type is kept verbatim. */
function computedInterfaceField(name: string, prop: { tsType: string; optional: boolean; doc?: string }): NormalizedField {
  const bare = prop.tsType.replace(/\s*\|\s*(null|undefined)\b/g, '').trim();
  const isArray = /\[\]$/.test(bare);
  const element = bare.replace(/\[\]$/, '');
  const token = ['string', 'number', 'boolean', 'date'].includes(element.toLowerCase()) ? element.toLowerCase() : 'mixed';
  const field = scalarField(name, token, false, isArray);
  const native: NativeType = { tsType: prop.tsType, tsOptional: prop.optional };
  if (prop.doc) native.doc = prop.doc;
  return { ...withNative(field, native), access: { computed: true } };
}

/**
 * Attach sub-fields (and nested type names) for fields that reference a sibling `*Schema`.
 */
function linkNamedNestedObjectFields(fields: NormalizedField[], nestedSchemas: NormalizedNestedSchema[]): NormalizedField[] {
  if (nestedSchemas.length === 0) return fields;

  const bySchemaName = new Map<string, NormalizedNestedSchema>();
  for (const nested of nestedSchemas) {
    bySchemaName.set(`${nested.entityName}Schema`.toLowerCase(), nested);
  }

  return fields.map(field => {
    const schemaName = String(field.object?.schemaName || '').trim();
    if (!schemaName) {
      // Opaque type that still looks like a *Schema token
      const typeToken = typeTokenOf(field).trim();
      if (field.kind === 'object' && field.object?.fields?.length) return field;
      if (!/schema$/i.test(typeToken) || typeToken.toLowerCase() === 'schema') return field;
      const nested = bySchemaName.get(typeToken.toLowerCase());
      if (!nested) return field;
      return bindNestedSchemaToField(field, nested, `${nested.entityName}Schema`);
    }

    const nested = bySchemaName.get(schemaName.toLowerCase());
    if (!nested) return field;
    return bindNestedSchemaToField(field, nested, schemaName);
  });
}

/** Sibling-schema fields that become sub-fields of the object that references the schema. */
const BINDABLE_SUB_FIELD_KINDS = new Set<NormalizedField['kind']>(['string', 'number', 'decimal', 'boolean', 'date', 'reference']);

function bindNestedSchemaToField(field: NormalizedField, nested: NormalizedNestedSchema, schemaName: string): NormalizedField {
  const subFields = nested.fields
    .filter(f => !f.isArray && BINDABLE_SUB_FIELD_KINDS.has(f.kind))
    .map(f => {
      const scalar = templateScalarToken(f.kind);
      const token = scalar === 'schema' ? 'objectId' : scalar;
      // `templateScalarToken` folds decimal into number; keep the field's own kind (contract K5: decimal is a string).
      const kind = f.kind === 'decimal' ? 'decimal' : kindFromTypeToken(token);
      const out: NormalizedObjectSubField = { name: f.name, kind, required: f.required };
      if (f.nullable === true) out.nullable = true;
      if (f.trim !== undefined) out.trim = f.trim;
      const include = f.reference?.include === true ? true : undefined;
      const target = f.reference?.target;
      if (include !== undefined || target !== undefined) {
        out.reference = {};
        if (include !== undefined) out.reference.include = include;
        if (target !== undefined) {
          out.reference.target = target;
          out.reference.ref = target;
        }
      }
      const native = nativeTypeFor(kind, token);
      if (native) out.native = native;
      return out;
    });

  const typeName = String(field.object?.typeName || nested.nestedTypeName || '').trim() || `I${nested.entityName}`;
  const fieldsOut = subFields.length > 0 ? subFields : field.object?.fields;

  const out = withTypeToken({ ...field, isArray: Boolean(field.isArray) }, 'object');
  out.object = { ...(fieldsOut ? { fields: fieldsOut } : {}), typeName, schemaName };
  return out;
}

/**
 * Parse a sibling schema definition (`const FooSchema = new Schema<IFoo>({ ... })`).
 */
function parseNestedSchema(content: string, schemaName: string): NormalizedNestedSchema | null {
  try {
    const schemaPattern = new RegExp(`const\\s+${schemaName}\\s*=\\s*new\\s+Schema\\s*(?:<([^>]*)>)?\\s*\\(\\s*\\{`, 'i');
    const schemaMatch = schemaPattern.exec(content);
    if (!schemaMatch) {
      return null;
    }

    const genericParam = String(schemaMatch[1] || '')
      .trim()
      .split(',')[0]
      ?.trim();
    const nestedTypeName = genericParam && /^I?\w+$/.test(genericParam) ? genericParam : undefined;

    // "PortfolioSnapshotItemSchema" -> "PortfolioSnapshotItem"
    const entityName = schemaName.replace(/Schema$/, '');

    const objectStart = schemaMatch.index + schemaMatch[0].length - 1;
    const end = scanBalancedDelimiters(content, objectStart);
    const objectEnd = end < 0 ? objectStart + 1 : end;

    const schemaContent = content.substring(objectStart, objectEnd);
    const fields: NormalizedField[] = [];

    for (const { name: fieldName, content: fieldContent } of scanFieldBlocks(schemaContent)) {
      if (fieldContent.includes('Schema.Types.ObjectId') && fieldContent.includes('ref:')) {
        fields.push(referenceField(fieldName, fieldContent));
        continue;
      }

      const mongooseTypeMatch = fieldContent.match(MONGOOSE_TYPE_PATTERN);
      if (mongooseTypeMatch) {
        const mapped = mapMongooseTypeToGeneric(mongooseTypeMatch[1]);
        const token = fieldName === '_id' ? 'schema' : mapped;
        const field = scalarField(fieldName, token, isRequiredBlock(fieldContent), isArrayTypeBlock(fieldContent));
        if (mapped === 'number' && /default\s*:\s*null\b/i.test(fieldContent)) field.nullable = true;
        fields.push(withModifiers(field, fieldContent, token));
      }
    }

    if (fields.length === 0) {
      return null;
    }

    const nested: NormalizedNestedSchema = { entityName, fields };
    if (nestedTypeName) nested.nestedTypeName = nestedTypeName;
    return nested;
  } catch {
    return null;
  }
}

/**
 * Map Mongoose types to generic types
 */
function mapMongooseTypeToGeneric(mongooseType: string): string {
  const trimmed = mongooseType.trim();
  // Schema.Types.ObjectId, Types.ObjectId, ObjectId → object id (stored as generic 'schema' in this app)
  if (/objectid$/i.test(trimmed) || /types\.objectid$/i.test(trimmed)) {
    return 'schema';
  }
  if (/^map$/i.test(trimmed) || /types\.map$/i.test(trimmed)) {
    return 'map';
  }
  const typeMap: Record<string, string> = {
    String: 'string',
    Number: 'number',
    Boolean: 'boolean',
    Date: 'date',
    ObjectId: 'schema',
    Object: 'object',
    Map: 'map',
    Array: 'array',
    Buffer: 'buffer',
    Mixed: 'mixed'
  };

  return typeMap[trimmed] || trimmed.toLowerCase();
}

/**
 * Map TypeScript types to generic types
 */
function mapTypeScriptTypeToGeneric(tsType: string): string {
  const key = tsType.toLowerCase();
  if (key.includes('objectid')) {
    return 'schema';
  }
  const typeMap: Record<string, string> = {
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    Date: 'date',
    ObjectId: 'schema',
    object: 'object',
    any: 'mixed',
    unknown: 'mixed'
  };

  return typeMap[key] || key;
}
