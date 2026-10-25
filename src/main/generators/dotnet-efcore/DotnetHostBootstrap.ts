/**
 * D1: lays down a .NET 10 + EF Core host (plan backend-dotnet-efcore §3, §7).
 *
 * - Skeleton (`_skeleton/`): solution, props, 4 projects + tests, Program.cs, DependencyInjection.cs, AppDbContext.cs. K: once.
 * - Core assets (`<Layer>/Common/**`): created when missing, never overwritten.
 * - Provider layer (`providers/<db>/`, plan backend-dotnet-database-providers K4): same paths as the two above; its
 *   files replace the common ones (packages, DI, startup, connection string, database-specific assets).
 * - Id layer (`ids/<idType>/`, K6) on top: `EntityId` alias (`Directory.Build.props`) and `EntityIds`.
 * - Registry G files: rewritten from the module list (empty for a fresh host).
 */
import { join } from 'path';
import type { BackendIdType, HostDatabase } from '../../../shared/backendDatabase.js';
import { DOTNET_LAYERS, REGISTRY_FILES, dotnetLayout, isValidAppName } from './dotnetLayout.js';
import { WrittenFile, copyAssetTrees, dotnetAssetsDir, renderDotnetTemplate, writeGenerated } from './dotnetFiles.js';
import { dotnetDbProvider, type DotnetDbProvider } from './providers/index.js';

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

/** Skeleton + core assets with the provider and id layers (create-only); no registry files. */
export function ensureDotnetHost(root: string, app: string, provider: DotnetDbProvider, idType: BackendIdType): WrittenFile[] {
  if (!isValidAppName(app)) throw new Error(`Invalid .NET app name (PascalCase, letters / digits): ${app}`);
  const assets = dotnetAssetsDir();
  const trees = (dir: string) => [join(assets, dir), join(assets, 'providers', provider.assetDir, dir), join(assets, 'ids', idType, dir)];
  const layout = dotnetLayout(root, app);
  const files: WrittenFile[] = [...copyAssetTrees(trees('_skeleton'), root, app)];
  for (const layer of DOTNET_LAYERS) {
    files.push(...copyAssetTrees(trees(layer), layout.projectDir(layer), app));
  }
  return files;
}

/** Fresh host with empty registries. */
export function bootstrapDotnetHost(root: string, app: string, db: HostDatabase): DotnetBootstrapResult {
  return { files: [...ensureDotnetHost(root, app, dotnetDbProvider(db), db.idType), ...writeDotnetRegistries(root, app, [])] };
}

export function writeDotnetRegistries(root: string, app: string, modules: DotnetRegistryModule[]): WrittenFile[] {
  const layout = dotnetLayout(root, app);
  const sorted = [...modules].sort((a, b) => a.folder.localeCompare(b.folder));
  return REGISTRY_FILES.map(({ template, layer, path }) =>
    writeGenerated(join(layout.projectDir(layer), path), renderDotnetTemplate(template, { app, modules: sorted }))
  );
}
