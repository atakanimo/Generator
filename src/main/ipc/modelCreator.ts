import { readFileSync } from 'fs';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import Handlebars from 'handlebars';
import { getTemplatesDir, registerHandlebarsHelpers } from '../utils/templateHelpers.js';
import { log } from '../utils/logger.js';
import { moduleNameFromEntity, pascalCase } from '../utils/namingUtils.js';
import { applyCustomBlockMerge } from '../utils/customBlockMerge.js';
import { getCustomBlockMarkersPresentInSource, getDefaultCustomBlockMarkerNames } from '../utils/customBlockMarkers.js';
import { scanBalancedDelimiters } from '../utils/mongooseSchemaExtract.js';
import type { NormalizedField } from '../../shared/normalizedModel.js';
import {
  editorSubTypeOf,
  editorTypeOf,
  isReservedFieldName,
  SYNTHETIC_FIELD_NAMES,
  type EditorFieldType,
  type EditorSubFieldType,
  type ModelDraft
} from '../../shared/modelDraft.js';
import { isGeneratorOwnedSource, USER_OWNED_FILE_MESSAGE } from '../utils/generatedFileOwnership.js';
import { SourceType } from './projectScanner.js';
import { parseNormalizedModel } from './schemaParser.js';
import { buildMongooseModelContext } from '../utils/mongooseModelContext.js';

export type { ModelDraft } from '../../shared/modelDraft.js';

export interface CreateModelResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export interface UpdateModelResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

function escapeJsString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function formatScalarInitLiteral(type: EditorFieldType | EditorSubFieldType, value: unknown, trim?: boolean): string {
  if (value === undefined || value === null || value === '') {
    if (type === 'Number') return '0';
    if (type === 'Boolean') return 'false';
    if (type === 'Array') return '[]';
    return "''";
  }

  if (type === 'Number') {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isNaN(n) ? '0' : String(n);
  }

  if (type === 'Boolean') {
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return String(value).toLowerCase() === 'true' ? 'true' : 'false';
  }

  if (type === 'Array') return '[]';

  const str = trim ? String(value).trim() : String(value);
  return `'${escapeJsString(str)}'`;
}

function formatInitFieldLiteral(field: NormalizedField, value: unknown): string {
  const subs = field.kind === 'object' ? field.object?.fields : undefined;
  if (subs?.length) {
    const obj =
      value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    const parts = subs.map(sub => `${sub.name}: ${formatScalarInitLiteral(editorSubTypeOf(sub), obj[sub.name], sub.trim)}`);
    return `{ ${parts.join(', ')} }`;
  }

  return formatScalarInitLiteral(editorTypeOf(field), value, field.trim);
}

function parseSimpleObjectLiteral(raw: string): Record<string, string> {
  const inner = raw.trim().replace(/^\{|\}$/g, '').trim();
  const out: Record<string, string> = {};
  if (!inner) return out;

  const pairPattern = /(\w+)\s*:\s*('(?:\\'|[^'])*'|"(?:\\"|[^"])*"|[^,}]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pairPattern.exec(inner)) !== null) {
    let val = match[2].trim();
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      val = val.slice(1, -1);
    }
    out[match[1]] = val;
  }
  return out;
}

/** One `defaultData` row: `field: 'value'`, `field: { sub: 'value' }`, `field: 42` (values kept as written). */
function parseSeedRow(objectContent: string): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const fieldPattern = /(\w+)\s*:\s*(\{[^}]*\}|'(?:\\'|[^'])*'|"(?:\\"|[^"])*"|[^,}]+)/g;
  let fieldMatch: RegExpExecArray | null;
  while ((fieldMatch = fieldPattern.exec(objectContent)) !== null) {
    const value = fieldMatch[2].trim();
    if (value.startsWith('{')) {
      row[fieldMatch[1]] = parseSimpleObjectLiteral(value);
    } else if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      row[fieldMatch[1]] = value.slice(1, -1);
    } else {
      row[fieldMatch[1]] = value;
    }
  }
  return row;
}

/** Rows of the `initialize<Model>()` seed function (`const defaultData = [ … ]`); null when the file has none. */
function parseModelSeed(content: string): Array<Record<string, unknown>> | null {
  const initializeMatch = /export\s+const\s+initialize\w+\s*=\s*async\s*\(\)\s*:\s*Promise<void>\s*=>\s*\{/.exec(content);
  if (!initializeMatch) return null;

  const bodyOpen = initializeMatch.index + initializeMatch[0].length - 1;
  const bodyEnd = scanBalancedDelimiters(content, bodyOpen);
  const functionBody = bodyEnd < 0 ? '' : content.substring(bodyOpen + 1, bodyEnd - 1);

  const rows: Array<Record<string, unknown>> = [];
  const dataArrayContent = /const\s+defaultData\s*=\s*\[([\s\S]*?)\];/.exec(functionBody)?.[1];
  if (!dataArrayContent) return rows;

  for (let i = 0; i < dataArrayContent.length; i++) {
    if (dataArrayContent[i] !== '{') continue;
    const end = scanBalancedDelimiters(dataArrayContent, i);
    if (end < 0) break;
    const row = parseSeedRow(dataArrayContent.substring(i + 1, end - 1));
    if (Object.keys(row).length > 0) rows.push(row);
    i = end - 1;
  }
  return rows;
}

/** `id` / `_id` are the record identity (contract K1) — a model field must not take them. */
function reservedFieldNameError(draft: ModelDraft): string | null {
  const taken = draft.model.fields.filter(f => isReservedFieldName(f.name)).map(f => f.name.trim());
  return taken.length > 0
    ? `'${taken[0]}' alan adı ayrılmıştır: JSON'da kayıt kimliği her zaman \`id\` (sözleşme K1). Alanı yeniden adlandırın.`
    : null;
}

/**
 * Render a Mongoose model through the shared v2 context (same builder as backend generation, R6). Fields the
 * user did not touch in the editor are the parsed fields, so file-only details (enum, default, verbatim
 * options, declared TS types, JSDoc, `select: false`, mongoose model name) survive.
 */
function generateMongooseModel(draft: ModelDraft, existingModelContent?: string): string {
  const { model, seed } = draft;
  const modelName = model.entityName.trim();
  const pascalName = pascalCase(modelName);
  const fields = model.fields;

  const hasValueField = fields.some(f => f.name === 'value');
  const displayTextField = fields.find(f => f.name === 'displayText');
  const displayTextType = displayTextField ? editorTypeOf(displayTextField) : undefined;
  const hasModelTypePattern = hasValueField && (displayTextType === 'String' || displayTextType === 'Other');

  const initFields = fields.filter(f => !SYNTHETIC_FIELD_NAMES.includes(String(f.name).trim()));
  const templateInitializeData =
    seed?.data && seed.data.length > 0
      ? seed.data.map(item => ({
          initLines: initFields.map(f => `          ${f.name}: ${formatInitFieldLiteral(f, item[f.name])}`).join(',\n')
        }))
      : [];

  const context = buildMongooseModelContext(model, {
    pascalName,
    sourceType: 'nodejs-mongoose',
    existingContent: existingModelContent,
    timestampsFallback: { createdAt: false, updatedAt: false },
    modelName,
    interfaceExtends: hasModelTypePattern ? 'ModelType, Document' : 'Document',
    hasModelTypePattern,
    initialize: seed ? { functionName: `initialize${pascalName}`, data: templateInitializeData } : undefined
  });

  registerHandlebarsHelpers();
  const templatePath = join(getTemplatesDir('backend-express-mongoose'), 'model.hbs');
  if (!existsSync(templatePath)) {
    throw new Error(`Template file not found: ${templatePath}`);
  }
  // Source code, not HTML (plan 5 R1).
  const template = Handlebars.compile(readFileSync(templatePath, 'utf-8'), { noEscape: true });
  return template(context);
}

/**
 * Module output dir for new Mongoose models — same layout as `BackendGenerator` / `scanModulesDirectory`.
 * e.g. `MobileAppConfig` → `src/modules/mobile-app-config/`
 */
async function ensureModuleDirectory(projectPath: string, moduleName: string): Promise<string | null> {
  const moduleDir = join(projectPath, 'src', 'modules', moduleName);
  try {
    await mkdir(moduleDir, { recursive: true });
    return moduleDir;
  } catch (error) {
    log(`Error creating module directory: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    return null;
  }
}

/**
 * A model file as the model editor shows it: the parsed v2 model without the fields the Generator adds itself,
 * plus the seed function rows.
 */
export function loadModelDraft(filePath: string, sourceType: SourceType): { success: boolean; draft?: ModelDraft; error?: string } {
  try {
    if (sourceType !== 'nodejs-mongoose') {
      return {
        success: false,
        error: 'Model parsing is currently only supported for Node.js (Mongoose) projects'
      };
    }

    const parsed = parseNormalizedModel(filePath, sourceType);
    if (!parsed.success || !parsed.model) {
      return { success: false, error: parsed.error || 'Failed to parse model file' };
    }

    const seedRows = parseModelSeed(readFileSync(filePath, 'utf-8'));
    const draft: ModelDraft = {
      model: { ...parsed.model, fields: parsed.model.fields.filter(f => !SYNTHETIC_FIELD_NAMES.includes(f.name)) }
    };
    if (seedRows) draft.seed = seedRows.length > 0 ? { data: seedRows } : {};
    return { success: true, draft };
  } catch (error) {
    log(`Error loading model draft: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Creates a new model file in the project
 */
export async function createModel(projectPath: string, sourceType: SourceType, draft: ModelDraft): Promise<CreateModelResult> {
  try {
    const reserved = reservedFieldNameError(draft);
    if (reserved) return { success: false, error: reserved };
    if (sourceType !== 'nodejs-mongoose') {
      return {
        success: false,
        error: 'Model creation is currently only supported for Node.js (Mongoose) projects'
      };
    }

    const moduleName = moduleNameFromEntity(draft.model.entityName);
    const moduleDir = await ensureModuleDirectory(projectPath, moduleName);
    if (!moduleDir) {
      return {
        success: false,
        error: 'Could not find or create module directory'
      };
    }

    const fileName = `${moduleName}.model.ts`;
    const filePath = join(moduleDir, fileName);
    if (existsSync(filePath)) {
      return {
        success: false,
        error: `Model file ${fileName} already exists`
      };
    }

    await writeFile(filePath, generateMongooseModel(draft), 'utf-8');
    log(`Model created successfully: ${filePath}`, 'info');
    return { success: true, filePath };
  } catch (error) {
    log(`Error creating model: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Updates an existing model file in the project
 */
export async function updateModel(filePath: string, sourceType: SourceType, draft: ModelDraft): Promise<UpdateModelResult> {
  try {
    const reserved = reservedFieldNameError(draft);
    if (reserved) return { success: false, error: reserved };
    if (sourceType !== 'nodejs-mongoose') {
      return {
        success: false,
        error: 'Model update is currently only supported for Node.js (Mongoose) projects'
      };
    }

    if (!existsSync(filePath)) {
      return {
        success: false,
        error: `Model file does not exist: ${filePath}`
      };
    }

    const existingContent = readFileSync(filePath, 'utf-8');
    if (!isGeneratorOwnedSource(existingContent)) {
      return { success: false, error: USER_OWNED_FILE_MESSAGE };
    }

    // Keep the seed rows when the editor kept the seed function but sent no rows
    let effectiveDraft = draft;
    if (draft.seed && !draft.seed.data?.length) {
      const rows = parseModelSeed(existingContent);
      if (rows?.length) effectiveDraft = { ...draft, seed: { data: rows } };
    }

    let modelContent = generateMongooseModel(effectiveDraft, existingContent);

    const markerNames = getCustomBlockMarkersPresentInSource(modelContent, getDefaultCustomBlockMarkerNames());
    if (markerNames.length > 0) {
      const mergeResult = applyCustomBlockMerge({
        existingContent,
        renderedContent: modelContent,
        markerNames
      });
      if (mergeResult.merged === null) {
        return {
          success: false,
          error: mergeResult.error || 'Failed to preserve custom blocks in model file'
        };
      }
      modelContent = mergeResult.merged;
    }

    await writeFile(filePath, modelContent, 'utf-8');
    log(`Model updated successfully: ${filePath}`, 'info');
    return { success: true, filePath };
  } catch (error) {
    log(`Error updating model: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
