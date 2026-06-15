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

  let parenCount = 1;
  let inString = false;
  let stringChar = '';
  let braceCount = 0;
  let firstBraceEnd = -1;
  let firstBraceStart = -1;
  let secondBraceStart = -1;

  for (let i = schemaStart; i < content.length; i++) {
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

    if (!inString) {
      if (char === '(') parenCount++;
      if (char === ')') {
        parenCount--;
        if (parenCount === 0) break;
      }

      if (char === '{' && firstBraceStart === -1) {
        firstBraceStart = i;
        braceCount = 1;
      } else if (char === '{' && firstBraceStart !== -1 && firstBraceEnd === -1) {
        braceCount++;
      } else if (char === '}' && firstBraceStart !== -1 && firstBraceEnd === -1) {
        braceCount--;
        if (braceCount === 0) {
          firstBraceEnd = i + 1;
          for (let j = i + 1; j < content.length && j < i + 100; j++) {
            if (content[j] === '{') {
              secondBraceStart = j;
              break;
            }
            if (content[j] === ')') break;
          }
        }
      }
    }
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
