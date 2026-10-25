/**
 * Module test (K, plan backend-python-fastapi PY8): `tests/modules/<folder>/test_admin_crud.py`, written once next to a
 * generated module. Every value the test sends or expects is decided here from the model; the template only prints it.
 *
 * Covered: envelope + auth (401 / 403, `traceId`), create with every create-body field → getOne round trip, create with
 * required fields only → defaults (`map_create`) and `trim`, update (a changed field, omitted fields unchanged),
 * JSON Merge Patch `null` rule (api-contract §5: `null` clears an optional single field, a required field / array 400),
 * validation (missing required field, unknown / readonly / hidden-from-create field, limits, enum, format, bad id),
 * missing reference target (400), unique (409), list (paging, default sort, one filter, one sort key), delete → 404.
 * Runs on the skeleton's `tests/conftest.py` fixtures (`client`, `make_token`, `mock_db`; mongomock).
 */
import type { FilterType, NormalizedField, NormalizedObjectSubField } from '../../../shared/normalizedModel.js';
import { updateNullClears } from '../../../shared/normalizedModel.js';
import { constraintsForField, EMAIL_PATTERN, isNumericEnum } from '../../../shared/fieldConstraints.js';
import { PY_LINE_LENGTH, pyCall, pyStr } from './pythonFormat.js';

export type PyTestCategory = 'scalar' | 'scalarArray' | 'enumArray' | 'object' | 'objectArray' | 'json' | 'ref' | 'refArray';

/** What the test builder needs of a field (prepared by `pythonContext.ts`). */
export interface PyTestField {
  source: NormalizedField;
  name: string;
  category: PyTestCategory;
  /** Python element type: `str`, `int`, `float`, `bool`, `datetime`, `date`, `DecimalStr`, enum / object class, JSON type. */
  type: string;
  isEnum: boolean;
  requiredStrict: boolean;
  hasDefault: boolean;
  inCreate: boolean;
  inUpdate: boolean;
  hidden: boolean;
  /** `access.computed`: no filter, no sort. */
  computed?: boolean;
  unique: boolean;
  /** Effective list filter (`null`: none / `searchable: false`). */
  filter: FilterType | null;
  /** Target collection when the reference is checked / populated in this host. */
  refCollection?: string;
  /** Required unique fields of the target (the placeholder target document fills them). */
  refUnique?: string[];
  populated: boolean;
}

export interface PythonTestContext {
  /** `pytestmark = …skip` when a required field has no sample value (custom `pattern`). */
  skipReason?: string;
  skipStatement?: string;
  /** Rendered statements (already indented). */
  refTargets: string;
  populated: string;
  hidden: string;
  body0: string;
  body1: string;
  minimal: string;
  minimalExpected: string;
  twoRecords: boolean;
  requiredFields: string;
  invalidCreate: string;
  notUpdatable: string;
  missingRefs: string;
  singleRefs: string;
  hasUnique: boolean;
  uniqueUpdate?: string;
  notFilterable: string;
  notSortable: string;
  update?: { field: string; payload: string; keep?: string };
  nullClear?: { field: string };
  nullRequired?: { field: string };
  filter?: { body: string };
  sort?: { field: string; firstIsFirst: boolean };
}

/** Python literal of a JSON value; `{ $expr }` is printed verbatim (e.g. `refs["userId"][0]`). */
type Lit = null | boolean | number | string | Lit[] | { [key: string]: Lit } | { $expr: string } | { $tuple: Lit[] };

function isExpr(v: Lit): v is { $expr: string } {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && typeof (v as { $expr?: unknown }).$expr === 'string';
}

function isTuple(v: Lit): v is { $tuple: Lit[] } {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && Array.isArray((v as { $tuple?: unknown }).$tuple);
}

const expr = (text: string): Lit => ({ $expr: text });
const tupleOf = (...items: Lit[]): Lit => ({ $tuple: items });

export function pyLit(v: Lit): string {
  if (v === null) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '0';
  if (typeof v === 'string') return pyStr(v);
  if (Array.isArray(v)) return `[${v.map(pyLit).join(', ')}]`;
  if (isExpr(v)) return v.$expr;
  if (isTuple(v)) return v.$tuple.length === 1 ? `(${pyLit(v.$tuple[0])},)` : `(${v.$tuple.map(pyLit).join(', ')})`;
  return `{${Object.entries(v).map(([k, x]) => `${pyStr(k)}: ${pyLit(x)}`).join(', ')}}`;
}

/**
 * `prefix<literal>suffix` at `indent`, split like `ruff format` splits a literal that does not fit: one element per
 * line with a trailing comma, recursively (a string or an expression is never split).
 */
export function pyLitLines(v: Lit, indent: number, prefix: string, suffix = ''): string[] {
  const pad = ' '.repeat(indent);
  const one = `${pad}${prefix}${pyLit(v)}${suffix}`;
  if (one.length <= PY_LINE_LENGTH || v === null || typeof v !== 'object' || isExpr(v)) return [one];
  let open: string;
  let close: string;
  let items: Array<[string, Lit]>;
  if (Array.isArray(v)) [open, close, items] = ['[', ']', v.map((x): [string, Lit] => ['', x])];
  else if (isTuple(v)) [open, close, items] = ['(', ')', v.$tuple.map((x): [string, Lit] => ['', x])];
  else [open, close, items] = ['{', '}', Object.entries(v).map(([k, x]): [string, Lit] => [`${pyStr(k)}: `, x])];
  if (!items.length) return [one];
  return [`${pad}${prefix}${open}`, ...items.flatMap(([p, x]) => pyLitLines(x, indent + 4, p, ',')), `${pad}${close}${suffix}`];
}

const block = (v: Lit, indent: number, prefix: string, suffix = '') => pyLitLines(v, indent, prefix, suffix).join('\n');

/** JS regex of a model pattern (Python syntax; the common subset is the same). Unusable pattern → `undefined`. */
function regexOf(pattern: string | undefined): RegExp | undefined {
  if (!pattern) return undefined;
  try {
    return new RegExp(pattern.replace(/\(\?P</g, '(?<'));
  } catch {
    return undefined;
  }
}

const PATTERN_CANDIDATES = [
  'ABC', 'ABD', 'abc', 'abd', 'A1', 'A2', 'a1', 'a2', 'AB12', 'AB13', '1', '2', '10', '11', '123', '124', 'x', 'y',
  'a-b', 'a-c', 'a_b', 'a_c', 'Abc', 'Abd', '2026-01-01', '2026-01-02', 'user0@example.com', 'user1@example.com',
  'https://example.com/a', 'https://example.com/b', '+905551112233', '+905551112234', 'TR', 'US'
];

/**
 * A string built from a simple pattern (anchors, literals, `\\d` / `\\w` / `[A-Z0-9_-]` classes, `{n}` / `{n,m}` / `+` /
 * `*` / `?`); `i` varies the first variable character. Groups, alternation and look-arounds → `undefined`.
 */
function sampleFromPattern(pattern: string, i: number): string | undefined {
  let src = pattern;
  if (src.startsWith('^')) src = src.slice(1);
  if (src.endsWith('$') && !src.endsWith('\\$')) src = src.slice(0, -1);
  let out = '';
  let varied = false;
  let pos = 0;
  const pick = (chars: string) => {
    if (!varied && chars.length > 1) {
      varied = true;
      return chars[i % chars.length];
    }
    return chars[0];
  };
  const classChars = (body: string): string | undefined => {
    let chars = '';
    for (let k = 0; k < body.length; k++) {
      if (body[k] === '\\') {
        const e = body[++k];
        chars += e === 'd' ? '0123456789' : e === 'w' ? 'abc012' : e ?? '';
      } else if (body[k + 1] === '-' && body[k + 2] !== undefined && body[k + 2] !== ']') {
        for (let c = body.charCodeAt(k); c <= body.charCodeAt(k + 2) && chars.length < 64; c++) chars += String.fromCharCode(c);
        k += 2;
      } else chars += body[k];
    }
    return chars || undefined;
  };
  while (pos < src.length) {
    let chars: string | undefined;
    const ch = src[pos];
    if ('()|.'.includes(ch)) return undefined;
    if (ch === '[') {
      const end = src.indexOf(']', pos + 1);
      if (end < 0 || src[pos + 1] === '^') return undefined;
      chars = classChars(src.slice(pos + 1, end));
      pos = end + 1;
    } else if (ch === '\\') {
      const e = src[pos + 1];
      chars = e === 'd' ? '0123456789' : e === 'w' ? 'abc012' : e && /[^A-Za-z0-9]/.test(e) ? e : undefined;
      pos += 2;
    } else {
      chars = ch;
      pos += 1;
    }
    if (!chars) return undefined;
    let count = 1;
    const quant = /^(\{(\d+)(?:,(\d*))?\}|[+*?])/.exec(src.slice(pos));
    if (quant) {
      pos += quant[0].length;
      if (quant[0] === '+') count = 1;
      else if (quant[0] === '*' || quant[0] === '?') count = 1;
      else count = Number(quant[2]);
    }
    for (let k = 0; k < count; k++) out += pick(chars);
  }
  return out;
}

/** Two sample strings (index 0 / 1) that satisfy the field's limits, pattern and format; fewer when none fit. */
function stringSamples(field: NormalizedField): string[] {
  const c = constraintsForField(field, field.constraints) ?? {};
  const email = field.format === 'email';
  const checks = [regexOf(c.pattern), email ? regexOf(EMAIL_PATTERN) : undefined].filter((r): r is RegExp => r !== undefined);
  const fits = (s: string) =>
    (c.minLength === undefined || s.length >= c.minLength) && (c.maxLength === undefined || s.length <= c.maxLength) && checks.every((r) => r.test(s));
  const fit = (s: string) => {
    let out = s;
    if (c.minLength !== undefined && out.length < c.minLength) out = out.slice(0, -1) + 'x'.repeat(c.minLength - out.length) + out.slice(-1);
    if (c.maxLength !== undefined && out.length > c.maxLength) out = out.slice(out.length - c.maxLength);
    return out;
  };
  const own = email ? [0, 1].map((i) => `user${i}@example.com`) : [0, 1].map((i) => fit(`${field.name.toLowerCase()}-${i}`));
  const fromPattern = c.pattern && !email ? [0, 1].map((i) => sampleFromPattern(c.pattern!, i)).filter((x): x is string => x !== undefined) : [];
  const out: string[] = [];
  for (const s of [...own, ...fromPattern, ...PATTERN_CANDIDATES]) {
    if (fits(s) && !out.includes(s)) out.push(s);
    if (out.length === 2) break;
  }
  return out;
}

function numberSample(field: NormalizedField, int: boolean, i: number): number {
  const c = constraintsForField(field, field.constraints) ?? {};
  const lo = c.min ?? 0;
  const hi = c.max ?? Number.POSITIVE_INFINITY;
  const options = int ? [Math.ceil(lo) + 1 + i, Math.ceil(lo) + i, Math.ceil(lo)] : [lo + 1.5 + i, lo + 0.5 + i / 4, lo];
  return options.find((v) => v <= hi) ?? lo;
}

function subSample(sub: NormalizedObjectSubField, i: number): Lit {
  switch (sub.kind) {
    case 'string':
    case 'enum':
      return `${sub.name.toLowerCase()}-${i}`;
    case 'number':
      return sub.numberFormat === 'int' ? 2 + i : 2.5 + i;
    case 'decimal':
      return `${3 + i}.25`;
    case 'boolean':
      return i === 0;
    case 'date':
      return `2026-02-0${i + 1}T00:00:00.000Z`;
    case 'reference':
      return `65f00000000000000000000${i + 1}`;
    case 'object':
      return { k: i };
    case 'json':
      return { k: [i, 'v'] };
    case 'map':
      return /number/i.test(sub.native?.type ?? '') ? { k: 1.5 } : /boolean/i.test(sub.native?.type ?? '') ? { k: true } : { k: 'v' };
    default:
      return null;
  }
}

/** Sample wire value of one element (index 0 / 1); `undefined` when none fits. */
function elementSample(f: PyTestField, i: number): Lit | undefined {
  const src = f.source;
  if (f.category === 'ref' || f.category === 'refArray') return { $expr: `refs[${pyStr(f.name)}][${i}]` };
  if (f.category === 'object' || f.category === 'objectArray') {
    return Object.fromEntries((src.object?.fields ?? []).map((sub) => [sub.name, subSample(sub, i)]));
  }
  if (f.category === 'json') {
    if (f.type === 'JsonValue') return { k: [i, 'v'] };
    if (f.type.endsWith('float]')) return { k: 1.5 + i };
    if (f.type.endsWith('bool]')) return { k: i === 0 };
    if (f.type.endsWith('str]')) return { k: `v${i}` };
    return { k: i };
  }
  if (src.enum?.values.length) {
    const numbers = isNumericEnum(src.enum) ? src.enum.numbers : undefined;
    const at = i % src.enum.values.length;
    return numbers ? numbers[at] : src.enum.values[at];
  }
  switch (f.type) {
    case 'str':
      return f.category === 'scalarArray' ? `${src.name.toLowerCase()}-${i}` : stringSamples(src)[i] ?? stringSamples(src)[0];
    case 'int':
      return numberSample(src, true, i);
    case 'float':
      return numberSample(src, false, i);
    case 'DecimalStr':
      return String(numberSample(src, false, i));
    case 'bool':
      return i === 0;
    case 'datetime':
      return `2026-01-0${i + 1}T03:04:05.678Z`;
    case 'date':
      return `2026-01-0${i + 1}`;
    default:
      return undefined;
  }
}

const isArrayCategory = (c: PyTestCategory) => c === 'scalarArray' || c === 'enumArray' || c === 'objectArray' || c === 'refArray';

function sample(f: PyTestField, i: number): Lit | undefined {
  const el = elementSample(f, i);
  if (el === undefined) return undefined;
  return isArrayCategory(f.category) ? [el] : el;
}

/**
 * Value for a field the create / update body does not take (`INVALID_CREATE`, `NOT_UPDATABLE`: any value → 400).
 * These lists are module-level constants, so a reference cannot use the `refs` fixture: a fixed id instead.
 */
function bodylessSample(f: PyTestField, i: number): Lit {
  if (f.category === 'ref') return `65f00000000000000000000${i + 1}`;
  if (f.category === 'refArray') return [`65f00000000000000000000${i + 1}`];
  return sample(f, i) ?? 1;
}

/** Wire value `map_create` leaves for a field the body did not send (defaults, `[]`, .NET zero values, else `None`). */
function omittedValue(f: PyTestField): Lit {
  const src = f.source;
  if (isArrayCategory(f.category)) return [];
  if (f.hasDefault && src.default !== undefined && src.default !== null) {
    if (src.enum?.values.length && isNumericEnum(src.enum)) {
      const at = src.enum.values.indexOf(String(src.default));
      return at >= 0 ? src.enum.numbers[at] : Number(src.default);
    }
    if (f.type === 'DecimalStr') return String(src.default);
    if (f.type === 'float' && typeof src.default === 'number') return src.default;
    return src.default;
  }
  if (!f.inCreate && f.requiredStrict && f.category === 'scalar') {
    const zero: Record<string, Lit> = { str: '', int: 0, float: 0, bool: false };
    if (f.type in zero) return zero[f.type];
  }
  return null;
}

/** Invalid create values of a field (each alone → 400). */
function invalidValues(f: PyTestField): Lit[] {
  const src = f.source;
  const out: Lit[] = [];
  const c = constraintsForField(src, src.constraints) ?? {};
  switch (f.category) {
    case 'ref':
      return ['not-an-id'];
    case 'refArray':
      return [['not-an-id']];
    case 'object': {
      const subs = src.object?.fields ?? [];
      if (!subs.length) return [[1]];
      const valid = Object.fromEntries(subs.map((sub) => [sub.name, subSample(sub, 0)]));
      out.push('not-an-object');
      const requiredSub = subs.find((sub) => sub.required && sub.nullable !== true);
      if (requiredSub) out.push(Object.fromEntries(Object.entries(valid).filter(([k]) => k !== requiredSub.name)));
      const intSub = subs.find((sub) => sub.kind === 'number' && sub.numberFormat === 'int');
      if (intSub) out.push({ ...valid, [intSub.name]: 1.5 });
      return out;
    }
    case 'objectArray':
      return [['not-an-object']];
    case 'enumArray':
      return [[isNumericEnum(src.enum) ? 99999 : '__invalid__']];
    case 'json':
    case 'scalarArray':
      return f.type === 'dict[str, JsonValue]' ? [[1]] : [];
  }
  if (src.enum?.values.length) return [isNumericEnum(src.enum) ? 99999 : '__invalid__'];
  switch (f.type) {
    case 'str': {
      if (c.maxLength !== undefined) out.push(expr(`"x" * ${c.maxLength + 1}`));
      if (c.minLength !== undefined && c.minLength > 1) out.push(expr(`"x" * ${c.minLength - 1}`));
      else if (f.requiredStrict) out.push(src.trim === true ? '   ' : '');
      const pattern = regexOf(c.pattern);
      if (pattern && !pattern.test('!!')) out.push('!!');
      if (src.format === 'email') out.push('not-an-email');
      break;
    }
    case 'int':
      out.push(1.5);
      if (c.min !== undefined) out.push(Math.ceil(c.min) - 1);
      if (c.max !== undefined) out.push(Math.floor(c.max) + 1);
      break;
    case 'float':
      if (c.min !== undefined) out.push(c.min - 1);
      if (c.max !== undefined) out.push(c.max + 1);
      break;
    case 'DecimalStr':
      out.push(1.5);
      if (c.min !== undefined) out.push(String(c.min - 1));
      if (c.max !== undefined) out.push(String(c.max + 1));
      break;
    case 'bool':
      out.push('maybe');
      break;
    case 'datetime':
      out.push('not-a-date');
      break;
    case 'date':
      out.push('2026-01-01T10:00:00Z');
      break;
  }
  return out;
}

const dict = (entries: Array<[string, Lit]>): Lit => Object.fromEntries(entries);

function same(a: Lit | undefined, b: Lit | undefined): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function buildPythonTestContext(fields: PyTestField[]): PythonTestContext {
  const create = fields.filter((f) => f.inCreate);
  const visible = fields.filter((f) => !f.hidden);
  const missingSample: string[] = [];
  const body0: Array<[string, Lit]> = [];
  const body1: Array<[string, Lit]> = [];
  const values0 = new Map<string, Lit>();
  const values1 = new Map<string, Lit>();
  for (const f of create) {
    const v0 = sample(f, 0);
    const v1 = sample(f, 1);
    if (v0 === undefined || v1 === undefined) {
      if (f.requiredStrict && !f.hasDefault) missingSample.push(f.name);
      continue;
    }
    body0.push([f.name, v0]);
    body1.push([f.name, v1]);
    values0.set(f.name, v0);
    values1.set(f.name, v1);
  }
  const twoRecords = fields.filter((f) => f.unique && values0.has(f.name)).every((f) => !same(values0.get(f.name), values1.get(f.name)));

  // Required fields only (the rest comes from `map_create`); trimmed text is sent padded.
  const requiredInBody = create.filter((f) => f.requiredStrict && !f.hasDefault && !isArrayCategory(f.category));
  const minimal: Array<[string, Lit]> = [];
  const minimalExpected: Array<[string, Lit]> = [];
  for (const f of requiredInBody) {
    const v = values0.get(f.name);
    if (v === undefined) continue;
    const padded = f.source.trim === true && f.type === 'str' && typeof v === 'string' && !f.isEnum;
    minimal.push([f.name, padded ? `  ${v}  ` : v]);
    if (!f.hidden) minimalExpected.push([f.name, v]);
  }
  for (const f of visible) {
    if (requiredInBody.includes(f)) continue;
    // A field the row cannot fill (readonly, required, no default) reads back as `None`; checked as such.
    minimalExpected.push([f.name, omittedValue(f)]);
  }

  // Invalid values: limits / format / kind per create field, then fields the create body does not take.
  const invalidCreate: Lit[] = [];
  for (const f of create) for (const v of invalidValues(f)) invalidCreate.push(tupleOf(f.name, v));
  for (const f of fields.filter((x) => !x.inCreate)) invalidCreate.push(tupleOf(f.name, bodylessSample(f, 0)));
  const notUpdatable = fields.filter((f) => !f.inUpdate).map((f) => tupleOf(f.name, bodylessSample(f, 1)));
  const checkedRefs = create.filter((f) => f.refCollection && values0.has(f.name));

  // Update: one changed field (text first), another field must stay as created.
  const updatable = visible.filter((f) => f.inUpdate && f.category === 'scalar' && values0.has(f.name) && !same(values0.get(f.name), values1.get(f.name)));
  const changed = updatable.find((f) => f.type === 'str' && !f.unique) ?? updatable.find((f) => !f.unique) ?? updatable[0];
  const keep = changed ? visible.find((f) => f !== changed && values0.has(f.name) && f.category === 'scalar') : undefined;
  const update = changed
    ? { field: changed.name, payload: block({ [changed.name]: values1.get(changed.name)! }, 4, 'payload = '), keep: keep?.name }
    : undefined;

  const single = (f: PyTestField) => !isArrayCategory(f.category);
  const clearable = visible.find((f) => f.inUpdate && single(f) && updateNullClears({ ...f.source, isArray: false }) && values0.has(f.name));
  const notNull = fields.find((f) => f.inUpdate && single(f) && f.requiredStrict) ?? fields.find((f) => f.inUpdate && !single(f));

  // List: one filter that tells the two records apart; one sort key with different values.
  let filter: { body: string } | undefined;
  if (twoRecords) {
    for (const f of visible) {
      const v0 = values0.get(f.name);
      const v1 = values1.get(f.name);
      if (!f.filter || v0 === undefined || same(v0, v1) || (isArrayCategory(f.category) && f.category !== 'refArray')) continue;
      let value: Lit | undefined;
      switch (f.filter) {
        case 'regex':
          // Case-insensitive "contains": a changed-case piece of the value.
          value = typeof v0 === 'string' && v0.length > 1 ? v0.slice(1).toUpperCase() : v0;
          break;
        case 'eq':
        case 'boolean':
          value = f.type === 'DecimalStr' ? undefined : v0;
          break;
        case 'enum':
          value = [v0];
          break;
        case 'reference':
          value = { $expr: `refs[${pyStr(f.name)}][0]` };
          break;
        case 'range':
          value = f.type === 'DecimalStr' ? undefined : { min: v0, max: v0 };
          break;
        default:
          value = undefined;
      }
      if (value === undefined) continue;
      filter = { body: block({ filters: { [f.name]: value } }, 4, 'payload = ') };
      break;
    }
  }
  let sort: { field: string; firstIsFirst: boolean } | undefined;
  if (twoRecords) {
    // mongomock cannot compare `Decimal128`: decimals are sorted in the real-Mongo smoke only.
    const key = visible.find((f) => {
      const v0 = values0.get(f.name);
      const v1 = values1.get(f.name);
      return f.category === 'scalar' && f.type !== 'DecimalStr' && v0 !== undefined && !same(v0, v1) && typeof v0 === typeof v1 && typeof v0 !== 'object';
    });
    if (key) {
      const v0 = values0.get(key.name) as string | number | boolean;
      const v1 = values1.get(key.name) as string | number | boolean;
      sort = { field: key.name, firstIsFirst: v0 < v1 };
    }
  }

  // Unique on update: the second record takes the first one's value → 409.
  const uniqueUpdate = twoRecords ? visible.find((f) => f.unique && f.inUpdate && single(f) && values0.has(f.name)) : undefined;
  // Filters / sort keys the list body refuses (400): hidden, `searchable: false`, kinds without a filter / sort.
  const names = (list: PyTestField[]) => list.map((f) => f.name);
  const notFilterable = [...names(fields.filter((f) => !f.filter)), '__unknown__'];
  const notSortable = [...names(fields.filter((f) => f.hidden || f.computed || (f.category !== 'scalar' && f.category !== 'ref'))), '__unknown__'];
  const statement = (name: string, items: string[]) => block(tupleOf(...items), 0, `${name}: tuple[str, ...] = `);

  const skipReason = missingSample.length
    ? `${missingSample.join(', ')}: modelin pattern'ine uyan örnek değer üretilemedi; body() / minimal_body()'yi elle doldurun.`
    : undefined;
  return {
    skipReason,
    skipStatement: skipReason ? pyCall('pytestmark = pytest.mark.skip', [`reason=${pyStr(skipReason)}`]) : undefined,
    refTargets: block(
      Object.fromEntries(
        fields
          .filter((f) => f.category === 'ref' || f.category === 'refArray')
          .map((f): [string, Lit] => [f.name, f.refCollection ? tupleOf(f.refCollection, tupleOf(...(f.refUnique ?? []))) : null])
      ),
      0,
      'REF_TARGETS: dict[str, tuple[str, tuple[str, ...]] | None] = '
    ),
    populated: statement('POPULATED', names(fields.filter((f) => f.populated && !f.hidden))),
    hidden: statement('HIDDEN', names(fields.filter((f) => f.hidden))),
    notFilterable: statement('NOT_FILTERABLE', notFilterable),
    notSortable: statement('NOT_SORTABLE', notSortable),
    uniqueUpdate: uniqueUpdate?.name,
    body0: block(dict(body0), 8, 'return '),
    body1: block(dict(body1), 4, 'return '),
    minimal: block(dict(minimal), 4, 'return '),
    minimalExpected: block(dict(minimalExpected), 4, 'return '),
    twoRecords,
    requiredFields: statement('REQUIRED', names(requiredInBody.filter((f) => values0.has(f.name)))),
    invalidCreate: block(invalidCreate, 0, 'INVALID_CREATE: list[tuple[str, Any]] = '),
    notUpdatable: block(notUpdatable, 0, 'NOT_UPDATABLE: list[tuple[str, Any]] = '),
    missingRefs: statement('MISSING_REFS', names(checkedRefs)),
    singleRefs: statement('SINGLE_REFS', names(checkedRefs.filter((f) => f.category === 'ref'))),
    hasUnique: fields.some((f) => f.unique && values0.has(f.name)),
    update,
    nullClear: clearable ? { field: clearable.name } : undefined,
    nullRequired: notNull ? { field: notNull.name } : undefined,
    filter,
    sort
  };
}
