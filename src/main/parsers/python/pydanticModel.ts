/**
 * Pydantic model import (plan backend-python-fastapi K1, PY7): reads a hand-written Pydantic document class into a
 * NormalizedModel once; after the import the manifest is the model's source and the class moves to the module's
 * `model_generated.py`.
 *
 * The module is read statically with Python's `ast` (`EXTRACT_SCRIPT`, never imported); this file holds the typing
 * semantics: `X | None` / `Optional`, `Annotated[…, Field / StringConstraints]`, aliases (also from other modules of
 * the host package), `Literal[…]` and `StrEnum` / `IntEnum` classes → enum, nested `BaseModel` → object / object[],
 * `dict[str, T]` → map, constrained types (`PositiveInt`, `constr(...)` …) → constraints.
 *
 * What cannot be represented is either reported (`warnings`: validators, sub-field defaults, exclusive bounds …) or
 * refused (`unsupported`: bytes, UUID, non-Pydantic classes, nested unions): an import with `unsupported` fields fails.
 */
import { existsSync, readdirSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';
import type {
  FieldConstraints,
  FieldKind,
  NormalizedEnum,
  NormalizedField,
  NormalizedModel,
  NormalizedObjectSubField
} from '../../../shared/normalizedModel.js';
import { NORMALIZED_MODEL_VERSION } from '../../../shared/normalizedModel.js';
import { EMAIL_PATTERN } from '../../../shared/fieldConstraints.js';
import { pascalCase, pluralize } from '../../utils/namingUtils.js';
import { EXTRACT_SCRIPT } from './pythonScripts.js';
import { runPythonScript } from './pythonRunner.js';

// ---------------------------------------------------------------------------------------------------------------
// Extractor output (see EXTRACT_SCRIPT)
// ---------------------------------------------------------------------------------------------------------------

export interface PyValue {
  v?: unknown;
  expr?: string;
  ellipsis?: boolean;
}

export interface PyCall {
  k: 'call';
  func: string;
  args: PyValue[];
  kwargs: Record<string, PyValue>;
}

export type PyType =
  | { k: 'name'; id: string }
  | { k: 'none' }
  | { k: 'const'; v: PyValue }
  | { k: 'union'; items: PyType[] }
  | { k: 'lit'; values: PyValue[] }
  | { k: 'annotated'; type: PyType; meta: PyType[] }
  | { k: 'sub'; base: string; args: PyType[] }
  | PyCall
  | { k: 'other'; src: string };

export interface PyFieldDef {
  name: string;
  line: number;
  type: PyType;
  field?: PyCall;
  default?: PyValue;
}

export interface PyClassDef {
  name: string;
  line: number;
  bases: string[];
  doc?: string | null;
  config?: { kwargs?: Record<string, PyValue>; ref?: string; src?: string };
  fields: PyFieldDef[];
  members: Array<{ name: string; value: PyValue }>;
  validators: string[];
  methods: string[];
}

export interface PyModuleDef {
  classes: PyClassDef[];
  aliases: Record<string, PyType>;
  configs: Record<string, Record<string, PyValue>>;
  imports: Record<string, { module: string; name: string; level: number }>;
}

export class PydanticImportError extends Error {}

/** Static read of a Python module (`ast`); throws `PydanticImportError` on a syntax error or a missing interpreter. */
export function extractPythonModule(filePath: string, root?: string): PyModuleDef {
  const run = runPythonScript(EXTRACT_SCRIPT, [filePath], { root });
  if (!run.ok) {
    const last = run.stderr.trim().split('\n').slice(-1)[0] ?? '';
    throw new PydanticImportError(`${filePath}: Python modülü okunamadı (${last || 'bilinmeyen hata'})`);
  }
  return JSON.parse(run.stdout) as PyModuleDef;
}

// ---------------------------------------------------------------------------------------------------------------
// Scopes (module + imported host modules)
// ---------------------------------------------------------------------------------------------------------------

class ModuleScope {
  constructor(
    readonly file: string,
    readonly def: PyModuleDef,
    private readonly loader: ModuleLoader
  ) {}

  lookup(name: string, seen = new Set<string>()): Resolved | undefined {
    const key = `${this.file}:${name}`;
    if (seen.has(key)) return undefined;
    seen.add(key);
    const cls = this.def.classes.find((c) => c.name === name);
    if (cls) return { kind: 'class', cls, scope: this };
    const alias = this.def.aliases[name];
    if (alias) return { kind: 'alias', type: alias, scope: this };
    const imp = this.def.imports[name];
    if (imp) {
      const target = this.loader.load(imp.module, imp.level, this.file);
      return target?.lookup(imp.name, seen);
    }
    return undefined;
  }

  config(cls: PyClassDef): Record<string, PyValue> | undefined {
    if (cls.config?.kwargs) return cls.config.kwargs;
    if (cls.config?.ref) {
      if (this.def.configs[cls.config.ref]) return this.def.configs[cls.config.ref];
      const imp = this.def.imports[cls.config.ref];
      if (imp) return this.loader.load(imp.module, imp.level, this.file)?.def.configs[imp.name];
    }
    return undefined;
  }
}

type Resolved = { kind: 'class'; cls: PyClassDef; scope: ModuleScope } | { kind: 'alias'; type: PyType; scope: ModuleScope };

/** Loads modules of the host's `src/` tree (absolute `pkg.a.b` or relative imports); third-party modules stay unresolved. */
class ModuleLoader {
  private readonly cache = new Map<string, ModuleScope | null>();

  constructor(
    private readonly srcRoot: string | undefined,
    private readonly root?: string
  ) {}

  scopeOf(file: string): ModuleScope {
    const path = resolve(file);
    let scope = this.cache.get(path);
    if (!scope) {
      scope = new ModuleScope(path, extractPythonModule(path, this.root), this);
      this.cache.set(path, scope);
    }
    return scope;
  }

  load(module: string, level: number, fromFile: string): ModuleScope | undefined {
    let base: string | undefined;
    if (level > 0) {
      base = dirname(fromFile);
      for (let i = 1; i < level; i++) base = dirname(base);
    } else {
      base = this.srcRoot;
    }
    if (!base) return undefined;
    const parts = module ? module.split('.') : [];
    const stem = join(base, ...parts);
    const file = [`${stem}.py`, join(stem, '__init__.py')].find((p) => existsSync(p));
    if (!file) return undefined;
    const path = resolve(file);
    if (this.cache.has(path)) return this.cache.get(path) ?? undefined;
    try {
      return this.scopeOf(path);
    } catch {
      this.cache.set(path, null);
      return undefined;
    }
  }
}

/** `src/` above the file (host layout `src/<pkg>/…`). */
function srcRootOf(file: string): string | undefined {
  let dir = dirname(resolve(file));
  while (dir !== dirname(dir)) {
    if (dir.endsWith('/src') || dir.endsWith('\\src')) return dir;
    dir = dirname(dir);
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------------------------
// Type interpretation
// ---------------------------------------------------------------------------------------------------------------

const last = (id: string) => id.split('.').pop() ?? id;

/** Interpreted annotation. */
interface TypeInfo {
  kind: FieldKind;
  isArray: boolean;
  nullable: boolean;
  numberFormat?: 'int';
  dateFormat?: 'date';
  format?: 'email';
  constraints: FieldConstraints;
  trim?: boolean;
  enum?: NormalizedEnum;
  enumClass?: PyClassDef;
  object?: { cls: PyClassDef; scope: ModuleScope };
  mapValue?: FieldKind;
  /** Not representable: the import refuses the field. */
  unsupported?: string;
  notes: string[];
}

const base = (kind: FieldKind, extra: Partial<TypeInfo> = {}): TypeInfo => ({
  kind,
  isArray: false,
  nullable: false,
  constraints: {},
  notes: [],
  ...extra
});

const SCALARS: Record<string, () => TypeInfo> = {
  str: () => base('string'),
  StrictStr: () => base('string'),
  int: () => base('number', { numberFormat: 'int' }),
  StrictInt: () => base('number', { numberFormat: 'int' }),
  float: () => base('number'),
  StrictFloat: () => base('number'),
  bool: () => base('boolean'),
  StrictBool: () => base('boolean'),
  datetime: () => base('date'),
  AwareDatetime: () => base('date'),
  NaiveDatetime: () => base('date'),
  UtcDateTime: () => base('date'),
  date: () => base('date', { dateFormat: 'date' }),
  Decimal: () => base('decimal'),
  DecimalStr: () => base('decimal'),
  EmailStr: () => base('string', { format: 'email' }),
  PositiveInt: () => base('number', { numberFormat: 'int', constraints: { min: 1 } }),
  NonNegativeInt: () => base('number', { numberFormat: 'int', constraints: { min: 0 } }),
  NegativeInt: () => base('number', { numberFormat: 'int', constraints: { max: -1 } }),
  NonPositiveInt: () => base('number', { numberFormat: 'int', constraints: { max: 0 } }),
  NonNegativeFloat: () => base('number', { constraints: { min: 0 } }),
  NonPositiveFloat: () => base('number', { constraints: { max: 0 } }),
  PositiveFloat: () => base('number', { constraints: { min: 0 }, notes: ['PositiveFloat (> 0) → min 0 (dahil)'] }),
  NegativeFloat: () => base('number', { constraints: { max: 0 }, notes: ['NegativeFloat (< 0) → max 0 (dahil)'] }),
  ObjectId: () => base('reference'),
  PyObjectId: () => base('reference'),
  PydanticObjectId: () => base('reference'),
  RefId: () => base('reference'),
  AnyUrl: () => base('string', { notes: ['URL tipi → string (doğrulama taşınmaz)'] }),
  HttpUrl: () => base('string', { notes: ['URL tipi → string (doğrulama taşınmaz)'] }),
  Any: () => base('json'),
  object: () => base('json'),
  JsonValue: () => base('json'),
  dict: () => base('object'),
  Dict: () => base('object'),
  list: () => base('json', { isArray: false, notes: ['tipsiz list → json'] })
};

const UNSUPPORTED_NAMES = new Set(['bytes', 'bytearray', 'UUID', 'UUID4', 'UUID1', 'timedelta', 'time', 'Callable', 'Path', 'SecretStr', 'IPvAnyAddress']);
const LIST_BASES = new Set(['list', 'List', 'Sequence', 'MutableSequence', 'set', 'Set', 'frozenset', 'FrozenSet', 'Iterable', 'Collection']);
const MAP_BASES = new Set(['dict', 'Dict', 'Mapping', 'MutableMapping']);
const CON_FUNCS: Record<string, () => TypeInfo> = {
  constr: () => base('string'),
  conint: () => base('number', { numberFormat: 'int' }),
  confloat: () => base('number'),
  condecimal: () => base('decimal'),
  condate: () => base('date', { dateFormat: 'date' })
};

function isEnumClass(cls: PyClassDef): boolean {
  return cls.bases.some((b) => ['StrEnum', 'IntEnum', 'Enum', 'IntFlag'].includes(last(b)));
}

function isBaseModel(cls: PyClassDef, scope: ModuleScope, depth = 0): boolean {
  if (depth > 10) return false;
  return cls.bases.some((b) => {
    if (['BaseModel', 'RootModel'].includes(last(b))) return true;
    const r = scope.lookup(b);
    return r?.kind === 'class' && isBaseModel(r.cls, r.scope, depth + 1);
  });
}

function enumOf(cls: PyClassDef): { enum?: NormalizedEnum; note?: string } {
  const members = cls.members.filter((m) => !m.name.startsWith('_'));
  const numeric = cls.bases.some((b) => ['IntEnum', 'IntFlag', 'int'].includes(last(b)));
  if (members.some((m) => m.value.v === undefined)) return { note: `${cls.name}: değeri sabit olmayan üye (auto() vb.)` };
  if (numeric || members.every((m) => typeof m.value.v === 'number')) {
    if (!members.every((m) => Number.isInteger(m.value.v))) return { note: `${cls.name}: tam sayı olmayan enum değeri` };
    return { enum: { values: members.map((m) => m.name.toLowerCase()), numbers: members.map((m) => m.value.v as number) } };
  }
  if (!members.every((m) => typeof m.value.v === 'string')) return { note: `${cls.name}: karışık enum değerleri` };
  return { enum: { values: members.map((m) => m.value.v as string) } };
}

function num(v: PyValue | undefined): number | undefined {
  return typeof v?.v === 'number' ? v.v : undefined;
}

/** `Field(...)`, `StringConstraints(...)`, `constr(...)`, `annotated_types.Ge(…)` arguments → constraints. */
function applyConstraints(info: TypeInfo, call: PyCall, where: string): void {
  const kw = { ...call.kwargs };
  const fn = last(call.func);
  // annotated_types / pydantic metadata with one positional argument.
  const single: Record<string, string> = { Ge: 'ge', Le: 'le', Gt: 'gt', Lt: 'lt', MinLen: 'min_length', MaxLen: 'max_length' };
  if (single[fn] && call.args[0]) kw[single[fn]] = call.args[0];
  const isText = info.kind === 'string' && !info.isArray;
  const isNumber = (info.kind === 'number' || info.kind === 'decimal') && !info.isArray;
  const int = info.numberFormat === 'int';
  for (const [key, value] of Object.entries(kw)) {
    const n = num(value);
    switch (key) {
      case 'min_length':
      case 'max_length':
        if (isText && n !== undefined) info.constraints[key === 'min_length' ? 'minLength' : 'maxLength'] = n;
        else info.notes.push(`${where}: ${key} taşınmaz (yalnız metin alanında)`);
        break;
      case 'pattern':
      case 'regex':
        if (isText && typeof value.v === 'string') info.constraints.pattern = value.v;
        else info.notes.push(`${where}: ${key} taşınmaz`);
        break;
      case 'ge':
      case 'le':
        if (isNumber && n !== undefined) info.constraints[key === 'ge' ? 'min' : 'max'] = n;
        else info.notes.push(`${where}: ${key} taşınmaz`);
        break;
      case 'gt':
      case 'lt':
        if (isNumber && n !== undefined) {
          const bound = int ? (key === 'gt' ? n + 1 : n - 1) : n;
          info.constraints[key === 'gt' ? 'min' : 'max'] = bound;
          if (!int) info.notes.push(`${where}: ${key}=${n} → ${key === 'gt' ? 'min' : 'max'} ${n} (dahil)`);
        } else info.notes.push(`${where}: ${key} taşınmaz`);
        break;
      case 'strip_whitespace':
        if (value.v === true) info.trim = true;
        break;
      case 'to_upper':
      case 'to_lower':
      case 'max_digits':
      case 'decimal_places':
      case 'multiple_of':
      case 'allow_inf_nan':
      case 'strict':
        info.notes.push(`${where}: ${key} taşınmaz`);
        break;
      default:
        break;
    }
  }
}

function interpret(t: PyType, scope: ModuleScope, where: string, depth = 0): TypeInfo {
  if (depth > 20) return base('unknown', { unsupported: 'çok derin tip' });
  switch (t.k) {
    case 'none':
      return base('json', { nullable: true });
    case 'union': {
      const nones = t.items.filter((i) => i.k === 'none' || (i.k === 'name' && last(i.id) === 'None'));
      const rest = t.items.filter((i) => !nones.includes(i));
      if (rest.length === 1) {
        const info = interpret(rest[0], scope, where, depth + 1);
        info.nullable = info.nullable || nones.length > 0;
        return info;
      }
      if (rest.every((i) => i.k === 'lit')) {
        const merged: PyType = { k: 'lit', values: rest.flatMap((i) => (i.k === 'lit' ? i.values : [])) };
        const info = interpret(merged, scope, where, depth + 1);
        info.nullable = nones.length > 0;
        return info;
      }
      return base('json', { nullable: nones.length > 0, notes: [`${where}: birleşik tip → json`] });
    }
    case 'annotated': {
      const info = interpret(t.type, scope, where, depth + 1);
      for (const m of t.meta) if (m.k === 'call') applyConstraints(info, m, where);
      return info;
    }
    case 'lit': {
      const values = t.values.map((v) => v.v);
      if (values.every((v) => typeof v === 'string')) return base('enum', { enum: { values: values as string[] } });
      if (values.every((v) => Number.isInteger(v))) {
        return base('enum', { enum: { values: values.map(String), numbers: values as number[] } });
      }
      if (values.every((v) => typeof v === 'boolean')) return base('boolean');
      return base('unknown', { unsupported: 'karışık Literal' });
    }
    case 'call': {
      const make = CON_FUNCS[last(t.func)];
      if (!make) return base('unknown', { unsupported: `tip ifadesi ${t.func}(...)` });
      const info = make();
      applyConstraints(info, t, where);
      return info;
    }
    case 'sub': {
      const b = last(t.base);
      if (b === 'Optional') {
        const info = interpret(t.args[0], scope, where, depth + 1);
        info.nullable = true;
        return info;
      }
      if (b === 'Union') return interpret({ k: 'union', items: t.args }, scope, where, depth + 1);
      if (b === 'Annotated') return interpret({ k: 'annotated', type: t.args[0], meta: t.args.slice(1) }, scope, where, depth + 1);
      if (LIST_BASES.has(b)) {
        const item = interpret(t.args[0], scope, where, depth + 1);
        if (item.isArray || item.kind === 'json') return base('json', { notes: [`${where}: iç içe / tipsiz dizi → json`] });
        if (item.unsupported) return item;
        if (item.nullable) item.notes.push(`${where}: dizi elemanında None taşınmaz`);
        if (['set', 'Set', 'frozenset', 'FrozenSet'].includes(b)) item.notes.push(`${where}: ${b} → list`);
        return { ...item, isArray: true, nullable: false };
      }
      if (MAP_BASES.has(b)) {
        const value = t.args[1] ? interpret(t.args[1], scope, where, depth + 1) : base('json');
        if (!value.isArray && ['string', 'number', 'boolean'].includes(value.kind) && !value.enum) {
          return base('map', { mapValue: value.kind });
        }
        return base('object', value.kind === 'json' ? {} : { notes: [`${where}: dict değer tipi (${value.kind}) → opak obje`] });
      }
      if (b === 'tuple' || b === 'Tuple') return base('json', { notes: [`${where}: tuple → json`] });
      return base('unknown', { unsupported: `${t.base}[...]` });
    }
    case 'name': {
      const r = scope.lookup(t.id);
      if (r?.kind === 'alias') return interpret(r.type, r.scope, where, depth + 1);
      if (r?.kind === 'class') {
        if (isEnumClass(r.cls)) {
          const { enum: e, note } = enumOf(r.cls);
          return e ? base('enum', { enum: e, enumClass: r.cls }) : base('unknown', { unsupported: note });
        }
        if (isBaseModel(r.cls, r.scope)) return base('object', { object: { cls: r.cls, scope: r.scope } });
        return base('unknown', { unsupported: `${r.cls.name} Pydantic modeli değil` });
      }
      const name = last(t.id);
      if (name === 'None') return base('json', { nullable: true });
      if (UNSUPPORTED_NAMES.has(name)) return base('unknown', { unsupported: name });
      const make = SCALARS[name];
      if (!make) return base('unknown', { unsupported: `bilinmeyen tip ${t.id}` });
      const info = make();
      info.notes = info.notes.map((n) => `${where}: ${n}`);
      return info;
    }
    default:
      return base('unknown', { unsupported: `tip ${t.k === 'const' ? JSON.stringify(t.v.v) : (t as { src?: string }).src ?? t.k}` });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------------------------------------------

interface DefaultInfo {
  has: boolean;
  /** Default `None`. */
  none: boolean;
  value?: string | number | boolean;
  factory?: string;
  /** Default given but not representable (expression). */
  expr?: string;
}

function defaultOf(f: PyFieldDef, info: TypeInfo): DefaultInfo {
  let value: PyValue | undefined = f.default;
  let factory: string | undefined;
  if (f.field) {
    value = f.field.kwargs.default ?? f.field.args[0];
    const fac = f.field.kwargs.default_factory;
    if (fac) factory = fac.expr ?? String(fac.v);
  }
  if (factory) return { has: true, none: false, factory };
  if (!value || value.ellipsis) return { has: false, none: false };
  if (value.v === null) return { has: true, none: true };
  if (value.v !== undefined) {
    const v = value.v;
    if (Array.isArray(v) || (typeof v === 'object' && v !== null)) return { has: true, none: false, factory: JSON.stringify(v) };
    if (info.kind === 'decimal' && typeof v === 'number') return { has: true, none: false, value: v };
    return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? { has: true, none: false, value: v } : { has: true, none: false, expr: String(v) };
  }
  const expr = value.expr ?? '';
  const member = /^(?:[\w.]+\.)?(\w+)\.(\w+)$/.exec(expr);
  if (info.enumClass && member && member[1] === info.enumClass.name) {
    const m = info.enumClass.members.find((x) => x.name === member[2]);
    if (m && info.enum) {
      const i = info.enumClass.members.filter((x) => !x.name.startsWith('_')).indexOf(m);
      return { has: true, none: false, value: info.enum.numbers?.[i] ?? info.enum.values[i] };
    }
  }
  const dec = /^Decimal\(\s*['"]([-+]?\d+(?:\.\d+)?)['"]\s*\)$/.exec(expr);
  if (dec) return { has: true, none: false, value: dec[1] };
  return { has: true, none: false, expr };
}

function fieldNotes(f: PyFieldDef, where: string, notes: string[]): void {
  const kw = f.field?.kwargs ?? {};
  for (const key of ['alias', 'validation_alias', 'serialization_alias']) {
    if (kw[key]) notes.push(`${where}: ${key}=${JSON.stringify(kw[key].v ?? kw[key].expr)} taşınmaz (Mongo anahtarı alan adı olur)`);
  }
  if (kw.exclude?.v === true) notes.push(`${where}: exclude=True → editörde access.hidden düşünülmeli`);
  if (kw.frozen?.v === true) notes.push(`${where}: frozen=True → editörde access.readonly düşünülmeli`);
}

function subField(f: PyFieldDef, scope: ModuleScope, where: string, notes: string[], unsupported: string[]): NormalizedObjectSubField | null {
  const info = interpret(f.type, scope, where);
  if (f.field) applyConstraints(info, f.field, where);
  notes.push(...info.notes);
  fieldNotes(f, where, notes);
  if (info.unsupported) {
    unsupported.push(`${where}: ${info.unsupported}`);
    return null;
  }
  const def = defaultOf(f, info);
  let kind: FieldKind = info.kind;
  const sub: NormalizedObjectSubField = { name: f.name, kind, required: true };
  if (info.isArray) {
    kind = 'json';
    notes.push(`${where}: alt alanda dizi → json (alt alan dizisi modellenmiyor)`);
  } else if (info.kind === 'enum') {
    kind = 'string';
    notes.push(`${where}: alt alanda enum değerleri taşınmaz → string`);
  } else if (info.kind === 'object' && info.object) {
    notes.push(`${where}: iç içe obje (${info.object.cls.name}) → düz JSON obje`);
  } else if (info.kind === 'map' && info.mapValue && info.mapValue !== 'string') {
    sub.native = { type: `map<${info.mapValue}>` };
  }
  if (info.dateFormat === 'date' && !info.isArray) notes.push(`${where}: alt alanda sadece tarih → tarih-saat`);
  if (Object.keys(info.constraints).length) notes.push(`${where}: alt alan kısıtları taşınmaz`);
  sub.kind = kind;
  if (kind === 'number' && info.numberFormat === 'int') sub.numberFormat = 'int';
  if (info.trim) sub.trim = true;
  if (info.nullable) {
    sub.required = false;
    sub.nullable = true;
  } else if (def.has) {
    // Sub-fields carry no default: a missing key must still read, so the sub-field becomes optional.
    sub.required = false;
    if (!def.factory) notes.push(`${where}: alt alan varsayılanı (${def.value ?? def.expr}) taşınmaz → opsiyonel`);
  }
  return sub;
}

function inheritedFields(cls: PyClassDef, scope: ModuleScope, depth = 0): Array<{ f: PyFieldDef; scope: ModuleScope; owner: PyClassDef }> {
  if (depth > 10) return [];
  const out: Array<{ f: PyFieldDef; scope: ModuleScope; owner: PyClassDef }> = [];
  for (const b of cls.bases) {
    const r = scope.lookup(b);
    if (r?.kind === 'class' && isBaseModel(r.cls, r.scope)) out.push(...inheritedFields(r.cls, r.scope, depth + 1));
  }
  for (const f of cls.fields) {
    const i = out.findIndex((x) => x.f.name === f.name);
    if (i >= 0) out.splice(i, 1);
    out.push({ f, scope, owner: cls });
  }
  return out;
}

function classNotes(cls: PyClassDef, scope: ModuleScope, notes: string[]): void {
  const extra = scope.config(cls)?.extra?.v;
  if (extra !== undefined && extra !== 'forbid') notes.push(`${cls.name}: extra="${String(extra)}" → üretilen sınıf extra="forbid"`);
  if (cls.validators.length) notes.push(`${cls.name}: doğrulayıcılar taşınmaz (${cls.validators.join(', ')}); kural gerekiyorsa hooks.py`);
  const methods = cls.methods.filter((m) => !m.startsWith('__'));
  if (methods.length) notes.push(`${cls.name}: metotlar taşınmaz (${methods.join(', ')})`);
}

// ---------------------------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------------------------

export interface PydanticImportResult {
  model: NormalizedModel;
  className: string;
  /** Pydantic classes of the module (the document class can be chosen among them). */
  candidates: string[];
  /** What is carried over approximately or not at all (validators, sub-field defaults, exclusive bounds, …). */
  warnings: string[];
  /** Editor hints (e.g. `userId: str` may be a reference). */
  suggestions: string[];
  /** Fields that cannot be represented; an import with any of them fails. */
  unsupported: string[];
}

const BASE = new Set(['id', '_id']);
const TIMESTAMPS = ['createdAt', 'updatedAt'];

/** Pydantic (BaseModel) classes of a module file, in file order. */
export function listPydanticClasses(filePath: string, root?: string): string[] {
  const loader = new ModuleLoader(srcRootOf(filePath), root);
  const scope = loader.scopeOf(filePath);
  return scope.def.classes.filter((c) => isBaseModel(c, scope)).map((c) => c.name);
}

/**
 * Reads the document class of a Pydantic module into a NormalizedModel.
 * @param options.className the document class; default: the class named like the entity (`entityName`), else the only
 *   Pydantic class of the module.
 * @param options.entityName K21 entity name (plural PascalCase); default: the module folder in PascalCase.
 */
export function parsePydanticModel(
  filePath: string,
  options: { className?: string; entityName?: string; root?: string } = {}
): PydanticImportResult {
  const loader = new ModuleLoader(srcRootOf(filePath), options.root);
  const scope = loader.scopeOf(filePath);
  const candidates = scope.def.classes.filter((c) => isBaseModel(c, scope)).map((c) => c.name);
  const entityName = options.entityName ?? snakeToPascal(dirnameBase(filePath));
  const className = options.className ?? (candidates.includes(entityName) ? entityName : candidates.length === 1 ? candidates[0] : undefined);
  if (!className) {
    throw new PydanticImportError(
      candidates.length
        ? `Doküman sınıfı seçilmeli: ${entityName} adında sınıf yok (sınıflar: ${candidates.join(', ')}).`
        : `${filePath}: Pydantic (BaseModel) sınıfı yok.`
    );
  }
  const cls = scope.def.classes.find((c) => c.name === className);
  if (!cls || !candidates.includes(className)) throw new PydanticImportError(`${className}: modülde Pydantic sınıfı değil.`);

  const warnings: string[] = [];
  const suggestions: string[] = [];
  const unsupported: string[] = [];
  classNotes(cls, scope, warnings);

  const fields: NormalizedField[] = [];
  const present = new Set<string>();
  const objectClasses = new Set<string>();
  for (const { f, scope: fScope } of inheritedFields(cls, scope)) {
    const where = `${className}.${f.name}`;
    if (BASE.has(f.name)) continue;
    if (TIMESTAMPS.includes(f.name)) {
      present.add(f.name);
      continue;
    }
    const info = interpret(f.type, fScope, where);
    if (f.field) applyConstraints(info, f.field, where);
    warnings.push(...info.notes);
    fieldNotes(f, where, warnings);
    if (info.unsupported) {
      unsupported.push(`${where}: ${info.unsupported}`);
      continue;
    }
    const def = defaultOf(f, info);
    const field: NormalizedField = { name: f.name, kind: info.kind, isArray: info.isArray, required: !def.has };
    if (!def.has && info.nullable) field.nullable = true;
    if (info.numberFormat && info.kind === 'number') field.numberFormat = 'int';
    if (info.dateFormat) field.dateFormat = 'date';
    if (info.kind === 'string' && info.constraints.pattern === EMAIL_PATTERN) {
      // The generator writes `format: email` as this pattern (`Field(pattern=…)`); read it back as the format.
      delete info.constraints.pattern;
      info.format = 'email';
    }
    if (info.format) field.format = 'email';
    if (info.trim) field.trim = true;
    if (Object.keys(info.constraints).length) field.constraints = { ...info.constraints };
    if (info.enum) field.enum = info.enum;
    if (info.kind === 'map' && info.mapValue && info.mapValue !== 'string') field.native = { type: `map<${info.mapValue}>` };
    if (def.value !== undefined && !info.isArray) field.default = def.value;
    if (def.expr) warnings.push(`${where}: varsayılan ifade (${def.expr}) taşınmaz`);
    if (def.factory && !info.isArray && !['list', 'dict', '[]', '{}'].includes(def.factory)) {
      warnings.push(`${where}: default_factory=${def.factory} taşınmaz`);
    }
    if (info.object) {
      const sub = info.object;
      classNotes(sub.cls, sub.scope, warnings);
      objectClasses.add(sub.cls.name);
      const subs = inheritedFields(sub.cls, sub.scope)
        .map(({ f: sf, scope: sScope }) => subField(sf, sScope, `${sub.cls.name}.${sf.name}`, warnings, unsupported))
        .filter((s): s is NormalizedObjectSubField => s !== null);
      field.object = { typeName: sub.cls.name, fields: subs };
    }
    if (info.kind === 'string' && /Ids?$/.test(f.name) && f.name.length > 3) {
      const stem = f.name.replace(/Ids?$/, '');
      suggestions.push(`${f.name}: ObjectId hex tutuyorsa editörde reference yapılabilir (hedef: ${pluralize(pascalCase(stem))}?)`);
    }
    fields.push(field);
  }

  for (const ts of TIMESTAMPS) {
    if (!present.has(ts)) {
      warnings.push(`${className}: ${ts} sınıfta yok; üretilen satır ister, CRUD yazar (eski dokümanlarda eksikse okuma 500, rapora bakın)`);
    }
    fields.push({ name: ts, kind: 'date', isArray: false, required: false, access: { readonly: true, hiddenFromCreate: true, hiddenFromUpdate: true } });
  }

  return {
    model: {
      schemaVersion: NORMALIZED_MODEL_VERSION,
      entityName,
      fields,
      timestamps: { createdAt: true, updatedAt: true },
      api: { normalOperations: [], admin: true }
    },
    className,
    candidates,
    warnings: [...new Set(warnings)],
    suggestions,
    unsupported
  };
}

/** `ip_blacklist` → `IpBlacklist`, `user_id` → `User`. */
function snakeToPascal(name: string): string {
  return name
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

function dirnameBase(filePath: string): string {
  return dirname(resolve(filePath)).split(/[\\/]/).pop() ?? '';
}

/** Hand-written model modules of a host (`src/<pkg>/modules/<m>/model.py` with a Pydantic class). */
export function listPythonModelModules(packageDir: string): Array<{ folder: string; path: string }> {
  const modules = join(packageDir, 'modules');
  if (!existsSync(modules)) return [];
  const out: Array<{ folder: string; path: string }> = [];
  for (const folder of readdirSync(modules).sort()) {
    const path = join(modules, folder, 'model.py');
    if (folder.startsWith('_') || !statSync(join(modules, folder)).isDirectory() || !existsSync(path)) continue;
    out.push({ folder, path });
  }
  return out;
}
