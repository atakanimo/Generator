import Handlebars from 'handlebars';
import { pluralize as pluralizeName } from './namingUtils.js';
import { hasSearchableRelationFields } from './handlebars-schema-predicates.js';
import {
  isMongooseSourceType,
  resolvePrimaryKeyFieldName,
  resolvePrimaryKeyMemberAccess,
  emitObjectTsLiteral,
  emitObjectJsonDefault,
  type ObjectSubFieldLike,
} from '../../shared/schemaFieldTypes.js';
import {
  emitFeTableFilterFieldAttrs,
  feTableNeedsAvatarFields,
  emitFeTableFilterNormalizeFunction,
  emitFeTableRelationOptionImports,
  emitFeTableRelationSupportCode,
  registerFeTableTemplateFragments,
} from './handlebars-fe-table.js';
import { registerFeEntityPageHelpers, registerFeSharedTemplateHelpers } from './handlebars-fe-frontend.js';
import { registerFeServiceClientHelpers } from './handlebars-fe-service-client.js';
import { registerFeCoreTextHelpers } from './handlebars-fe-coretext.js';
import { emitFeTableRowCellJsx } from '../../shared/feTableCell.js';

/**
 * Frontend-only Handlebars helpers. Order: shared/page → field DTO lines → service client →
 * modal/table/slice → table template fragments (requires prior `feTable*` registrations).
 */
export function registerFrontendHandlebarsHelpers(): void {
  registerFeSharedTemplateHelpers();
  registerFeEntityPageHelpers();
  registerFeCoreTextHelpers();

  type FeField = {
    name?: string;
    type?: string;
    filterType?: string;
    required?: boolean;
    isArray?: boolean;
    includeRelation?: boolean;
    relationEntityName?: string;
    isSearchable?: boolean;
    defaultValue?: string;
    hiddenFromUpdate?: boolean;
    hiddenFromCreate?: boolean;
    isReadonly?: boolean;
    objectFields?: ObjectSubFieldLike[];
  };

  const feFieldValueTsType = (field: FeField): string => {
    const isArray = Boolean(field.isArray);
    const t = String(field.type || 'string').toLowerCase();
    let base: string;
    if (field.includeRelation && field.relationEntityName) {
      base = `I${pluralizeName(String(field.relationEntityName))}`;
    } else if (field.includeRelation && !field.relationEntityName) {
      if (t === 'schema') base = 'string';
      else if (t === 'date') base = 'Date';
      else base = String(field.type || 'string');
    } else if (t === 'schema') {
      base = 'string';
    } else if (t === 'date') {
      base = 'Date';
    } else if (t === 'object') {
      base = emitObjectTsLiteral(field);
    } else {
      base = String(field.type || 'string');
    }
    return isArray ? `${base}[]` : base;
  };

  const feFilterFieldTsType = (field: FeField): string => {
    const t = String(field.type || 'string').toLowerCase();
    const fk = String(field.filterType || '').trim().toLowerCase();
    if (t === 'schema') return 'string';
    if (t === 'date' && fk === 'date-range') return '{ from?: string | Date; to?: string | Date } | string | Date';
    if (t === 'date') return 'string | Date';
    return String(field.type || 'string');
  };

  /** Normal (non-admin) service: ownership field must not appear in Input or filter DTO when route is protected — see beAnalyze «Ownership Field Standard» / «Types File Standard». */
  const feIsScopedOwnershipUserId = (field: FeField | null | undefined, isProtectedRoute: unknown): boolean =>
    isProtectedRoute === true && String(field?.name || '').toLowerCase() === 'userid';

  Handlebars.registerHelper('feEntityPropLine', (field: FeField) => {
    const name = String(field?.name || '').trim();
    if (!name) return '';
    const optional = name === '_id' || field.required ? '' : '?';
    const ts = feFieldValueTsType(field);
    return new Handlebars.SafeString(`  ${name}${optional}: ${ts};\n`);
  });

  Handlebars.registerHelper(
    'feInputPropLine',
    (field: FeField, sourceType: unknown, isProtectedRoute: unknown) => {
      const name = String(field?.name || '').trim();
      if (!name) return '';
      if (isProtectedRoute === true && name.toLowerCase() === 'userid') return '';
      const st = sourceType != null && sourceType !== '' ? String(sourceType) : '';
      if (isMongooseSourceType(st)) {
        if (name === '_id') return '';
      } else if (name === 'id') {
        return '';
      }
      const optional = field.required ? '' : '?';
      const ts = feFieldValueTsType(field);
      return new Handlebars.SafeString(`  ${name}${optional}: ${ts};\n`);
    }
  );

  Handlebars.registerHelper('feAdminInputPropLine', (field: FeField, sourceType: unknown) => {
    const name = String(field?.name || '').trim();
    if (!name) return '';
    const st = sourceType != null && sourceType !== '' ? String(sourceType) : '';
    if (isMongooseSourceType(st)) {
      if (name === '_id') return '';
    } else if (name === 'id') {
      return '';
    }
    const optional = field.required ? '' : '?';
    const ts = feFieldValueTsType(field);
    return new Handlebars.SafeString(`  ${name}${optional}: ${ts};\n`);
  });

  Handlebars.registerHelper('feFilterQueryPropLine', (field: FeField, isProtectedRoute?: unknown) => {
    if (feIsScopedOwnershipUserId(field, isProtectedRoute)) return '';
    if (!field || field.isSearchable !== true) return '';
    const name = String(field.name || '').trim();
    if (!name) return '';
    const ts = feFilterFieldTsType(field);
    return new Handlebars.SafeString(`  ${name}?: ${ts};\n`);
  });

  registerFeServiceClientHelpers();

  Handlebars.registerHelper('feEntitySyntheticIds', (sourceType: unknown, fields: unknown) => {
    const fieldArr = Array.isArray(fields) ? (fields as { name?: string }[]) : [];
    const has = (n: string) => fieldArr.some(f => f && String(f.name) === n);
    const st = sourceType != null && sourceType !== '' ? String(sourceType) : '';
    let lines = '';
    if (st === 'nodejs-mongoose') {
      if (!has('_id')) lines += '  _id: string;\n';
    } else if (st === 'dotnet-ef' || st === 'nodejs-typeorm') {
      if (!has('id')) lines += '  id?: string;\n';
    } else if (st) {
      if (!has('_id')) lines += '  _id?: string;\n';
      if (!has('id')) lines += '  id?: string;\n';
    } else {
      if (!has('_id')) lines += '  _id?: string;\n';
      if (!has('id')) lines += '  id?: string;\n';
    }
    return new Handlebars.SafeString(lines);
  });

  Handlebars.registerHelper('feBool', (v: unknown) => (v === true ? 'true' : 'false'));

  Handlebars.registerHelper('fePrimaryIdMember', (sourceType: unknown) =>
    resolvePrimaryKeyMemberAccess(sourceType)
  );

  Handlebars.registerHelper('feRelationIdAssign', (sourceType: unknown) => {
    const line = isMongooseSourceType(sourceType)
      ? 'dataToSave[key] = val._id || val.id;'
      : 'dataToSave[key] = val.id;';
    return new Handlebars.SafeString(line);
  });

  Handlebars.registerHelper('feModalDeletePrimaryKeyLine', (sourceType: unknown) => {
    const key = resolvePrimaryKeyFieldName(sourceType);
    return new Handlebars.SafeString(`delete dataToSave.${key};`);
  });

  Handlebars.registerHelper('feDeletePrimaryKeyOnVar', (varName: unknown, sourceType: unknown) => {
    const v = String(varName || '').trim() || 'obj';
    const key = resolvePrimaryKeyFieldName(sourceType);
    return new Handlebars.SafeString(`delete ${v}['${key}'];`);
  });

  /** Mongo: DataGrid sets row.id from _id — strip from JSON draft / save (PK is in URL, not body). */
  Handlebars.registerHelper('feDeleteDataGridRowKeyOnVar', (varName: unknown, sourceType: unknown) => {
    if (!isMongooseSourceType(sourceType)) return '';
    const v = String(varName || '').trim() || 'obj';
    return new Handlebars.SafeString(`delete ${v}.id;`);
  });

  Handlebars.registerHelper('feModalDeleteDataGridRowKeyLine', (sourceType: unknown) => {
    if (!isMongooseSourceType(sourceType)) return '';
    return new Handlebars.SafeString(`delete dataToSave.id;`);
  });

  /**
   * Normal protected API: ownership `userId` is server-scoped — remove from JSON draft/save object.
   * Admin modals keep `userId` in the payload when present.
   */
  Handlebars.registerHelper(
    'feModalDeleteScopedUserIdFromVar',
    (varName: unknown, isProtectedRoute: unknown, isAdminUser: unknown) => {
      if (isProtectedRoute !== true || isAdminUser === true) return '';
      const v = String(varName || '').trim() || 'obj';
      return new Handlebars.SafeString(`delete ${v}.userId;`);
    }
  );

  Handlebars.registerHelper('feModalBooleanNormalizeLines', (fields: unknown) => {
    if (!Array.isArray(fields)) return '';
    let out = '';
    for (const f of fields as FeField[]) {
      if (f && String(f.type || '').toLowerCase() === 'boolean' && f.name) {
        const n = String(f.name);
        out += `      if (dataToSave['${n}'] === undefined) {\n        dataToSave['${n}'] = false;\n      }\n`;
      }
    }
    return new Handlebars.SafeString(out);
  });

  Handlebars.registerHelper('feModalCreateDefaultInits', (fields: unknown) => {
    if (!Array.isArray(fields)) return '';
    let out = '';
    for (const raw of fields as FeField[]) {
      if (!raw?.name || raw.defaultValue == null || raw.defaultValue === '') continue;
      const name = String(raw.name);
      const dv = String(raw.defaultValue);
      out += `      if ('${dv}' === 'currentDate') {\n        initialData['${name}'] = new Date().toISOString();\n      } else if ('${dv}' === 'uuid') {\n        initialData['${name}'] =\n          typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function'\n            ? (crypto as any).randomUUID()\n            : '';\n      } else if ('${dv}' === 'currentUserId') {\n        initialData['${name}'] = '';\n      } else {\n        initialData['${name}'] = '${dv}';\n      }\n`;
    }
    return new Handlebars.SafeString(out);
  });

  Handlebars.registerHelper('feModalEnsureJsonKeys', (fields: unknown, sourceType: unknown, isProtectedRoute: unknown, isAdminUser?: unknown, mode?: unknown) => {
    if (!Array.isArray(fields)) return '';
    const st = sourceType != null && sourceType !== '' ? String(sourceType) : '';
    const skipId = (name: string) => name === resolvePrimaryKeyFieldName(st);
    const m = String(mode ?? '');
    let out = '';
    for (const f of fields as FeField[]) {
      const rawName = String(f?.name || '').trim();
      if (!rawName) continue;
      if (skipId(rawName)) continue;
      const fx = f as FeField & { hiddenFromCreate?: boolean; hiddenFromUpdate?: boolean };
      if (m === 'create' && fx.hiddenFromCreate === true) continue;
      if (m === 'edit' && fx.hiddenFromUpdate === true) continue;
      // Ownership field rule:
      // - normal protected: omit userId from create skeleton (server-scoped)
      // - admin: include userId even if protected
      if (isProtectedRoute === true && isAdminUser !== true && rawName.toLowerCase() === 'userid') continue;

      const t = String(f?.type || 'string').toLowerCase();
      const isArray = Boolean((f as any)?.isArray);
      let placeholder = "''";
      if (isArray) placeholder = '[]';
      else if (t === 'number') placeholder = '0';
      else if (t === 'boolean') placeholder = 'false';
      else if (t === 'date') placeholder = "''";
      else if (t === 'schema') placeholder = "''";
      else if (t === 'object') placeholder = emitObjectJsonDefault(f as { type?: string; objectFields?: ObjectSubFieldLike[] });

      out += `      if (initialData['${rawName}'] === undefined) initialData['${rawName}'] = ${placeholder};\n`;
    }
    return new Handlebars.SafeString(out);
  });

  /** Full modal JSON-draft utilities (generated once per *Modal.tsx): spread-artifact strip, row clone, plain JSON value, relation id flattening from schema. */
  Handlebars.registerHelper('feModalJsonDraftUtilsFn', (fields: unknown, sourceType: unknown) => {
    const st = String(sourceType || '');
    const isMongoose = st === 'nodejs-mongoose';

    const pickFn = isMongoose
      ? [
          '/** FK scalar (string / Guid / number) passes through; populated docs → id (Mongo: _id first; also id / .NET PascalCase Id). */',
          'function pickRelationFkFromValue(v: any): any {',
          '  if (v == null) return v;',
          '  if (typeof v !== \'object\' || Array.isArray(v)) return v;',
          '  const m = v as any;',
          '  const x = m._id ?? m.id ?? m.Id;',
          '  return x !== undefined && x !== null && x !== \'\' ? x : v;',
          '}',
          '',
        ].join('\n')
      : [
          '/** FK scalar passes through; populated / navigation objects → id (id / Id / _id). C# JSON often uses plain string Guid already. */',
          'function pickRelationFkFromValue(v: any): any {',
          '  if (v == null) return v;',
          '  if (typeof v !== \'object\' || Array.isArray(v)) return v;',
          '  const m = v as any;',
          '  const x = m.id ?? m.Id ?? m._id;',
          '  return x !== undefined && x !== null && x !== \'\' ? x : v;',
          '}',
          '',
        ].join('\n');

    const fieldArr = Array.isArray(fields) ? (fields as FeField[]) : [];
    let normalizeBody = '';
    for (const f of fieldArr) {
      if (!f?.includeRelation) continue;
      const name = String(f.name || '').trim();
      if (!name) continue;
      const isArr = Boolean((f as { isArray?: boolean }).isArray);
      if (isArr) {
        normalizeBody += `  {\n    const v = obj['${name}'];\n    obj['${name}'] = Array.isArray(v) ? v.map((x: any) => pickRelationFkFromValue(x)) : pickRelationFkFromValue(v);\n  }\n`;
      } else {
        normalizeBody += `  obj['${name}'] = pickRelationFkFromValue(obj['${name}']);\n`;
      }
    }

    const normalizeFn = [
      '/** Relation fields from schema: normalize each FK for JSON textarea + save. */',
      'function normalizeRelationFieldsForModalJson(obj: Record<string, any>): void {',
      '  if (!obj || typeof obj !== \'object\') return;',
      normalizeBody + '}',
      '',
    ].join('\n');

    let stripNonWritableInner = '';
    for (const f of fieldArr) {
      const rawName = String(f?.name || '').trim();
      if (!rawName) continue;
      if (f.hiddenFromUpdate === true) {
        stripNonWritableInner += `  if (mode === 'edit') delete obj['${rawName}'];\n`;
      }
      if (f.hiddenFromCreate === true) {
        stripNonWritableInner += `  if (mode === 'create') delete obj['${rawName}'];\n`;
      }
      if (f.isReadonly === true) {
        stripNonWritableInner += `  if (mode === 'edit') delete obj['${rawName}'];\n`;
      }
    }

    const stripNonWritableFn = [
      '/** Server-managed timestamps + schema non-writable keys. Update document id is in the URL — body omits _id (see delete below). */',
      'function stripNonWritablePayloadFields(obj: Record<string, any>, mode: \'create\' | \'edit\'): void {',
      '  if (!obj || typeof obj !== \'object\') return;',
      '  delete obj.createdAt;',
      '  delete obj.updatedAt;',
      ...(isMongoose ? ['  delete obj.__v;\n'] : []),
      stripNonWritableInner + '}',
      '',
    ].join('\n');

    const stripFn = [
      '/** `{ ...someString }` leaves keys "0","1",… — strip if it matches that pattern on the draft object. */',
      'function stripSpreadArtifactKeys(obj: Record<string, any>): void {',
      '  if (!obj || typeof obj !== \'object\') return;',
      '  const ix = Object.keys(obj).filter(k => /^\\d+$/.test(k));',
      '  if (ix.length < 12) return;',
      '  const n = ix.map(Number).sort((a, b) => a - b);',
      '  if (n[0] !== 0 || n[n.length - 1] !== n.length - 1 || !n.every((v, i) => v === i)) return;',
      '  if (!ix.every(k => typeof obj[k] === \'string\' && (obj[k] as string).length === 1)) return;',
      '  ix.forEach(k => delete obj[k]);',
      '}',
      '',
    ].join('\n');

    const prepareFn = [
      '/** Safe shallow clone for edit merge (`{ ...string }` and TypedArrays are rejected). */',
      'function prepareEditRowClone(row: unknown): Record<string, any> | null {',
      '  if (row === null || typeof row !== \'object\' || Array.isArray(row)) return null;',
      '  if (typeof ArrayBuffer !== \'undefined\' && ArrayBuffer.isView(row as ArrayBufferView)) return null;',
      '  if (Object.prototype.toString.call(row) !== \'[object Object]\') return null;',
      '  const clone = { ...(row as Record<string, any>) };',
      ...(isMongoose
        ? [
            '  if (clone._id != null && clone._id !== \'\') {',
            '    delete clone.id;',
            '  }',
          ]
        : []),
      '  return clone;',
      '}',
      '',
    ].join('\n');

    const toPlainFn = [
      '/** `depth === 0`: entity row — do not collapse to `v._id` only (avoids "0".."23" string keys). Nested relations flatten via depth > 0. */',
      'function toPlainJsonValueForModal(v: any, depth = 0): any {',
      '  if (Array.isArray(v)) return v.map(el => toPlainJsonValueForModal(el, depth + 1));',
      '  if (v && typeof v === \'object\') {',
      '    if (depth > 0 && typeof v._id === \'string\') return v._id;',
      '    if (depth > 0 && typeof v.id === \'string\') return v.id;',
      '    const out: Record<string, any> = {};',
      '    Object.keys(v).forEach(k => {',
      '      out[k] = toPlainJsonValueForModal(v[k], depth + 1);',
      '    });',
      '    return out;',
      '  }',
      '  return v;',
      '}',
      '',
    ].join('\n');

    return new Handlebars.SafeString(stripFn + prepareFn + toPlainFn + pickFn + normalizeFn + stripNonWritableFn);
  });

  Handlebars.registerHelper('feModalStripNonWritableApply', (varName: unknown) => {
    const v = String(varName || '').trim() || 'obj';
    return new Handlebars.SafeString(`    stripNonWritablePayloadFields(${v}, mode);\n`);
  });

  Handlebars.registerHelper('feModalJsonDraftFinalizeApply', () =>
    new Handlebars.SafeString(
      '    normalizeRelationFieldsForModalJson(initialData);\n    stripSpreadArtifactKeys(initialData);\n'
    )
  );

  Handlebars.registerHelper('feModalNormalizeRelationsCall', (varName: unknown) => {
    const v = String(varName || '').trim() || 'obj';
    return new Handlebars.SafeString(`    normalizeRelationFieldsForModalJson(${v});\n`);
  });

  Handlebars.registerHelper('feTableCellExpr', (field: unknown) => {
    const f = field as {
      name?: string;
      type?: string;
      uiComponent?: string;
      label?: string;
      relationProperty?: string;
      isArray?: boolean;
      includeRelation?: boolean;
      relationEntityName?: string;
      relationPropertyObjectFields?: Array<{ name?: string }>;
      objectFields?: Array<{ name?: string }>;
    };
    if (!f?.name) return '';
    return new Handlebars.SafeString(emitFeTableRowCellJsx(f, 'item'));
  });

  Handlebars.registerHelper('feTableFilterFieldAttrs', (field: unknown) =>
    new Handlebars.SafeString(emitFeTableFilterFieldAttrs(field))
  );

  Handlebars.registerHelper('feTableNeedsAvatar', (fields: unknown) => feTableNeedsAvatarFields(fields));

  /** Table columns with `showInTable` + Actions column (for empty-state row colspan). */
  Handlebars.registerHelper('feTableShowInTableColumnCount', (fields: unknown) => {
    if (!Array.isArray(fields)) return 1;
    const n = (fields as { showInTable?: boolean }[]).filter(f => f && f.showInTable !== false).length;
    return n + 1;
  });

  Handlebars.registerHelper('feTableFilterNormalizeFunction', (fields: unknown) =>
    new Handlebars.SafeString(emitFeTableFilterNormalizeFunction(fields))
  );

  Handlebars.registerHelper('hasSearchableRelationFields', (fields: unknown) => hasSearchableRelationFields(fields));

  Handlebars.registerHelper('feTableRelationOptionImports', (fields: unknown, isAdminUser: unknown) =>
    new Handlebars.SafeString(emitFeTableRelationOptionImports(fields, isAdminUser))
  );

  Handlebars.registerHelper('feTableRelationSupportCode', (fields: unknown) =>
    new Handlebars.SafeString(emitFeTableRelationSupportCode(fields))
  );

  Handlebars.registerHelper('feSliceUpdateFulfilledBody', (sourceType: unknown) => {
    if (String(sourceType) === 'nodejs-mongoose') {
      return new Handlebars.SafeString(`        const index = state.items.findIndex(item => item._id === action.payload.data._id);
        if (index !== -1) {
          state.items[index] = action.payload.data;
        }
        if (state.currentItem && state.currentItem._id === action.payload.data._id) {
          state.currentItem = action.payload.data;
        }`);
    }
    return new Handlebars.SafeString(`        const index = state.items.findIndex(item => item.id === action.payload.data.id);
        if (index !== -1) {
          state.items[index] = action.payload.data;
        }
        if (state.currentItem && state.currentItem.id === action.payload.data.id) {
          state.currentItem = action.payload.data;
        }`);
  });

  Handlebars.registerHelper('feSliceDeleteFulfilledBody', (sourceType: unknown) => {
    if (String(sourceType) === 'nodejs-mongoose') {
      return new Handlebars.SafeString(`        const deletedId = action.payload.data;
        state.items = state.items.filter(item => item._id !== deletedId);
        if (state.currentItem && state.currentItem._id === deletedId) {
          state.currentItem = null;
        }`);
    }
    return new Handlebars.SafeString(`        const deletedId = action.payload.data;
        state.items = state.items.filter(item => item.id !== deletedId);
        if (state.currentItem && state.currentItem.id === deletedId) {
          state.currentItem = null;
        }`);
  });

  registerFeTableTemplateFragments();
}

/** @deprecated Prefer `registerFrontendHandlebarsHelpers` */
export const registerFeTemplateHelpers = registerFrontendHandlebarsHelpers;
