function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function entityNameFromModelFileName(fileName: string): string {
  const base = fileName
    .replace(/\.(model|schema|entity)\.(ts|js)$/i, '')
    .replace(/\.(ts|js)$/i, '');
  return base
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/** Scan from `openIndex` (must point at `{` or `(`) to matching close; returns index after close. */
export function scanBalancedDelimiters(source: string, openIndex: number): number {
  if (openIndex < 0 || openIndex >= source.length) return -1;
  const openChar = source[openIndex];
  const closeChar = openChar === '{' ? '}' : openChar === '(' ? ')' : '';
  if (!closeChar) return -1;

  let depth = 0;
  let inString = false;
  let stringChar = '';

  for (let i = openIndex; i < source.length; i++) {
    const char = source[i];
    const prevChar = i > 0 ? source[i - 1] : '';

    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    if (inString) continue;

    if (char === openChar) depth++;
    if (char === closeChar) {
      depth--;
      if (depth === 0) return i + 1;
    }
  }

  return -1;
}

/** Value block for `propertyName: { ... }` inside a JS/TS object literal substring. */
export function extractObjectPropertyBlock(source: string, propertyName: string): string | null {
  const pattern = new RegExp(`\\b${escapeRegExp(propertyName)}\\s*:\\s*\\{`, 'i');
  const match = pattern.exec(source);
  if (!match) return null;
  const openBrace = match.index + match[0].length - 1;
  const end = scanBalancedDelimiters(source, openBrace);
  if (end < 0) return null;
  return source.substring(openBrace, end);
}

/**
 * Resolve exported main schema variable name (`mongoose.model('Entity', FooSchema)`).
 * Same rules as `parseModelFile`.
 */
export function resolveMainMongooseSchemaName(
  content: string,
  fileName: string,
  preferredMongooseModelName?: string
): string | null {
  const fileEntityName = entityNameFromModelFileName(fileName);
  const preferred = preferredMongooseModelName?.trim();
  const nameCandidates =
    preferred && preferred.toLowerCase() !== fileEntityName.toLowerCase()
      ? [preferred, fileEntityName]
      : [fileEntityName];

  for (const entityName of nameCandidates) {
    const modelExportPattern = new RegExp(
      `mongoose\\.model\\s*(?:<[^>]*>)?\\s*\\(\\s*['"]${escapeRegExp(entityName)}['"]\\s*,\\s*(\\w+Schema)`,
      'i'
    );
    const modelExportMatch = modelExportPattern.exec(content);
    if (modelExportMatch?.[1]) {
      return modelExportMatch[1];
    }
  }

  const schemaPattern = /const\s+(\w+Schema)\s*=\s*new\s+Schema\s*<[^>]*>\s*\(/gi;
  const schemaMatches: string[] = [];
  let schemaMatch: RegExpExecArray | null;
  while ((schemaMatch = schemaPattern.exec(content)) !== null) {
    schemaMatches.push(schemaMatch[1]);
  }
  if (schemaMatches.length > 0) {
    return schemaMatches[schemaMatches.length - 1];
  }
  return null;
}

export interface MainSchemaRegions {
  /** First Schema ctor arg including `{` `}` (may be `{ }` when empty). */
  fieldsBlock: string;
  /** Second Schema ctor options arg including `{` `}` when present. */
  optionsBlock: string | null;
}

/** Extract fields + options blocks for `const MainSchema = new Schema<...>(...)`. */
export function extractMainSchemaRegions(content: string, mainSchemaName: string): MainSchemaRegions | null {
  const mainSchemaPattern = new RegExp(`const\\s+${escapeRegExp(mainSchemaName)}\\s*=\\s*new\\s+Schema\\s*<[^>]*>\\s*\\(`, 'i');
  const mainSchemaMatch = mainSchemaPattern.exec(content);
  if (!mainSchemaMatch) return null;

  const schemaStart = mainSchemaMatch.index + mainSchemaMatch[0].length;

  // First `{` inside `new Schema<…>(` (before its closing paren) opens the fields block
  let parenCount = 1;
  let inString = false;
  let stringChar = '';
  let firstBraceStart = -1;
  for (let i = schemaStart; i < content.length && firstBraceStart === -1; i++) {
    const char = content[i];
    const prevChar = i > 0 ? content[i - 1] : '';
    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }
    if (inString) continue;
    if (char === '(') parenCount++;
    if (char === ')' && --parenCount === 0) break;
    if (char === '{') firstBraceStart = i;
  }

  const firstBraceEnd = firstBraceStart === -1 ? -1 : scanBalancedDelimiters(content, firstBraceStart);
  // Options block: a `{` right after the fields block, before the closing paren
  let secondBraceStart = -1;
  for (let j = firstBraceEnd; firstBraceEnd !== -1 && j < content.length && j < firstBraceEnd + 99; j++) {
    if (content[j] === '{') {
      secondBraceStart = j;
      break;
    }
    if (content[j] === ')') break;
  }

  if (firstBraceStart === -1 || firstBraceEnd === -1) return null;

  const fieldsBlock = content.substring(firstBraceStart, firstBraceEnd);
  let optionsBlock: string | null = null;

  if (secondBraceStart !== -1) {
    const optionsEnd = scanBalancedDelimiters(content, secondBraceStart);
    if (optionsEnd > secondBraceStart) {
      optionsBlock = content.substring(secondBraceStart, optionsEnd);
    }
  }

  return { fieldsBlock, optionsBlock };
}

/** Inner text of fields block (without outer braces) — for field-level regex in modal edit. */
export function mainSchemaFieldsInner(regions: MainSchemaRegions): string {
  const block = regions.fieldsBlock.trim();
  if (block.startsWith('{') && block.endsWith('}')) {
    return block.slice(1, -1);
  }
  return block;
}

export function schemaOptionsHasTimestamps(optionsBlock: string): boolean {
  if (/timestamps\s*:\s*(true|1)\b/i.test(optionsBlock)) return true;
  return extractObjectPropertyBlock(optionsBlock, 'timestamps') !== null;
}

/** Body of `transform: function (...) { ... }` inside `toJSON` options. */
export function extractToJsonTransformBody(optionsBlock: string): string | null {
  const toJsonBlock = extractObjectPropertyBlock(optionsBlock, 'toJSON');
  if (!toJsonBlock) return null;

  const fnMatch = /\btransform\s*:\s*function\s*\([^)]*\)\s*\{/i.exec(toJsonBlock);
  if (fnMatch) {
    const openBrace = fnMatch.index + fnMatch[0].length - 1;
    const end = scanBalancedDelimiters(toJsonBlock, openBrace);
    if (end < 0) return null;
    return toJsonBlock.substring(openBrace + 1, end - 1);
  }

  const arrowMatch = /\btransform\s*:\s*(?:\([^)]*\)|\w+)\s*=>\s*\{/i.exec(toJsonBlock);
  if (arrowMatch) {
    const openBrace = arrowMatch.index + arrowMatch[0].length - 1;
    const end = scanBalancedDelimiters(toJsonBlock, openBrace);
    if (end < 0) return null;
    return toJsonBlock.substring(openBrace + 1, end - 1);
  }

  return null;
}

export function deletedFieldsFromToJsonTransform(transformBody: string): string[] {
  const deleted: string[] = [];
  const deletePattern = /(?:^|\s)(?:delete\s+obj\.(\w+);|delete\s+obj\[['"](\w+)['"]\];)/gm;
  let deleteMatch: RegExpExecArray | null;
  while ((deleteMatch = deletePattern.exec(transformBody)) !== null) {
    const fieldName = deleteMatch[1] || deleteMatch[2];
    if (fieldName) deleted.push(fieldName);
  }
  return deleted;
}

export function parseSchemaOptionsMeta(optionsBlock: string | null): {
  hasTimestamps: boolean;
  deletedInToJSON: string[];
} {
  if (!optionsBlock) {
    return { hasTimestamps: false, deletedInToJSON: [] };
  }
  const hasTimestamps = schemaOptionsHasTimestamps(optionsBlock);
  const transformBody = extractToJsonTransformBody(optionsBlock);
  const deletedInToJSON = transformBody ? deletedFieldsFromToJsonTransform(transformBody) : [];
  return { hasTimestamps, deletedInToJSON };
}

export interface MongooseFieldModifiers {
  trim?: boolean;
  unique?: boolean;
}

/** Parse `trim` / `unique` from a Mongoose field definition block. */
export function parseMongooseFieldModifiers(fieldContent: string, genericType: string): MongooseFieldModifiers {
  const modifiers: MongooseFieldModifiers = {};

  if (/unique\s*:\s*(true|1)/i.test(fieldContent)) {
    modifiers.unique = true;
  } else if (/unique\s*:\s*(false|0)/i.test(fieldContent)) {
    modifiers.unique = false;
  }

  if (genericType === 'string') {
    if (/trim\s*:\s*(true|1)/i.test(fieldContent)) {
      modifiers.trim = true;
    } else if (/trim\s*:\s*(false|0)/i.test(fieldContent)) {
      modifiers.trim = false;
    }
  }

  return modifiers;
}

export type ParsedEmbeddedObjectSubField = {
  name: string;
  type: 'String' | 'Number' | 'Decimal128' | 'Boolean' | 'Date' | 'ObjectId';
  required: boolean;
  trim: boolean;
  nullable?: boolean;
  /** `ref: '…'` of an ObjectId sub-field, verbatim. */
  ref?: string;
};

/**
 * Non-array named nested schema ref, e.g. `type: SubscriptionLimitsSchema`.
 * Returns null for arrays (`type: [FooSchema]`) or non-*Schema tokens.
 */
export function parseNamedNestedSchemaRef(fieldBlock: string): string | null {
  if (/type\s*:\s*\[/.test(fieldBlock)) return null;
  const match = fieldBlock.match(/\btype\s*:\s*(\w+Schema)\b/);
  return match?.[1] ?? null;
}

/**
 * Returns the field block's INNER content (between the field braces, no `name:` wrapper).
 * Accepts either the inner block already, or a full `name: { ... }` block.
 */
function normalizeFieldInner(fieldBlock: string): string {
  const trimmed = fieldBlock.trim();
  const wrapper = /^\w+\s*:\s*\{/.exec(trimmed);
  if (!wrapper) return trimmed;

  const openBrace = wrapper.index + wrapper[0].length - 1;
  const end = scanBalancedDelimiters(trimmed, openBrace);
  if (end < 0) return trimmed;
  return trimmed.substring(openBrace + 1, end - 1);
}

/** Concatenate only the depth-0 characters of a block (drops nested `{ ... }` bodies). */
function depthZeroText(inner: string): string {
  let depth = 0;
  let out = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0) {
      out += ch;
    }
  }
  return out;
}

/** True when field block is a scalar Mongoose field (`type: String`, `type: Schema.Types.ObjectId`, …). */
export function isMongooseScalarFieldBlock(fieldBlock: string): boolean {
  const inner = normalizeFieldInner(fieldBlock);
  if (!inner.trim()) return false;
  return /\btype\s*:/i.test(depthZeroText(inner));
}

/**
 * Parse embedded subdocument fields, e.g. `displayText: { tr: { type: String, ... }, en: { ... } }`.
 * Returns null when the block is a scalar Mongoose field (`type: String` at top level).
 */
export function parseMongooseEmbeddedObjectSubFields(fieldBlock: string): ParsedEmbeddedObjectSubField[] | null {
  const inner = normalizeFieldInner(fieldBlock);
  if (!inner.trim() || isMongooseScalarFieldBlock(fieldBlock)) {
    return null;
  }

  const subFields: ParsedEmbeddedObjectSubField[] = [];
  const fieldPattern = /(\w+)\s*:\s*\{/g;
  let fieldMatch: RegExpExecArray | null;

  while ((fieldMatch = fieldPattern.exec(inner)) !== null) {
    const subName = fieldMatch[1];
    const subStart = fieldMatch.index + fieldMatch[0].length;
    const end = scanBalancedDelimiters(inner, subStart - 1);
    const subEnd = end < 0 ? subStart : end - 1;

    const subDef = inner.substring(subStart, subEnd);
    const typeMatch = /type\s*:\s*(\w+(?:\.\w+)*)/i.exec(subDef);
    if (!typeMatch) continue;

    const rawType = typeMatch[1];
    let subType: ParsedEmbeddedObjectSubField['type'] = 'String';
    if (rawType === 'Number') subType = 'Number';
    else if (/(^|\.)Decimal128$/.test(rawType)) subType = 'Decimal128';
    else if (rawType === 'Boolean') subType = 'Boolean';
    else if (rawType === 'Date') subType = 'Date';
    else if (/(^|\.)ObjectId$/.test(rawType)) subType = 'ObjectId';

    const required = /required\s*:\s*(true|1)/i.test(subDef);
    const trim = subType === 'String' ? /trim\s*:\s*(true|1)/i.test(subDef) : false;
    const nullable = subType === 'Number' && /default\s*:\s*null\b/i.test(subDef) ? true : undefined;
    const ref = subType === 'ObjectId' ? /ref\s*:\s*['"]([^'"]+)['"]/.exec(subDef)?.[1] : undefined;

    const sub: ParsedEmbeddedObjectSubField = { name: subName, type: subType, required, trim, nullable };
    if (ref) sub.ref = ref;
    subFields.push(sub);
  }

  return subFields.length > 0 ? subFields : null;
}

/**
 * True when the embedded object should be treated as required.
 * Nested-object syntax (`displayText: { tr: {...}, en: {...} }`) cannot carry a container-level
 * `required`, so we also infer it from sub-fields: required when every sub-field is required.
 */
export function mongooseEmbeddedObjectRequired(fieldBlock: string): boolean {
  const inner = normalizeFieldInner(fieldBlock);
  if (/required\s*:\s*(true|1)/i.test(depthZeroText(inner))) return true;

  const subFields = parseMongooseEmbeddedObjectSubFields(fieldBlock);
  return Boolean(subFields && subFields.length > 0 && subFields.every(sub => sub.required));
}

// ---------------------------------------------------------------------------------------------------------
// Field fidelity (plan 5 P3): enum / default / select and options the Generator does not model are read so
// a regenerated model keeps them. Unmodeled options are kept verbatim (`nativeOptions`).
// ---------------------------------------------------------------------------------------------------------

/** Split `a: 1, b: { c: 2 }, d: [3, 4]` at depth-0 commas (strings, template literals and comments aware). */
export function splitTopLevelEntries(inner: string): string[] {
  const entries: string[] = [];
  let depth = 0;
  let start = 0;
  let quote: string | null = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    const next = inner[i + 1];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '/' && next === '/') {
      const end = inner.indexOf('\n', i);
      i = end < 0 ? inner.length : end;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = inner.indexOf('*/', i + 2);
      i = end < 0 ? inner.length : end + 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
    else if (ch === '{' || ch === '[' || ch === '(') depth++;
    else if (ch === '}' || ch === ']' || ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      entries.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  entries.push(inner.slice(start));
  return entries.map(e => e.trim()).filter(Boolean);
}

/** Inner text of `name: { … }` (or the text itself when already inner). */
export function fieldBlockInner(fieldBlock: string): string {
  return normalizeFieldInner(fieldBlock);
}

type Literal = string | number | boolean | null;

/** `'a'`, `"a"`, `12`, `-1.5`, `true`, `false`, `null` → value; anything else → undefined. */
export function parseLiteral(text: string): Literal | undefined {
  const t = text.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  const quoted = /^(['"])((?:\\.|(?!\1).)*)\1$/.exec(t);
  return quoted ? quoted[2].replace(/\\(['"\\])/g, '$1') : undefined;
}

export interface MongooseFieldExtras {
  enumValues?: string[];
  schemaDefault?: Literal;
  hidden?: boolean;
  nativeOptions?: string[];
}

/** Options the parser models elsewhere when their value is a plain literal (see `parseMongooseFieldModifiers`, `ref`). */
const MODELED_BOOLEAN_OPTIONS = new Set(['required', 'unique', 'trim']);

/**
 * `enum` (string literal array), `default` (literal), `select: false` (hidden) and every other option the
 * Generator does not model, kept verbatim (e.g. `uppercase: true`, `index: true`, `set: (v) => …`).
 */
export function parseMongooseFieldExtras(fieldBlock: string): MongooseFieldExtras {
  const extras: MongooseFieldExtras = {};
  const nativeOptions: string[] = [];
  for (const entry of splitTopLevelEntries(fieldBlockInner(fieldBlock))) {
    const colon = entry.indexOf(':');
    if (colon < 0) {
      nativeOptions.push(entry);
      continue;
    }
    const key = entry.slice(0, colon).trim().replace(/^['"]|['"]$/g, '');
    const value = entry.slice(colon + 1).trim();
    if (key === 'type') continue;
    if (MODELED_BOOLEAN_OPTIONS.has(key) && (value === 'true' || value === 'false' || value === '1' || value === '0')) continue;
    if (key === 'ref' && typeof parseLiteral(value) === 'string') continue;
    if (key === 'of' && value === 'Number') continue; // Map of Number is what model.hbs emits
    if (key === 'enum' && value.startsWith('[') && value.endsWith(']')) {
      const items = splitTopLevelEntries(value.slice(1, -1)).map(parseLiteral);
      if (items.every((v): v is string => typeof v === 'string')) {
        extras.enumValues = items;
        continue;
      }
    }
    if (key === 'default') {
      const literal = parseLiteral(value);
      if (literal !== undefined) {
        extras.schemaDefault = literal;
        continue;
      }
    }
    if (key === 'select' && value === 'false') extras.hidden = true;
    nativeOptions.push(entry);
  }
  if (nativeOptions.length > 0) extras.nativeOptions = nativeOptions;
  return extras;
}

/** `timestamps: true | false | { createdAt, updatedAt }` from the schema options block; undefined when absent. */
export function parseSchemaTimestamps(optionsBlock: string | null): { createdAt: boolean; updatedAt: boolean } | undefined {
  if (!optionsBlock) return undefined;
  const inner = optionsBlock.trim().replace(/^\{/, '').replace(/\}$/, '');
  for (const entry of splitTopLevelEntries(inner)) {
    const colon = entry.indexOf(':');
    if (colon < 0 || entry.slice(0, colon).trim() !== 'timestamps') continue;
    const value = entry.slice(colon + 1).trim();
    if (value === 'true') return { createdAt: true, updatedAt: true };
    if (value === 'false') return { createdAt: false, updatedAt: false };
    if (value.startsWith('{')) {
      const flags = { createdAt: false, updatedAt: false };
      for (const sub of splitTopLevelEntries(value.slice(1, -1))) {
        const c = sub.indexOf(':');
        const k = sub.slice(0, c).trim();
        const v = sub.slice(c + 1).trim();
        if (k === 'createdAt' || k === 'updatedAt') flags[k] = v !== 'false';
      }
      return flags;
    }
  }
  return undefined;
}

export interface InterfaceProperty {
  tsType: string;
  optional: boolean;
  /** Leading JSDoc block, verbatim. */
  doc?: string;
}

/** Top-level properties of `interface <name> … { … }`: declared TS type, `?` and JSDoc. */
export function parseInterfaceProperties(content: string, interfaceName: string): Map<string, InterfaceProperty> {
  const props = new Map<string, InterfaceProperty>();
  const head = new RegExp(`interface\\s+${escapeRegExp(interfaceName)}\\b[^{]*\\{`).exec(content);
  if (!head) return props;
  const open = head.index + head[0].length - 1;
  const end = scanBalancedDelimiters(content, open);
  if (end < 0) return props;
  const body = content.slice(open + 1, end - 1);

  let i = 0;
  let doc: string | undefined;
  while (i < body.length) {
    const rest = body.slice(i);
    const ws = /^\s+/.exec(rest);
    if (ws) {
      i += ws[0].length;
      continue;
    }
    if (rest.startsWith('/**')) {
      const close = body.indexOf('*/', i);
      doc = body.slice(i, close + 2);
      i = close + 2;
      continue;
    }
    if (rest.startsWith('//')) {
      const nl = body.indexOf('\n', i);
      i = nl < 0 ? body.length : nl + 1;
      continue;
    }
    const prop = /^(\w+)(\?)?\s*:\s*/.exec(rest);
    if (!prop) {
      const nl = body.indexOf('\n', i);
      i = nl < 0 ? body.length : nl + 1;
      doc = undefined;
      continue;
    }
    // Type runs to the depth-0 `;` (or line end).
    let j = i + prop[0].length;
    let depth = 0;
    while (j < body.length) {
      const ch = body[j];
      if (ch === '{' || ch === '(' || ch === '[' || ch === '<') depth++;
      else if (ch === '}' || ch === ')' || ch === ']' || ch === '>') depth--;
      else if ((ch === ';' || ch === '\n') && depth <= 0) break;
      j++;
    }
    props.set(prop[1], { tsType: body.slice(i + prop[0].length, j).trim(), optional: prop[2] === '?', doc });
    doc = undefined;
    i = j + 1;
  }
  return props;
}
