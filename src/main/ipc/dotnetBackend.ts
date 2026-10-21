/**
 * .NET EF Core backend from the app (plan backend-dotnet-efcore §7, D5): host detection, model list (entity files +
 * manifest rows), generate, model editor create / update, new host bootstrap.
 *
 * A module's model is the merge of its entity file (`parseDotnetEntity`) and its manifest row; the registry files
 * need the host's whole module list, so every generate regenerates all Generator-owned modules.
 */
import { existsSync } from 'fs';
import { join } from 'path';
import type { NormalizedModel } from '../../shared/normalizedModel.js';
import type { ModelDraft } from '../../shared/modelDraft.js';
import type { GenerateBackendResult } from '../../shared/ipcTypes.js';
import { mergeModel } from '../../shared/modelMerge.js';
import { generateDotnetModules } from '../generators/dotnet-efcore/DotnetEfGenerator.js';
import { bootstrapDotnetHost } from '../generators/dotnet-efcore/DotnetHostBootstrap.js';
import { DotnetUnsupportedError, dotnetModuleNames } from '../generators/dotnet-efcore/dotnetContext.js';
import { isValidAppName } from '../generators/dotnet-efcore/dotnetLayout.js';
import { DotnetHost, findDotnetHost, listDotnetEntityFiles } from '../parsers/dotnet/dotnetHost.js';
import { parseDotnetEntity } from '../parsers/dotnet/entityParser.js';
import {
  findManifestModelByRelativePath,
  toProjectRelativePath,
  writeWorkspaceManifestUpdate
} from '../utils/manifestSnapshot.js';
import { log } from '../utils/logger.js';

export interface DotnetModelEntry {
  path: string;
  relativePath: string;
  model: NormalizedModel;
}

function requireHost(root: string): DotnetHost {
  const host = findDotnetHost(root);
  if (!host) throw new Error('.NET host bulunamadı: kökte <App>.slnx / .sln ve src/<App>.Domain gerekli.');
  return host;
}

/** Entity class → module folder for every entity of the host (reference targets). */
export function dotnetEntityFolders(host: DotnetHost): Map<string, string> {
  return new Map(listDotnetEntityFiles(host).map((f) => [f.fileName.replace(/\.cs$/, ''), f.folder]));
}

/** Entity file path of a model (`src/<App>.Domain/<Folder>/<Entity>.cs`). */
export function dotnetEntityPath(host: DotnetHost, entityName: string): string {
  const { entity, folder } = dotnetModuleNames(entityName);
  return join(host.root, 'src', `${host.app}.Domain`, folder, `${entity}.cs`);
}

/** Parsed entity merged with its manifest row (the editor's model). */
export function loadDotnetModel(host: DotnetHost, filePath: string, folders = dotnetEntityFolders(host)): NormalizedModel {
  const rel = toProjectRelativePath(host.root, filePath);
  return mergeModel(parseDotnetEntity(filePath, folders), findManifestModelByRelativePath(host.root, rel), 'dotnet-ef');
}

/** Generator-owned modules of the host (hand-written entities are left out: they are user code). */
export function loadDotnetModels(host: DotnetHost): DotnetModelEntry[] {
  const folders = dotnetEntityFolders(host);
  return listDotnetEntityFiles(host)
    .filter((f) => f.generated)
    .map((f) => ({ path: f.path, relativePath: toProjectRelativePath(host.root, f.path), model: loadDotnetModel(host, f.path, folders) }));
}

function migrationNote(host: DotnetHost): string {
  return `Şema değiştiyse migration ekleyin: dotnet ef migrations add <Ad> -p src/${host.app}.Infrastructure -s src/${host.app}.Api`;
}

/** Regenerates every module with `schema` replacing (or added to) its own entry. */
export function generateDotnetBackend(projectPath: string, schema: NormalizedModel): GenerateBackendResult & { filePath?: string } {
  try {
    const host = requireHost(projectPath);
    const own = dotnetEntityPath(host, schema.entityName);
    const models = loadDotnetModels(host).filter((m) => m.path !== own && m.model.entityName !== schema.entityName).map((m) => m.model);
    const result = generateDotnetModules(host.root, host.app, [...models, schema]);
    const changed = result.files.filter((f) => f.action === 'created' || f.action === 'updated');
    const ctx = result.modules.find((m) => m.entity === dotnetModuleNames(schema.entityName).entity);
    const notes = [migrationNote(host)];
    if (ctx?.droppedOperations.length) {
      notes.unshift(`Sözleşme gereği kapatılan normal işlemler: ${ctx.droppedOperations.join(', ')} (ownership ${ctx.ownership ? ctx.ownership.kind : 'yok'}).`);
    }
    const skipped = result.files.filter((f) => f.action === 'skipped-user-owned');
    if (skipped.length) notes.push(`Başlıksız (elle yazılmış) dosyalar atlandı: ${skipped.map((f) => toProjectRelativePath(host.root, f.path)).join(', ')}`);
    log(`[dotnet] generate ${schema.entityName}: ${changed.length} file(s) written`, 'info');
    return {
      success: true,
      filePath: own,
      files: { model: toProjectRelativePath(host.root, own) },
      writtenFiles: changed.map((f) => toProjectRelativePath(host.root, f.path)),
      notes
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log(`[dotnet] generate failed: ${message}`, error instanceof DotnetUnsupportedError ? 'warn' : 'error');
    return { success: false, error: message };
  }
}

/** Model editor (create / update): the draft becomes the manifest row, then the module is generated. */
export function writeDotnetModel(projectPath: string, draft: ModelDraft): { success: boolean; filePath?: string; error?: string } {
  try {
    const host = requireHost(projectPath);
    const filePath = dotnetEntityPath(host, draft.model.entityName);
    const stash = writeWorkspaceManifestUpdate(host.root, {
      event: 'stash',
      model: { schema: draft.model, sourceRelativePath: toProjectRelativePath(host.root, filePath) },
      workspace: { backendStack: 'dotnet-ef' }
    });
    if (!stash.success) return { success: false, error: stash.error };
    const generated = generateDotnetBackend(host.root, draft.model);
    return generated.success ? { success: true, filePath } : { success: false, error: generated.error };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export function loadDotnetModelDraft(filePath: string, projectPath?: string): { success: boolean; draft?: ModelDraft; error?: string } {
  try {
    const host = requireHost(projectPath ?? join(filePath, '..', '..', '..', '..'));
    const model = loadDotnetModel(host, filePath);
    return { success: true, draft: { model: { ...model, fields: model.fields.filter((f) => f.name !== 'createdAt' && f.name !== 'updatedAt') } } };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/** New host in an empty (or new) folder; the manifest records the stack. */
export function bootstrapDotnetProject(root: string, app: string): { success: boolean; files?: string[]; error?: string } {
  try {
    if (!isValidAppName(app)) return { success: false, error: 'Uygulama adı PascalCase olmalı (harf / rakam), ör. SharedFrame.' };
    if (existsSync(join(root, `${app}.slnx`)) || existsSync(join(root, `${app}.sln`))) {
      return { success: false, error: `${app} çözümü bu klasörde zaten var.` };
    }
    const result = bootstrapDotnetHost(root, app);
    writeWorkspaceManifestUpdate(root, { event: 'workspace', workspace: { backendStack: 'dotnet-ef' } });
    return { success: true, files: result.files.filter((f) => f.action === 'created').map((f) => toProjectRelativePath(root, f.path)) };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
