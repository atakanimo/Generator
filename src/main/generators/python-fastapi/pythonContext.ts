/**
 * NormalizedModel → Python + FastAPI template context (plan backend-python-fastapi §2, §5 PY5 / PY6).
 * Every decision lives here; templates only print the prepared lines. Behaviour follows the .NET generator
 * (`dotnetContext.ts`): same filters, sort keys, unique checks, create defaults, relation checks, populate shapes.
 *
 * PY5: string / number (`numberFormat`) / boolean / date (`dateFormat`) / enum (StrEnum, IntEnum) / arrays,
 * `required` / `nullable` / `default` / `unique`, `constraints`, `format: email`, embedded objects with typed sub-fields.
 * PY6: `reference` (one / many; filter, relation check, populate on reads), `decimal` (JSON string, Mongo `Decimal128`),
 * `map` / `json` / opaque objects (plain JSON), sub-field `reference` / `decimal` / nested object, `access` flags.
 *
 * Contexts are built for the host's whole module list at once: a reference is checked and populated only when its
 * target is in the list (as in .NET).
 */
import type { FilterType, NormalizedField, NormalizedModel, NormalizedObjectSubField } from '../../../shared/normalizedModel.js';
import { resolveAdminOperations, updateNullClears, type NormalOperation } from '../../../shared/normalizedModel.js';
import { constraintsForField, EMAIL_PATTERN, isNumericEnum } from '../../../shared/fieldConstraints.js';
import { kebabCase, pascalCase, singularize } from '../../utils/namingUtils.js';
import { PYTHON_KEYWORDS } from './pythonLayout.js';
import { PY_LINE_LENGTH, PyImports, pyCall, pyClass, pyDef, pyNumber, pyStr, pySubscript } from './pythonFormat.js';
import { PythonTestContext, buildPythonTestContext } from './pythonTestContext.js';

/** Provided by the CRUD base (`_id`, timestamps); never emitted as model fields. */
const BASE_FIELDS = new Set(['id', '_id', 'createdAt', 'updatedAt']);

export class PythonUnsupportedError extends Error {}

/** Soft keywords (`type`, `match`, `case`) are valid attribute names; only hard keywords are rejected for fields. */
const SOFT_KEYWORDS = new Set(['match', 'case', 'type']);

type Category = 'scalar' | 'scalarArray' | 'enumArray' | 'object' | 'objectArray' | 'json' | 'ref' | 'refArray';
/** Storage conversion of a body value: enum → its value, object → dict, `date` → UTC midnight datetime. */
type Conv = 'str' | 'int' | 'dump' | 'day' | undefined;

interface PyEnum {
  name: string;
  numeric: boolean;
  members: Array<{ name: string; value: string; number?: number }>;
}

/** Names an object class / ref class needs from `core.crud` / `pydantic`. */
interface Uses {
  utc: boolean;
  decimal: boolean;
  ref: boolean;
  json: boolean;
}

interface PyObjectType {
  name: string;
  lines: string[];
  uses: Uses;
}

interface TargetInfo {
  model: NormalizedModel;
  names: PythonModuleNames;
}

interface PyField {
  source: NormalizedField;
  name: string;
  category: Category;
  /** Element type (doc model / bodies): `str`, `int`, `float`, `bool`, `datetime`, `date`, enum or object class. */
  type: string;
  /** Row element type (`UtcDateTime` for datetimes). */
  rowType: string;
  requiredStrict: boolean;
  defaultLiteral?: string;
  enumDef?: PyEnum;
  objectName?: string;
  conv: Conv;
  /** `access`: hidden (no response, filter, sort, populate), in the create / update body (readonly, hiddenFrom*). */
  hidden: boolean;
  inCreate: boolean;
  inUpdate: boolean;
  /** `reference`: target module (when generated in this host) and the populated target fields. */
  target?: TargetInfo;
  populate?: string[];
}

export interface PythonModuleNames {
  /** Entity (K21: plural PascalCase as given), e.g. `SubscriptionPlans`. */
  entity: string;
  /** `modules/<folder>/` = collection (snake_case). */
  folder: string;
  collection: string;
  /** Admin route segment (kebab-case). */
  route: string;
  /** Singular snake name for router functions (`get_subscription_plan`). */
  singular: string;
}

export interface PythonModuleContext extends PythonModuleNames {
  pkg: string;
  hasAdmin: boolean;
  /** `DETAIL_ONLY` tuple of the module test (`access.detailOnly` fields: `None` in list rows). */
  detailOnlyTuple: string;
  /** Admin router endpoints (`api.adminOperations`; `list` always). */
  adminOps: Record<NormalOperation, boolean> & { all: boolean };
  model: {
    imports: string;
    enums: Array<{ name: string; base: string; members: string[] }>;
    objects: PyObjectType[];
    docLines: string[];
  };
  schemas: {
    imports: string;
    preamble: string;
    refClasses: Array<{ name: string; lines: string[] }>;
    rowLines: string[];
    createLines: string[];
    updateLines: string[];
    filterLines: string[];
  };
  repository: { indexLines: string[] };
  service: {
    imports: string;
    typeCheckingImports: string;
    preamble: string;
    hooksClass: string;
    serviceClass: string;
    filterEntries: string[];
    sortEntries: string[];
    uniqueLine?: string;
    hiddenLine?: string;
    detailOnlyLine?: string;
    relationBlock: string[];
    populateBlock: string[];
    mapCreateDef: string;
    mapCreateDict: string[];
    mapCreateAfter: string[];
    mapUpdateDef?: string;
    mapUpdateLines: string[];
  };
  router: {
    imports: string;
    listDecorator: string;
    listDef: string;
    getDecorator: string;
    getDef: string;
    createDecorator: string;
    createDef: string;
    updateDecorator: string;
    updateDef: string;
    deleteDecorator: string;
    deleteDef: string;
  };
  k: {
    modelImport: string;
    modelExports: string[];
    repositoryImport: string;
    hooksImport: string;
    serviceImports: string;
  };
  /** Module test (K, `tests/modules/<folder>/test_admin_crud.py`; PY8). */
  test: PythonTestContext;
}

/**
 * `key: value,` dict entry at `indent`, split like `ruff format` when too long: a call puts its args on their own line,
 * a conditional expression goes over three lines (`x` / `if c` / `else y`).
 */
function dictEntry(key: string, expr: string, indent: string): string {
  const line = `${key}: ${expr},`;
  if (indent.length + line.length <= PY_LINE_LENGTH) return line;
  const call = /^([\w.]+)\(/.exec(expr);
  if (call && closingParen(expr, call[0].length - 1) === expr.length - 1) {
    return `${key}: ${call[1]}(\n${indent}    ${expr.slice(call[0].length, -1)}\n${indent}),`;
  }
  const ifAt = expr.indexOf(' if ');
  const elseAt = expr.lastIndexOf(' else ');
  if (ifAt > 0 && elseAt > ifAt) {
    return `${key}: ${expr.slice(0, ifAt)}\n${indent}${expr.slice(ifAt + 1, elseAt)}\n${indent}${expr.slice(elseAt + 1)},`;
  }
  return line;
}

/** Index of the `)` closing the `(` at `open` (brackets of any kind counted). */
function closingParen(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if ('([{'.includes(text[i])) depth++;
    else if (')]}'.includes(text[i]) && --depth === 0) return i;
  }
  return -1;
}

/** Class field line (4-space indent) too long for one line: the default goes in parentheses, as `ruff format` does. */
function classFieldLine(line: string): string {
  if (4 + line.length <= PY_LINE_LENGTH || line.includes('\n')) return line;
  const m = /^(\w+: .+?) = (.+)$/.exec(line);
  return m ? `${m[1]} = (\n        ${m[2]}\n    )` : line;
}

function snake(name: string): string {
  return kebabCase(name).replace(/-/g, '_');
}

export function pythonModuleNames(entityName: string): PythonModuleNames {
  const entity = pascalCase(entityName.trim());
  const folder = snake(entity);
  return { entity, folder, collection: folder, route: kebabCase(entity), singular: snake(singularize(entity)) };
}

function checkName(where: string, name: string): void {
  const keyword = PYTHON_KEYWORDS.has(name.toLowerCase()) && !SOFT_KEYWORDS.has(name);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || keyword || name.startsWith('model_')) {
    throw new PythonUnsupportedError(`${where}: "${name}" Python alan adı olarak kullanılamaz.`);
  }
}

function enumMemberName(value: string, used: Set<string>): string {
  let name = value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .join('_')
    .toUpperCase();
  if (!name) name = 'VALUE';
  if (/^[0-9]/.test(name)) name = `V_${name}`;
  let out = name;
  for (let i = 2; used.has(out); i++) out = `${name}_${i}`;
  used.add(out);
  return out;
}

function objectClassName(entity: string, field: NormalizedField): string {
  const fromType = field.object?.typeName?.replace(/^I(?=[A-Z])/, '');
  const fromSchema = field.object?.schemaName?.replace(/Schema$/, '');
  const name = fromType || fromSchema || `${entity}${pascalCase(field.name)}`;
  return field.isArray ? singularize(name) : name;
}

/** `Field(...)` arguments of a field's limits (model) and `StringConstraints` / `Field` arguments (bodies). */
function limitArgs(field: NormalizedField): { text: string[]; number: string[]; pattern?: string; emailCheck: boolean } {
  const c = constraintsForField(field, field.constraints);
  const text: string[] = [];
  const number: string[] = [];
  if (c?.minLength != null) text.push(`min_length=${c.minLength}`);
  if (c?.maxLength != null) text.push(`max_length=${c.maxLength}`);
  const email = field.kind === 'string' && !field.isArray && field.format === 'email';
  const pattern = c?.pattern ?? (email ? EMAIL_PATTERN : undefined);
  if (c?.min != null) number.push(`ge=${pyNumber(c.min)}`);
  if (c?.max != null) number.push(`le=${pyNumber(c.max)}`);
  return { text, number, pattern, emailCheck: email && c?.pattern !== undefined };
}

/** `map` value type from the parser's native type (`map<boolean>`), as .NET `mapValueType`; default string. */
function mapValueType(native: string | undefined): string {
  if (/number/i.test(native ?? '')) return 'float';
  if (/boolean/i.test(native ?? '')) return 'bool';
  return 'str';
}

const noUses = (): Uses => ({ utc: false, decimal: false, ref: false, json: false });

function subFieldLine(where: string, sub: NormalizedObjectSubField, uses: Uses): string {
  checkName(where, sub.name);
  let type: string;
  switch (sub.kind) {
    case 'string':
    case 'enum':
      type = 'str';
      break;
    case 'number':
      type = sub.numberFormat === 'int' ? 'int' : 'float';
      break;
    case 'decimal':
      type = 'DecimalStr';
      uses.decimal = true;
      break;
    case 'boolean':
      type = 'bool';
      break;
    case 'date':
      type = 'UtcDateTime';
      uses.utc = true;
      break;
    case 'reference':
      // Stored as ObjectId inside the embedded document; no existence check (as .NET / Express sub-documents).
      type = 'RefId';
      uses.ref = true;
      break;
    case 'object':
      // Nested object inside an object: plain JSON (sub-fields carry no sub-fields of their own).
      type = 'dict[str, JsonValue]';
      uses.json = true;
      break;
    case 'json':
      type = 'JsonValue';
      uses.json = true;
      break;
    case 'map':
      type = `dict[str, ${mapValueType(sub.native?.type)}]`;
      break;
    default:
      throw new PythonUnsupportedError(`${where}.${sub.name}: alt alan türü ${sub.kind} Python üreticisinde desteklenmiyor.`);
  }
  return sub.required && sub.nullable !== true ? `${sub.name}: ${type}` : `${sub.name}: ${type} | None = None`;
}

function defaultLiteral(field: NormalizedField, enumDef: PyEnum | undefined, type: string): string | undefined {
  const value = field.default;
  if (value === undefined || value === null || field.isArray) return undefined;
  switch (field.kind) {
    case 'string':
      return typeof value === 'string' ? pyStr(value) : undefined;
    case 'number':
      if (typeof value !== 'number') return undefined;
      return type === 'int' && !Number.isInteger(value) ? undefined : pyNumber(value);
    case 'decimal':
      // Same literals .NET accepts (`149.90m`); kept as a string so the scale survives (`Decimal("0.50")`).
      return typeof value === 'number' || (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) ? `Decimal(${pyStr(String(value))})` : undefined;
    case 'boolean':
      return typeof value === 'boolean' ? (value ? 'True' : 'False') : undefined;
    case 'enum': {
      const member = enumDef?.members.find((m) => m.value === String(value) || (m.number !== undefined && m.number === Number(value)));
      return member ? `${enumDef!.name}.${member.name}` : undefined;
    }
    default:
      return undefined;
  }
}

interface ModelInfo {
  model: NormalizedModel;
  names: PythonModuleNames;
  enums: PyEnum[];
  objects: PyObjectType[];
  fields: PyField[];
}

/** Fields the backend populates (Express rule: `populate`, else `display`); only when the target is generated here. */
function populateKeys(field: NormalizedField, target: TargetInfo | undefined): string[] | undefined {
  const ref = field.reference;
  if (!target || ref?.include !== true) return undefined;
  const keys = ref.populate?.length ? ref.populate : ref.display ? [ref.display] : [];
  return keys.length ? keys : undefined;
}

function describeFields(model: NormalizedModel, names: PythonModuleNames, targets: Map<string, TargetInfo>): ModelInfo {
  const { entity } = names;
  const enums: PyEnum[] = [];
  const objects = new Map<string, PyObjectType>();
  const fields: PyField[] = [];

  for (const field of model.fields) {
    if (BASE_FIELDS.has(field.name)) continue;
    const where = `${model.entityName}.${field.name}`;
    checkName(where, field.name);
    const access = field.access ?? {};
    const requiredStrict = field.required === true && field.nullable !== true;
    // `adminOnly` only splits the normal API's bodies (contract §5); Python has the admin API only, where it is writable.
    const base = {
      source: field,
      name: field.name,
      requiredStrict,
      hidden: access.hidden === true,
      inCreate: access.readonly !== true && access.computed !== true && access.hiddenFromCreate !== true,
      inUpdate: access.readonly !== true && access.computed !== true && access.hiddenFromUpdate !== true
    };

    if (field.kind === 'reference') {
      const target = field.reference?.target ? targets.get(field.reference.target) : undefined;
      const category: Category = field.isArray ? 'refArray' : 'ref';
      fields.push({ ...base, category, type: 'RefId', rowType: 'str', conv: undefined, target, populate: populateKeys(field, target) });
      continue;
    }
    if (field.kind === 'json' || field.kind === 'map' || (field.kind === 'object' && !field.object?.fields?.length)) {
      // Plain JSON (contract §4): `json` any value, opaque object a JSON object, `map` string keys → native value type.
      const type = field.kind === 'json' ? 'JsonValue' : field.kind === 'map' ? `dict[str, ${mapValueType(field.native?.type)}]` : 'dict[str, JsonValue]';
      fields.push({ ...base, category: 'json', type, rowType: type, conv: undefined });
      continue;
    }
    if (field.kind === 'object') {
      const name = objectClassName(entity, field);
      if (!objects.has(name)) {
        const uses = noUses();
        const lines = field.object!.fields!.map((sub) => subFieldLine(where, sub, uses));
        objects.set(name, { name, lines, uses });
      }
      fields.push({ ...base, category: field.isArray ? 'objectArray' : 'object', type: name, rowType: name, objectName: name, conv: 'dump' });
      continue;
    }

    let type: string;
    let enumDef: PyEnum | undefined;
    switch (field.kind) {
      case 'string':
        type = 'str';
        break;
      case 'number':
        type = field.numberFormat === 'int' ? 'int' : 'float';
        break;
      case 'decimal':
        // JSON string ↔ `Decimal`; `CrudService` writes `Decimal128` (`to_storage`), so no per-field conversion.
        type = 'DecimalStr';
        break;
      case 'boolean':
        type = 'bool';
        break;
      case 'date':
        type = field.dateFormat === 'date' ? 'date' : 'datetime';
        break;
      case 'enum': {
        const values = field.enum?.values ?? [];
        if (!values.length) throw new PythonUnsupportedError(`${where}: enum değeri yok.`);
        const numbers = isNumericEnum(field.enum) ? field.enum.numbers : undefined;
        const used = new Set<string>();
        const prop = pascalCase(field.name);
        enumDef = {
          name: `${entity}${field.isArray ? singularize(prop) : prop}`,
          numeric: numbers !== undefined,
          members: values.map((value, i) => ({ name: enumMemberName(value, used), value, number: numbers?.[i] }))
        };
        enums.push(enumDef);
        type = enumDef.name;
        break;
      }
      default:
        throw new PythonUnsupportedError(`${where}: ${field.kind} Python üreticisinde desteklenmiyor.`);
    }
    const conv: Conv = enumDef ? (enumDef.numeric ? 'int' : 'str') : type === 'date' ? 'day' : undefined;
    fields.push({
      ...base,
      category: field.isArray ? (enumDef ? 'enumArray' : 'scalarArray') : 'scalar',
      type,
      rowType: type === 'datetime' ? 'UtcDateTime' : type,
      defaultLiteral: defaultLiteral(field, enumDef, type),
      enumDef,
      conv
    });
  }
  return { model, names, enums, objects: [...objects.values()], fields };
}

/** Value `map_create` writes for a field the create body does not carry (readonly / hiddenFromCreate), as .NET's entity defaults. */
function createOnlyValue(f: PyField): string | undefined {
  if (f.defaultLiteral !== undefined) return f.defaultLiteral;
  if (isArray(f)) return '[]';
  if (!f.requiredStrict || f.category !== 'scalar') return undefined;
  return ({ str: '""', int: '0', float: '0.0', bool: 'False' } as Record<string, string>)[f.type];
}

/** Ref class (`{ id, ...populate }`) field: the target field's wire type; every field optional (target may lack it). */
function refClassLine(key: string, target: ModelInfo, uses: Uses & { day: boolean; any: boolean }): string | undefined {
  if (key === 'createdAt' || key === 'updatedAt') {
    uses.utc = true;
    return `${key}: UtcDateTime | None = None`;
  }
  const tf = target.fields.find((x) => x.name === key);
  // Same fields .NET keeps: hidden ones never leave the API, m-n lists of the target are not nested.
  if (!tf || tf.hidden || tf.category === 'refArray') return undefined;
  let type: string;
  switch (tf.category) {
    case 'ref':
      type = 'str';
      break;
    case 'object':
    case 'objectArray':
    case 'json':
      uses.any = true;
      return `${key}: Any = None`;
    default:
      type = tf.enumDef ? (tf.enumDef.numeric ? 'int' : 'str') : tf.rowType;
  }
  if (type === 'UtcDateTime') uses.utc = true;
  if (type === 'DecimalStr') uses.decimal = true;
  if (type === 'date') uses.day = true;
  return isArray(tf) ? `${key}: list[${type}] = []` : `${key}: ${type} | None = None`;
}

function isArray(f: PyField): boolean {
  return f.category === 'scalarArray' || f.category === 'enumArray' || f.category === 'objectArray' || f.category === 'refArray';
}

function listOf(f: PyField, type: string): string {
  return isArray(f) ? `list[${type}]` : type;
}

/** Filter type actually applied (same rule as .NET `effectiveFilter`): the model's choice when it fits the kind. */
function effectiveFilter(f: PyField): FilterType | null {
  // Reference: `reference` (one id or a list); a reference list without a generated target has none (.NET).
  if (f.category === 'ref' || (f.category === 'refArray' && f.target)) return 'reference';
  if (f.category !== 'scalar') return null;
  if (f.enumDef) return 'enum';
  const byType: Record<string, FilterType[]> = {
    str: ['regex', 'eq'],
    int: ['range', 'eq'],
    float: ['range', 'eq'],
    DecimalStr: ['range', 'eq'],
    bool: ['boolean'],
    datetime: ['date-range'],
    date: ['date-range']
  };
  const allowed = byType[f.type];
  if (!allowed) return null;
  const wanted = f.source.filter?.type;
  return wanted && allowed.includes(wanted) ? wanted : allowed[0];
}

/** Value conversion of a body expression for storage. */
function convert(f: PyField, expr: string): string {
  if (isArray(f)) {
    switch (f.conv) {
      case 'str':
        return `[str(v) for v in ${expr}]`;
      case 'int':
        return `[int(v) for v in ${expr}]`;
      case 'dump':
        return `[v.model_dump() for v in ${expr}]`;
      case 'day':
        return `[_day(v) for v in ${expr}]`;
      default:
        return expr;
    }
  }
  switch (f.conv) {
    case 'str':
      return `str(${expr})`;
    case 'int':
      return `int(${expr})`;
    case 'dump':
      return `${expr}.model_dump()`;
    case 'day':
      return `_day(${expr})`;
    default:
      return expr;
  }
}

function buildModuleContext(pkg: string, info: ModelInfo, infos: Map<string, ModelInfo>): PythonModuleContext {
  const { model, names, enums, objects, fields } = info;
  const { entity, folder, singular } = names;
  const visible = fields.filter((f) => !f.hidden);
  const mod = (file: string) => `${pkg}.modules.${folder}.${file}`;
  const crud = `${pkg}.core.crud`;

  // --- model_generated.py --------------------------------------------------------------------------------------
  const modelImports = new PyImports().add('datetime', 'datetime').add('pydantic', 'BaseModel', 'ConfigDict');
  if (fields.some((f) => f.type === 'date')) modelImports.add('datetime', 'date');
  if (enums.some((e) => !e.numeric)) modelImports.add('enum', 'StrEnum');
  if (enums.some((e) => e.numeric)) modelImports.add('enum', 'IntEnum');
  if (objects.some((o) => o.uses.utc)) modelImports.add(crud, 'UtcDateTime');
  if (objects.some((o) => o.uses.decimal) || fields.some((f) => f.type === 'DecimalStr')) modelImports.add(crud, 'DecimalStr');
  if (objects.some((o) => o.uses.ref) || fields.some((f) => f.type === 'RefId')) modelImports.add(crud, 'RefId');
  if (objects.some((o) => o.uses.json) || fields.some((f) => /JsonValue/.test(f.type))) modelImports.add('pydantic', 'JsonValue');
  if (fields.some((f) => f.defaultLiteral?.startsWith('Decimal('))) modelImports.add('decimal', 'Decimal');

  const docLines = fields.map((f) => {
    const limits = limitArgs(f.source);
    const args = [...limits.text, ...(limits.pattern ? [`pattern=${pyStr(limits.pattern)}`] : []), ...limits.number];
    const type = listOf(f, f.type);
    if (isArray(f)) {
      modelImports.add('pydantic', 'Field');
      return `${f.name}: ${type} = Field(default_factory=list)`;
    }
    const nullable = !f.requiredStrict && f.defaultLiteral === undefined;
    const annotated = nullable ? `${type} | None` : type;
    const defaultValue = f.defaultLiteral ?? (nullable ? 'None' : undefined);
    if (args.length) {
      modelImports.add('pydantic', 'Field');
      return `${f.name}: ${annotated} = Field(${[...(defaultValue !== undefined ? [defaultValue] : []), ...args].join(', ')})`;
    }
    return defaultValue !== undefined ? `${f.name}: ${annotated} = ${defaultValue}` : `${f.name}: ${annotated}`;
  });

  // --- schemas_generated.py ------------------------------------------------------------------------------------
  const schemaImports = new PyImports().add('pydantic', 'BaseModel', 'ConfigDict').add(crud, 'IdStr', 'ListBody', 'UtcDateTime');
  const modelNames = new Set<string>();
  const aliasLines: string[] = [];
  let emailHelper = false;
  const bodyType = new Map<PyField, string>();
  for (const f of fields) {
    if (f.enumDef) modelNames.add(f.enumDef.name);
    if (f.objectName) modelNames.add(f.objectName);
    let type = f.type;
    if (!f.inCreate && !f.inUpdate) {
      bodyType.set(f, listOf(f, type));
      continue;
    }
    if (f.category === 'scalar' && f.type === 'str') {
      const limits = limitArgs(f.source);
      const text = [...limits.text];
      const minIdx = text.findIndex((a) => a.startsWith('min_length='));
      if (f.requiredStrict && minIdx < 0) text.unshift('min_length=1');
      const args = [...(f.source.trim ? ['strip_whitespace=True'] : []), ...text, ...(limits.pattern ? [`pattern=${pyStr(limits.pattern)}`] : [])];
      if (args.length) {
        type = `_${pascalCase(f.name)}`;
        const meta = [`StringConstraints(${args.join(', ')})`];
        if (limits.emailCheck) {
          meta.push('AfterValidator(_email)');
          emailHelper = true;
          schemaImports.add('pydantic', 'AfterValidator');
        }
        schemaImports.add('typing', 'Annotated').add('pydantic', 'StringConstraints');
        aliasLines.push(pySubscript(`${type} = Annotated`, ['str', ...meta]));
      }
    } else if (f.category === 'scalar' && (f.type === 'int' || f.type === 'float' || f.type === 'DecimalStr')) {
      const { number } = limitArgs(f.source);
      if (number.length) {
        type = `_${pascalCase(f.name)}`;
        schemaImports.add('typing', 'Annotated').add('pydantic', 'Field');
        aliasLines.push(pySubscript(`${type} = Annotated`, [f.type, `Field(${number.join(', ')})`]));
      }
    }
    bodyType.set(f, listOf(f, type));
  }
  if (emailHelper) schemaImports.module('re');

  // Ref classes: populated references in list / getOne (`{ id, ...populate }`); create / update keep the id (contract §4).
  const refClasses: Array<{ name: string; lines: string[] }> = [];
  const refUses = { ...noUses(), day: false, any: false };
  const refClassOf = new Map<PyField, string>();
  for (const f of visible) {
    if (!f.populate || !f.target) continue;
    const target = infos.get(f.target.model.entityName)!;
    const stem = f.category === 'refArray' ? singularize(f.name.replace(/Ids$/, 's')) : f.name.replace(/Id$/, '');
    const name = `${entity}${pascalCase(stem)}Ref`;
    const seen = new Set<string>();
    const lines = ['id: str'];
    for (const key of f.populate) {
      if (key === '_id' || key === 'id' || seen.has(key)) continue;
      seen.add(key);
      const line = refClassLine(key, target, refUses);
      if (line) lines.push(line);
    }
    refClasses.push({ name, lines });
    refClassOf.set(f, name);
  }

  // Row: every visible field. A required field the create body cannot set (readonly / hiddenFromCreate) and
  // `map_create` does not fill is optional here, so old / partial documents still read.
  const rowLines = visible.map((f) => {
    const refClass = refClassOf.get(f);
    if (refClass) return f.category === 'refArray' ? `${f.name}: list[${refClass} | str] = []` : `${f.name}: ${refClass} | str | None = None`;
    const type = listOf(f, f.rowType);
    // `computed`: never stored, filled by `map_rows`; `detailOnly`: not read for list pages. Both `None` when absent.
    if (f.source.access?.computed === true || f.source.access?.detailOnly === true) return `${f.name}: ${type} | None = None`;
    if (isArray(f)) return `${f.name}: ${type} = []`;
    const required = f.requiredStrict && (f.inCreate || createOnlyValue(f) !== undefined);
    return required ? `${f.name}: ${type}` : `${f.name}: ${type} | None = None`;
  });
  const createLines = fields.filter((f) => f.inCreate).map((f) => {
    const type = bodyType.get(f)!;
    return f.requiredStrict && f.defaultLiteral === undefined && !isArray(f) ? `${f.name}: ${type}` : `${f.name}: ${type} | None = None`;
  });
  // Update (contract §5, JSON Merge Patch): `null` clears an optional single field; a required field or an array
  // takes no `null` (`NotNull`, 400). One rule for every stack: `updateNullClears`.
  const updateLines = fields
    .filter((f) => f.inUpdate)
    .map((f) => (updateNullClears(f.source) ? `${f.name}: ${bodyType.get(f)!} | None = None` : `${f.name}: NotNull[${bodyType.get(f)!}] = None`));

  // Filters (visible fields, `searchable: false` opts out; timestamps unless the model's own field opts out).
  const filterLines = ['id: IdStr | None = None'];
  const filterEntries = ['"id": FilterField("_id", "id"),'];
  for (const f of visible) {
    if (f.source.filter?.searchable === false || f.source.access?.computed === true) continue;
    const filter = effectiveFilter(f);
    if (!filter) continue;
    let type: string;
    switch (filter) {
      case 'regex':
        type = 'str';
        break;
      case 'eq':
        type = f.type;
        break;
      case 'boolean':
        type = 'bool';
        break;
      case 'range':
        type = f.type === 'DecimalStr' ? 'DecimalRangeValue' : 'RangeValue';
        schemaImports.add(crud, type);
        break;
      case 'date-range':
        type = 'DateRangeValue';
        schemaImports.add(crud, 'DateRangeValue');
        break;
      case 'enum':
        type = `${f.type} | list[${f.type}]`;
        break;
      case 'reference':
        type = 'IdStr | list[IdStr]';
        break;
      default:
        continue;
    }
    filterLines.push(`${f.name}: ${type} | None = None`);
    filterEntries.push(`${pyStr(f.name)}: FilterField(${pyStr(f.name)}, ${pyStr(filter)}),`);
  }
  for (const ts of ['createdAt', 'updatedAt']) {
    if (model.fields.find((f) => f.name === ts)?.filter?.searchable === false) continue;
    schemaImports.add(crud, 'DateRangeValue');
    filterLines.push(`${ts}: DateRangeValue | None = None`);
    filterEntries.push(`${pyStr(ts)}: FilterField(${pyStr(ts)}, "date-range"),`);
  }

  // Imports for the names the emitted lines use (no unused import: ruff F401).
  const schemaText = [...aliasLines, ...refClasses.flatMap((c) => c.lines), ...rowLines, ...createLines, ...updateLines, ...filterLines].join('\n');
  const uses = (name: string) => new RegExp(`\\b${name}\\b`).test(schemaText);
  if (uses('datetime')) schemaImports.add('datetime', 'datetime');
  if (uses('date')) schemaImports.add('datetime', 'date');
  if (uses('Any')) schemaImports.add('typing', 'Any');
  if (uses('JsonValue')) schemaImports.add('pydantic', 'JsonValue');
  for (const name of ['DecimalStr', 'NotNull', 'RefId']) if (uses(name)) schemaImports.add(crud, name);
  const usedModelNames = [...modelNames].filter(uses);
  if (usedModelNames.length) schemaImports.add(mod('model_generated'), ...usedModelNames);

  // Blank lines as `ruff format` wants them: one after the imports, two around a function.
  const schemaPreamble: string[] = [];
  if (emailHelper) {
    schemaPreamble.push(
      '',
      `_EMAIL = re.compile(${pyStr(EMAIL_PATTERN)})`,
      '',
      '',
      'def _email(value: str) -> str:',
      '    """`format: email` ile özel `pattern` birlikte: desen `StringConstraints`\'te, e-posta burada."""',
      '    if not _EMAIL.match(value):',
      '        raise ValueError("invalid email")',
      '    return value'
    );
  }
  if (aliasLines.length) schemaPreamble.push(...(emailHelper ? [''] : []), '', ...aliasLines);

  // --- repository_generated.py ---------------------------------------------------------------------------------
  const uniqueFields = fields.filter((f) => f.source.unique === true && (f.category === 'scalar' || f.category === 'ref'));
  const indexLines = uniqueFields.map((f) =>
    pyCall('await self._c.create_index', [`[(${pyStr(f.name)}, 1)]`, 'unique=True', ...(f.requiredStrict ? [] : ['sparse=True']), `name=${pyStr(`uniq_${f.name}`)}`], '        ')
  );

  // --- service_generated.py ------------------------------------------------------------------------------------
  const bodies = [`${entity}Filters`, `${entity}Create`, `${entity}Update`, `${entity}Row`];
  const serviceImports = new PyImports()
    .add('typing', 'TYPE_CHECKING', 'ClassVar')
    .add(crud, 'CrudService', 'Doc', 'FilterField', 'ServiceHooks')
    .add(mod('schemas_generated'), ...bodies);
  const typeChecking = new PyImports().add('collections.abc', 'Mapping');
  const usesDay = fields.some((f) => f.conv === 'day' && (f.inCreate || f.inUpdate));
  if (usesDay) serviceImports.add('datetime', 'UTC', 'date', 'datetime');

  const sortEntries = [
    ...visible
      .filter((f) => (f.category === 'scalar' || f.category === 'ref') && f.source.access?.computed !== true)
      .map((f) => `${pyStr(f.name)}: ${pyStr(f.name)},`),
    '"createdAt": "createdAt",',
    '"updatedAt": "updatedAt",'
  ];

  const mapCreateDict: string[] = [];
  const mapCreateAfter: string[] = [];
  const literalImports = (literal: string, f: PyField) => {
    if (f.enumDef && literal.startsWith(`${f.enumDef.name}.`)) serviceImports.add(mod('model_generated'), f.enumDef.name);
    if (literal.startsWith('Decimal(')) serviceImports.add('decimal', 'Decimal');
  };
  for (const f of fields) {
    const v = `body.${f.name}`;
    if (f.source.access?.computed === true) continue; // never stored
    if (!f.inCreate) {
      // Not in the create body (readonly / hiddenFromCreate): the default, an empty list or the type's zero value.
      const value = createOnlyValue(f);
      if (value === undefined) continue;
      literalImports(value, f);
      mapCreateDict.push(`${pyStr(f.name)}: ${f.conv && f.defaultLiteral !== undefined && !isArray(f) ? convert(f, value) : value},`);
      continue;
    }
    const optionalUnique =
      f.source.unique === true && (f.category === 'scalar' || f.category === 'ref') && !f.requiredStrict && f.defaultLiteral === undefined;
    if (optionalUnique) {
      // Unique + optional: the key is left out when empty (sparse index; `check_unique` skips missing keys).
      mapCreateAfter.push(`if ${v} is not None:`, `    doc[${pyStr(f.name)}] = ${convert(f, v)}`);
      continue;
    }
    let expr: string;
    if (isArray(f)) expr = `${convert(f, v)} if ${v} is not None else []`;
    else if (f.requiredStrict && f.defaultLiteral === undefined) expr = convert(f, v);
    else if (f.defaultLiteral !== undefined) {
      literalImports(f.defaultLiteral, f);
      expr = f.conv ? convert(f, `${v} if ${v} is not None else ${f.defaultLiteral}`) : `${v} if ${v} is not None else ${f.defaultLiteral}`;
    } else expr = f.conv ? `${convert(f, v)} if ${v} is not None else None` : v;
    mapCreateDict.push(dictEntry(pyStr(f.name), expr, '            '));
  }

  const mapUpdateLines: string[] = [];
  for (const f of fields) {
    if (!f.inUpdate || !f.conv || f.conv === 'dump') continue;
    const key = pyStr(f.name);
    // `None` = clear the field (`$unset`): nothing to convert.
    mapUpdateLines.push(`if changes.get(${key}) is not None:`, `    changes[${key}] = ${convert(f, `changes[${key}]`)}`);
  }

  // References (targets generated in this host): existence check on writes, populate on reads; hidden fields.
  const collectionOf = (f: PyField) => f.target!.names.collection;
  const relationLines = fields
    .filter((f) => f.target && (f.inCreate || f.inUpdate))
    .map((f) => `${pyCall('RelationField', [pyStr(f.name), pyStr(collectionOf(f)), ...(f.category === 'refArray' ? ['many=True'] : [])], '        ')},`);
  const populateLines = visible
    .filter((f) => refClassOf.has(f))
    .map((f) => {
      const keys = [...new Set(f.populate!.filter((k) => k !== '_id' && k !== 'id'))].filter((k) => {
        const tf = infos.get(f.target!.model.entityName)!.fields.find((x) => x.name === k);
        return k === 'createdAt' || k === 'updatedAt' || (tf !== undefined && !tf.hidden && tf.category !== 'refArray');
      });
      const tuple = keys.length === 1 ? `(${pyStr(keys[0])},)` : `(${keys.map(pyStr).join(', ')})`;
      return `${pyCall('PopulateField', [pyStr(f.name), pyStr(collectionOf(f)), tuple, ...(f.category === 'refArray' ? ['many=True'] : [])], '        ')},`;
    });
  // `ruff format`: a one-element tuple's comma is not "magic", so it sits on one line when it fits.
  const tupleBlock = (head: string, entries: string[]): string[] => {
    if (!entries.length) return [];
    const one = `    ${head} = (${entries[0].trim().replace(/,$/, '')},)`;
    if (entries.length === 1 && !entries[0].includes('\n') && one.length <= PY_LINE_LENGTH) return [one];
    return [`    ${head} = (`, ...entries, '    )'];
  };
  const relationBlock = tupleBlock('relation_fields: ClassVar[tuple[RelationField, ...]]', relationLines);
  const populateBlock = tupleBlock('populate_fields: ClassVar[tuple[PopulateField, ...]]', populateLines);
  if (relationLines.length) serviceImports.add(crud, 'RelationField');
  if (populateLines.length) serviceImports.add(crud, 'PopulateField');
  const hiddenNames = fields.filter((f) => f.hidden).map((f) => pyStr(f.name));
  const detailOnlyNames = visible.filter((f) => f.source.access?.detailOnly === true).map((f) => pyStr(f.name));

  const servicePreamble = usesDay
    ? [
        '',
        '',
        'def _day(value: date) -> datetime:',
        '    """`dateFormat: date`: gün UTC gece yarısı olarak saklanır (filtre ve sıralama tarih üzerinden çalışır)."""',
        '    return datetime(value.year, value.month, value.day, tzinfo=UTC)'
      ].join('\n')
    : '';

  // --- admin_router_generated.py -------------------------------------------------------------------------------
  const service = `${entity}Service`;
  const adminOpList = resolveAdminOperations(model.api);
  const adminOps = Object.fromEntries(
    (['list', 'getOne', 'create', 'update', 'delete'] as const).map((op) => [op, adminOpList.includes(op)])
  ) as Record<NormalOperation, boolean> & { all: boolean };
  adminOps.all = adminOpList.length === 5;
  const routerImports = new PyImports()
    .add('typing', 'Annotated')
    .add('fastapi', 'APIRouter', 'Body', 'Depends')
    .add(`${pkg}.api.deps`, 'AdminDep', 'DbDep')
    .add(crud, 'ListBody', 'PaginatedList', 'set_current_actor')
    .add(`${pkg}.core.http.contract`, 'ContractResponse', 'ContractRoute', 'contract_ok')
    .add(
      mod('schemas_generated'),
      ...[
        adminOps.create ? `${entity}Create` : '',
        `${entity}Filters`,
        `${entity}ListBody`,
        `${entity}Row`,
        adminOps.update ? `${entity}Update` : ''
      ].filter(Boolean)
    )
    .add(mod('service'), service, `build_${folder}_service`);
  if (adminOps.create || adminOps.update || adminOps.delete) routerImports.add(`${crud}.messages`, 'crud_text');
  const row = `ContractResponse[${entity}Row]`;
  const page = `ContractResponse[PaginatedList[${entity}Row]]`;
  const deco = (method: string, path: string, response: string) => pyCall(`@router.${method}`, [pyStr(path), `response_model=${response}`]);

  // --- K files -------------------------------------------------------------------------------------------------
  const modelExports = [entity, ...enums.map((e) => e.name), ...objects.map((o) => o.name)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const kServiceImports = new PyImports()
    .add('typing', 'TYPE_CHECKING')
    .add(mod('hooks'), `${entity}Hooks`)
    .add(mod('repository'), `${entity}Repository`)
    .add(mod('service_generated'), `${entity}ServiceBase`);

  const test = buildPythonTestContext(
    fields.map((f) => ({
      source: f.source,
      name: f.name,
      category: f.category,
      type: f.type,
      isEnum: f.enumDef !== undefined,
      requiredStrict: f.requiredStrict,
      hasDefault: f.defaultLiteral !== undefined,
      inCreate: f.inCreate,
      inUpdate: f.inUpdate,
      hidden: f.hidden,
      computed: f.source.access?.computed === true,
      unique: uniqueFields.includes(f),
      filter: f.hidden || f.source.filter?.searchable === false || f.source.access?.computed === true ? null : effectiveFilter(f),
      refCollection: f.target ? collectionOf(f) : undefined,
      refUnique: f.target
        ? infos
            .get(f.target.model.entityName)!
            .fields.filter((t) => t.source.unique === true && t.requiredStrict && (t.category === 'scalar' || t.category === 'ref'))
            .map((t) => t.name)
        : undefined,
      populated: refClassOf.has(f)
    }))
  );  // Update ucu kapalıysa unique çakışması yalnız create'te denenir.
  if (!adminOps.update) test.uniqueUpdate = undefined;


  return {
    pkg,
    ...names,
    hasAdmin: model.api?.admin !== false,
    adminOps,
    detailOnlyTuple: `(${detailOnlyNames.join(', ')}${detailOnlyNames.length === 1 ? ',' : ''})`,
    model: {
      imports: modelImports.render(),
      enums: enums.map((e) => ({
        name: e.name,
        base: e.numeric ? 'IntEnum' : 'StrEnum',
        members: e.members.map((m) => `${m.name} = ${e.numeric ? String(m.number) : pyStr(m.value)}`)
      })),
      objects,
      docLines
    },
    schemas: {
      imports: schemaImports.render(),
      preamble: schemaPreamble.join('\n'),
      refClasses,
      rowLines: rowLines.map(classFieldLine),
      createLines: createLines.map(classFieldLine),
      updateLines: updateLines.map(classFieldLine),
      filterLines: filterLines.map(classFieldLine)
    },
    repository: { indexLines },
    service: {
      imports: serviceImports.render(),
      typeCheckingImports: typeChecking.render('    '),
      preamble: servicePreamble,
      hooksClass: pyClass(`${entity}HooksBase`, 'ServiceHooks', bodies),
      serviceClass: pyClass(`${entity}ServiceBase`, 'CrudService', bodies),
      filterEntries,
      sortEntries,
      uniqueLine: uniqueFields.length ? `unique_fields = (${uniqueFields.map((f) => pyStr(f.name)).join(', ')}${uniqueFields.length === 1 ? ',' : ''})` : undefined,
      hiddenLine: hiddenNames.length ? `hidden_fields = (${hiddenNames.join(', ')}${hiddenNames.length === 1 ? ',' : ''})` : undefined,
      detailOnlyLine: detailOnlyNames.length
        ? `detail_only_fields = (${detailOnlyNames.join(', ')}${detailOnlyNames.length === 1 ? ',' : ''})`
        : undefined,
      relationBlock,
      populateBlock,
      mapCreateDef: pyDef('def map_create', ['self', `body: ${entity}Create`], 'Doc', '    '),
      mapCreateDict,
      mapCreateAfter,
      mapUpdateDef: mapUpdateLines.length ? pyDef('def map_update', ['self', `body: ${entity}Update`], 'Doc', '    ') : undefined,
      mapUpdateLines
    },
    router: {
      imports: routerImports.render(),
      listDecorator: deco('post', '/get-all', page),
      listDef: pyDef(
        `async def list_${folder}`,
        ['_: AdminDep', 'service: ServiceDep', `body: Annotated[${entity}ListBody | None, Body()] = None`],
        page,
        '',
        true
      ),
      getDecorator: deco('get', '/{id}', row),
      getDef: pyDef(`async def get_${singular}`, ['id: str', '_: AdminDep', 'service: ServiceDep'], row),
      createDecorator: deco('post', '/create', row),
      createDef: pyDef(`async def create_${singular}`, [`body: ${entity}Create`, '_: AdminDep', 'service: ServiceDep'], row),
      updateDecorator: deco('post', '/update/{id}', row),
      updateDef: pyDef(`async def update_${singular}`, ['id: str', `body: ${entity}Update`, '_: AdminDep', 'service: ServiceDep'], row),
      deleteDecorator: deco('delete', '/{id}', 'ContractResponse[None]'),
      deleteDef: pyDef(`async def delete_${singular}`, ['id: str', '_: AdminDep', 'service: ServiceDep'], 'ContractResponse[None]')
    },
    k: {
      modelImport: new PyImports().add(mod('model_generated'), ...modelExports).render(),
      modelExports,
      repositoryImport: new PyImports().add(mod('repository_generated'), `${entity}RepositoryBase`).render(),
      hooksImport: new PyImports().add('typing', 'TYPE_CHECKING').add(mod('service_generated'), `${entity}HooksBase`).render(),
      serviceImports: kServiceImports.render()
    },
    test
  };
}

export function buildPythonModuleContexts(pkg: string, models: NormalizedModel[]): PythonModuleContext[] {
  const seen = new Map<string, string>();
  const targets = new Map<string, TargetInfo>();
  for (const m of models) {
    const names = pythonModuleNames(m.entityName);
    const other = seen.get(names.folder);
    if (other) throw new PythonUnsupportedError(`${other} ve ${m.entityName} aynı modül klasörüne (${names.folder}) düşüyor.`);
    seen.set(names.folder, m.entityName);
    targets.set(m.entityName, { model: m, names });
  }
  const infos = new Map(models.map((m) => [m.entityName, describeFields(m, targets.get(m.entityName)!.names, targets)]));
  return models.map((m) => buildModuleContext(pkg, infos.get(m.entityName)!, infos));
}
