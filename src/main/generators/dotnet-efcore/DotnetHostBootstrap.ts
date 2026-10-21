/**
 * D1: lays down a .NET 10 + EF Core host (plan backend-dotnet-efcore §3, §7).
 *
 * - Skeleton (`_skeleton/`): solution, props, 4 projects + tests, Program.cs, DependencyInjection.cs, AppDbContext.cs. K: once.
 * - Core assets (`<Layer>/Common/**`): created when missing, never overwritten.
 * - Registry G files: rewritten from the module list (empty for a fresh host).
 */
import { join } from 'path';
import { DOTNET_LAYERS, REGISTRY_FILES, dotnetLayout, isValidAppName } from './dotnetLayout.js';
import { WrittenFile, copyAssetTree, dotnetAssetsDir, renderDotnetTemplate, writeGenerated } from './dotnetFiles.js';

/** One module as the registry files see it (filled by DotnetEfGenerator from D2 on). */
export interface DotnetRegistryModule {
  entity: string;
  folder: string;
  hasNormalEndpoints: boolean;
  hasAdmin: boolean;
  /** Full C# statements for `AddGenerated` (services, hooks, validators). */
  registrations: string[];
}

export interface DotnetBootstrapResult {
  files: WrittenFile[];
}

/** Skeleton + core assets (create-only); no registry files. */
export function ensureDotnetHost(root: string, app: string): WrittenFile[] {
  if (!isValidAppName(app)) throw new Error(`Invalid .NET app name (PascalCase, letters / digits): ${app}`);
  const assets = dotnetAssetsDir();
  const layout = dotnetLayout(root, app);
  const files: WrittenFile[] = [...copyAssetTree(join(assets, '_skeleton'), root, app)];
  for (const layer of DOTNET_LAYERS) {
    files.push(...copyAssetTree(join(assets, layer), layout.projectDir(layer), app));
  }
  return files;
}

/** Fresh host with empty registries. */
export function bootstrapDotnetHost(root: string, app: string): DotnetBootstrapResult {
  return { files: [...ensureDotnetHost(root, app), ...writeDotnetRegistries(root, app, [])] };
}

export function writeDotnetRegistries(root: string, app: string, modules: DotnetRegistryModule[]): WrittenFile[] {
  const layout = dotnetLayout(root, app);
  const sorted = [...modules].sort((a, b) => a.folder.localeCompare(b.folder));
  return REGISTRY_FILES.map(({ template, layer, path }) =>
    writeGenerated(join(layout.projectDir(layer), path), renderDotnetTemplate(template, { app, modules: sorted }))
  );
}
