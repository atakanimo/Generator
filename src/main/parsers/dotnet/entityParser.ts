/**
 * Narrow .NET entity parser (plan backend-dotnet-efcore §6, D5): reads the entity shape the Generator writes
 * (`Domain/<Folder>/<Entity>.cs`) back into a NormalizedModel. Only the file-owned parts come from here (kind,
 * required, isArray, unique, trim, enum values, default, object sub-fields, reference target); filters, access, UI
 * and API settings come from the manifest row (`mergeModel`).
 *
 * Each model property line ends with a marker comment `// <json name> [unique] [trim] [required] [computed]`;
 * navigation properties end with `// nav`. `computed` (or a `[NotMapped]` line above the property) is the one access
 * setting the file owns: the property is not stored. Hand-written entities without markers still parse (JSON name = camelCase).
 */
import { readFileSync } from 'fs';
import { basename, dirname } from 'path';
import type { FieldKind, NormalizedEnum, NormalizedField, NormalizedModel, NormalizedObjectSubField } from '../../../shared/normalizedModel.js';
import { NORMALIZED_MODEL_VERSION } from '../../../shared/normalizedModel.js';
import { camelCase, pluralize } from '../../utils/namingUtils.js';

const SCALARS: Record<string, FieldKind> = {
  string: 'string',
  double: 'number',
  int: 'number',
  long: 'number',
  float: 'number',
  decimal: 'decimal',
  bool: 'boolean',
  DateTimeOffset: 'date',
  DateTime: 'date',
  DateOnly: 'date'
};

const PROPERTY =
  /^\s*public\s+(?<type>[\w<>,.? ]+?)\s+(?<name>\w+)\s*\{\s*get;\s*set;\s*\}(?:\s*=\s*(?<init>[^;]+);)?\s*(?:\/\/\s*(?<marker>.*))?$/;

interface Property {
  type: string;
  name: string;
  init?: string;
  marker?: string;
  /** `[NotMapped]` on the line above. */
  notMapped?: boolean;
}

function properties(body: string): Property[] {
  const lines = body.split('\n');
  return lines.flatMap((line, i) => {
    const g = PROPERTY.exec(line)?.groups;
    if (!g) return [];
    const notMapped = i > 0 && /^\s*\[NotMapped\]\s*$/.test(lines[i - 1]);
    return [{ type: g.type.replace(/\s+/g, ''), name: g.name, init: g.init?.trim(), marker: g.marker?.trim(), ...(notMapped ? { notMapped } : {}) }];
  });
}

/** Body of `class <name> ... { ... }` (brace matched). */
function classBody(content: string, header: RegExp): string | null {
  const m = header.exec(content);
  if (!m) return null;
  let depth = 0;
  for (let i = content.indexOf('{', m.index); i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}' && --depth === 0) return content.slice(content.indexOf('{', m.index) + 1, i);
  }
  return null;
}

/** C# enum member values: explicit `= n`, otherwise previous + 1 (first 0), as the compiler assigns them. */
function memberNumbers(body: string): number[] {
  const numbers: number[] = [];
  let next = 0;
  for (const raw of body.replace(/\[[^\]]*\]/g, '').split(',')) {
    const [name, value] = raw.split('=').map((x) => x.trim());
    if (!name || !/^\w+$/.test(name)) continue;
    const n = value !== undefined && /^-?\d+$/.test(value) ? Number(value) : next;
    numbers.push(n);
    next = n + 1;
  }
  return numbers;
}

function enums(content: string): Map<string, NormalizedEnum> {
  const out = new Map<string, NormalizedEnum>();
  for (const m of content.matchAll(/public\s+enum\s+(\w+)\s*\{([\s\S]*?)\}/g)) {
    const before = content.slice(0, m.index ?? 0);
    const head = before.slice(before.lastIndexOf('}'));
    const numeric = /\[NumericEnum\]/.test(head);
    // `[JsonStringEnumMemberName("…")]` holds the JSON value; without it the member name (camelCase) is the value.
    const named = [...m[2].matchAll(/JsonStringEnumMemberName\("((?:[^"\\]|\\.)*)"\)/g)].map((x) => JSON.parse(`"${x[1]}"`) as string);
    const members = m[2]
      .replace(/\[[^\]]*\]/g, '')
      .split(',')
      .map((x) => x.trim().split('=')[0].trim())
      .filter((x) => /^\w+$/.test(x));
    const values = named.length ? named : members.map(camelCase);
    out.set(m[1], numeric ? { values, numbers: memberNumbers(m[2]) } : { values });
  }
  return out;
}

function complexTypes(content: string): Map<string, Property[]> {
  const out = new Map<string, Property[]>();
  for (const m of content.matchAll(/public\s+(?:sealed\s+)?class\s+(\w+)\s*(?!:)\{/g)) {
    const body = classBody(content.slice(m.index), /class\s+\w+/);
    if (body !== null) out.set(m[1], properties(body));
  }
  return out;
}

function markerOf(p: Property) {
  const parts = (p.marker ?? '').split(/\s+/).filter(Boolean);
  const hasMarker = parts.length > 0 && parts[0] !== 'nav';
  const flags = parts.slice(1);
  return {
    json: hasMarker ? parts[0] : camelCase(p.name),
    flags: new Set(flags),
    nav: parts[0] === 'nav',
    /** `ref=<Folder>`: reference target of an id property without a navigation (document strategy). */
    ref: flags.find((f) => f.startsWith('ref='))?.slice(4)
  };
}

function parseDefault(init: string | undefined, kind: FieldKind, enumValues: string[] | undefined, enumType: string): NormalizedField['default'] {
  if (!init) return undefined;
  if (kind === 'boolean' && (init === 'true' || init === 'false')) return init === 'true';
  if ((kind === 'number' || kind === 'decimal') && /^-?\d+(\.\d+)?[mMdDfF]?$/.test(init)) return Number(init.replace(/[mMdDfF]$/, ''));
  if (kind === 'string' && /^"/.test(init)) {
    try {
      return JSON.parse(init) as string;
    } catch {
      return undefined;
    }
  }
  if (kind === 'enum' && init.startsWith(`${enumType}.`)) {
    const member = init.slice(enumType.length + 1);
    return enumValues?.find((v) => v.replace(/[^A-Za-z0-9]/g, '').toLowerCase() === member.toLowerCase());
  }
  return undefined;
}

/** Id-typed property = reference: `EntityId` in generated entities (plan backend-dotnet-database-providers K6), `Guid` in hand-written ones. */
const ID_TYPES = new Set(['EntityId', 'Guid']);

function subField(p: Property): NormalizedObjectSubField {
  const nullable = p.type.endsWith('?');
  const base = p.type.replace(/\?$/, '');
  const { json, flags } = markerOf(p);
  const kind: FieldKind = ID_TYPES.has(base) ? 'reference' : (SCALARS[base] ?? 'unknown');
  return {
    name: json,
    kind,
    required: !nullable,
    ...(flags.has('trim') ? { trim: true } : {}),
    ...(base === 'int' || base === 'long' ? { numberFormat: 'int' as const } : {})
  };
}

/**
 * @param entityFolders entity class name → module folder (`EventType` → `EventTypes`) for every entity of the host;
 *   reference targets resolve through it (fallback: pluralized class name).
 */
export function parseDotnetEntity(filePath: string, entityFolders: Map<string, string> = new Map()): NormalizedModel {
  const content = readFileSync(filePath, 'utf8');
  const className = basename(filePath, '.cs');
  const folder = basename(dirname(filePath));
  const body = classBody(content, new RegExp(`class\\s+${className}\\b[^{]*`));
  if (body === null) throw new Error(`${filePath}: class ${className} not found`);

  const enumMap = enums(content);
  const complexMap = complexTypes(content);
  const props = properties(body);
  const navTypes = new Map(props.filter((p) => markerOf(p).nav).map((p) => [p.name, p.type.replace(/\?$/, '')]));
  const targetOf = (cls: string) => entityFolders.get(cls) ?? pluralize(cls);
  const isEntity = (cls: string) => entityFolders.has(cls) || (!SCALARS[cls] && !enumMap.has(cls) && !complexMap.has(cls) && !ID_TYPES.has(cls));

  const fields: NormalizedField[] = [];
  for (const p of props) {
    const { json, flags, nav, ref } = markerOf(p);
    if (nav) continue;
    const nullable = p.type.endsWith('?');
    const base = p.type.replace(/\?$/, '');
    const list = /^List<(.+)>$/.exec(base)?.[1];
    const field: NormalizedField = { name: json, kind: 'unknown', isArray: !!list, required: list ? flags.has('required') : !nullable };
    if (flags.has('unique')) field.unique = true;
    if (flags.has('trim')) field.trim = true;
    if (flags.has('computed') || p.notMapped) field.access = { computed: true };

    const inner = list ?? base;
    const map = /^Dictionary<string,(\w+)>$/.exec(inner);
    if (ID_TYPES.has(inner)) {
      field.kind = 'reference';
      // FK `<Stem>Id` next to navigation `<Stem>` (`// nav`).
      const navType = !list && /Id$/.test(p.name) ? navTypes.get(p.name.slice(0, -2)) : undefined;
      if (navType) field.reference = { target: targetOf(navType) };
      else if (ref) field.reference = { target: ref };
    } else if (SCALARS[inner]) {
      field.kind = SCALARS[inner];
      if (inner === 'int' || inner === 'long') field.numberFormat = 'int';
      if (inner === 'DateOnly') field.dateFormat = 'date';
    } else if (enumMap.has(inner)) {
      field.kind = 'enum';
      field.enum = enumMap.get(inner)!;
    } else if (complexMap.has(inner)) {
      field.kind = 'object';
      field.object = { typeName: inner, fields: complexMap.get(inner)!.map(subField) };
    } else if (inner === 'JsonDocument') {
      field.kind = 'json';
    } else if (map) {
      field.kind = 'map';
      const value = SCALARS[map[1]];
      if (value && value !== 'string') field.native = { type: `map<${value}>` };
    } else if (list && isEntity(inner)) {
      field.kind = 'reference';
      field.reference = { target: targetOf(inner) };
    }
    const def = parseDefault(p.init, field.kind, field.enum?.values, inner);
    if (def !== undefined) field.default = def;
    fields.push(field);
  }

  // AuditableEntity timestamps (filters / access live in the manifest row).
  fields.push(
    { name: 'createdAt', kind: 'date', isArray: false, required: false },
    { name: 'updatedAt', kind: 'date', isArray: false, required: false }
  );
  return { schemaVersion: NORMALIZED_MODEL_VERSION, entityName: folder, fields, timestamps: { createdAt: true, updatedAt: true } };
}
