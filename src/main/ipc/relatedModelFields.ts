import { readFileSync } from 'fs';
import { listMongooseModelFiles, type ScannedModel, type SourceType } from './projectScanner.js';
import { parseNormalizedModel, entityNameFromModelFileName } from './schemaParser.js';
import { mergeModel } from '../../shared/modelMerge.js';
import { filterTokenOf, typeTokenOf } from '../../shared/fieldTypeToken.js';
import type { RelatedModelFieldInfo, RelatedModelFieldsResult } from '../../shared/ipcTypes.js';
import { findManifestModelByRelativePath, toProjectRelativePath } from '../utils/manifestSnapshot.js';
import type { NormalizedModel } from '../../shared/normalizedModel.js';
import { findDotnetHost, listDotnetEntityFiles } from '../parsers/dotnet/dotnetHost.js';
import { parseDotnetEntity } from '../parsers/dotnet/entityParser.js';

export type { RelatedModelFieldInfo, RelatedModelFieldsResult };

function mongooseRegisteredNamesInFile(content: string): string[] {
  const names = new Set<string>();
  const re = /mongoose\.model\s*(?:<[^>]*>)?\s*\(\s*['"]([^'"]+)['"]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    names.add(m[1].trim());
  }
  return [...names];
}

/** Lowercase stem from filename without .model.ts — for loose "user" vs "User" matching */
function filenameStemComparable(fileName: string): string {
  const base = fileName.replace(/\.model\.(ts|js)$/i, '').replace(/\.(ts|js)$/i, '');
  return base.replace(/[-_\s]/g, '').toLowerCase();
}

/**
 * Mongoose `ref` strings are often singular ('User') while files use plural stems (`users.model.ts`)
 * or `mongoose.model('Users', ...)`. Try a few variants before failing.
 */
function relationRefNameVariants(trimmed: string): string[] {
  const t = trimmed.trim();
  if (!t) return [];
  const out: string[] = [];
  const push = (s: string) => {
    if (s && !out.includes(s)) out.push(s);
  };
  push(t);
  const lower = t.toLowerCase();
  if (!lower.endsWith('s')) push(`${t}s`);
  if (lower.endsWith('s') && t.length > 1) push(t.slice(0, -1));
  return out;
}

function findRelatedModelMatchForRefString(
  models: ScannedModel[],
  refTry: string
): { model: ScannedModel; preferredMongooseModelName?: string } | undefined {
  const trimmed = refTry.trim();
  if (!trimmed) return undefined;

  const targetLower = trimmed.toLowerCase();
  const targetStem = trimmed.replace(/[-_\s]/g, '').toLowerCase();

  const byDerivedEntity = models.find(
    m => entityNameFromModelFileName(m.fileName).toLowerCase() === targetLower
  );
  if (byDerivedEntity) return { model: byDerivedEntity };

  const byFileStem = models.find(m => filenameStemComparable(m.fileName) === targetStem);
  if (byFileStem) return { model: byFileStem };

  for (const m of models) {
    try {
      const content = readFileSync(m.path, 'utf-8');
      const regs = mongooseRegisteredNamesInFile(content);
      const hit = regs.find(r => r.toLowerCase() === targetLower);
      if (hit) return { model: m, preferredMongooseModelName: hit };
    } catch {
      continue;
    }
  }

  return undefined;
}

function findRelatedModelMatch(
  models: ScannedModel[],
  trimmed: string
): { model: ScannedModel; preferredMongooseModelName?: string } | undefined {
  for (const variant of relationRefNameVariants(trimmed)) {
    const hit = findRelatedModelMatchForRefString(models, variant);
    if (hit) return hit;
  }
  return undefined;
}

export async function getRelatedModelFieldNames(
  projectPath: string,
  relationEntityName: string,
  sourceType: SourceType | null | undefined
): Promise<RelatedModelFieldsResult> {
  const trimmed = relationEntityName.trim();
  if (!trimmed) {
    return { success: false, error: 'Relation entity name is empty' };
  }

  if (sourceType === 'dotnet-ef') return dotnetRelatedFields(projectPath, trimmed);
  if (sourceType && sourceType !== 'nodejs-mongoose') {
    return {
      success: false,
      error: 'Related entity field discovery is only available for Node.js + Mongoose.'
    };
  }

  const models = await listMongooseModelFiles(projectPath);
  if (models.length === 0) {
    return {
      success: false,
      error:
        'No Mongoose model files (*.model.ts / *.model.js) found under src/ (recursive scan).'
    };
  }

  const match = findRelatedModelMatch(models, trimmed);
  if (!match) {
    const tried = relationRefNameVariants(trimmed).join('", "');
    return {
      success: false,
      error: `No related entity file found for "${trimmed}". Tried ref variants: "${tried}" against file stems, derived entity names, and mongoose.model('…') names under src/**/*.model.ts|js. Add a model file under src/ (e.g. user.model.ts) or align ref with mongoose.model('…', …).`
    };
  }

  const parsed = parseNormalizedModel(match.model.path, 'nodejs-mongoose', {
    preferredMongooseModelName: match.preferredMongooseModelName
  });
  if (!parsed.success || !parsed.model?.fields) {
    return {
      success: false,
      error: parsed.error || 'Failed to parse related model file',
      modelPath: match.model.path
    };
  }

  // Field config as the target's schema designer has it (manifest row, else defaults) — for the K3 warning.
  const row = findManifestModelByRelativePath(projectPath, toProjectRelativePath(projectPath, match.model.path));
  const merged = mergeModel(parsed.model, row, 'nodejs-mongoose');
  return { success: true, fields: relatedFieldInfos(parsed.model, merged), modelPath: match.model.path };
}

/** .NET host: target by module folder (`EventTypes`) or entity class (`EventType`). */
function dotnetRelatedFields(projectPath: string, name: string): RelatedModelFieldsResult {
  const host = findDotnetHost(projectPath);
  if (!host) return { success: false, error: '.NET host bulunamadı.' };
  const files = listDotnetEntityFiles(host);
  const variants = relationRefNameVariants(name).map(v => v.toLowerCase());
  const match = files.find(f => variants.includes(f.folder.toLowerCase()) || variants.includes(f.fileName.replace(/\.cs$/, '').toLowerCase()));
  if (!match) return { success: false, error: `"${name}" için entity bulunamadı (src/${host.app}.Domain/<Modül>/<Entity>.cs).` };
  const folders = new Map(files.map(f => [f.fileName.replace(/\.cs$/, ''), f.folder] as [string, string]));
  const parsed = parseDotnetEntity(match.path, folders);
  const row = findManifestModelByRelativePath(projectPath, toProjectRelativePath(projectPath, match.path));
  const merged = mergeModel(parsed, row, 'dotnet-ef');
  return { success: true, fields: relatedFieldInfos(parsed, merged), modelPath: match.path };
}

function relatedFieldInfos(parsedModel: NormalizedModel, merged: NormalizedModel): RelatedModelFieldInfo[] {
  const regexSearchable = new Set(
    merged.fields.filter(f => f.filter?.searchable && filterTokenOf(f.filter) === 'regex').map(f => f.name)
  );

  return parsedModel.fields
    .filter(f => typeof f.name === 'string' && f.name.length > 0 && f.name !== '__v')
    .map(f => ({
      name: f.name,
      type: typeTokenOf(f),
      regexSearchable: regexSearchable.has(f.name),
      objectFields:
        typeTokenOf(f).toLowerCase() === 'object' && Array.isArray(f.object?.fields)
          ? f.object.fields.map(sub => ({
              name: sub.name,
              type: typeTokenOf(sub),
              required: sub.required,
              trim: sub.trim,
            }))
          : undefined,
    }));
}
