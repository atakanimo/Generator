/**
 * D1: lays down a .NET 10 + EF Core host (plan backend-dotnet-efcore §3, §7).
 *
 * - Skeleton (`_skeleton/`): solution, props, 4 projects + tests, Program.cs, DependencyInjection.cs, AppDbContext.cs. K: once.
 * - Core assets (`<Layer>/Common/**`): created when missing, never overwritten.
 * - Provider layer (`providers/<db>/`, plan backend-dotnet-database-providers K4): same paths as the two above; its
 *   files replace the common ones (packages, DI, startup, connection string, database-specific assets).
 * - Id layer (`ids/<idType>/`, K6) on top: `EntityId` alias (`Directory.Build.props`) and `EntityIds`. A host made
 *   before K6 (props without the alias) gets the layer's `<ItemGroup>` added to its props; the rest stays as is.
 * - Registry G files: rewritten from the module list (empty for a fresh host).
 * - A host made before K6 also gets the `{id:entityid}` registration in its `ApiSetup.cs`.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
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
  const files: WrittenFile[] = [...copyAssetTrees(trees('_skeleton'), root, app), ...ensureEntityIdAlias(root, assets, idType)];
  for (const layer of DOTNET_LAYERS) {
    files.push(...copyAssetTrees(trees(layer), layout.projectDir(layer), app));
  }
  files.push(...ensureEntityIdRouteConstraint(layout.projectDir('Api')));
  return files;
}

/**
 * K6 route constraint in a host made before it: generated endpoints use `{id:entityid}`, the old `ApiSetup.cs`
 * (create-only asset, often edited by the host) does not register it. Only the asset's registration line is inserted
 * after the exception handler; the rest of the file stays as is.
 */
function ensureEntityIdRouteConstraint(apiDir: string): WrittenFile[] {
  const path = join(apiDir, 'Common', 'ApiSetup.cs');
  if (!existsSync(path)) return [];
  const cs = readFileSync(path, 'utf8');
  if (cs.includes('EntityIdRouteConstraint')) return [];
  const anchor = /^([ \t]*)services\.AddExceptionHandler<ContractExceptionHandler>\(\);\r?\n/m.exec(cs);
  if (!anchor) throw new Error(`${path}: {id:entityid} kısıtı kaydedilemedi (AddExceptionHandler satırı yok); satırı elle ekleyin.`);
  const line = `${anchor[1]}services.Configure<RouteOptions>(options => options.SetParameterPolicy<EntityIdRouteConstraint>(EntityIdRouteConstraint.Name));\n`;
  const at = anchor.index + anchor[0].length;
  writeFileSync(path, `${cs.slice(0, at)}${line}${cs.slice(at)}`);
  return [{ path, action: 'updated' }];
}

/**
 * K6 alias in a host made before it: generated code uses `EntityId`, the old props has no `<Using … Alias="EntityId">`.
 * Only the id layer's `<ItemGroup>` is inserted before `</Project>`; a props that already has the alias is untouched.
 */
function ensureEntityIdAlias(root: string, assets: string, idType: BackendIdType): WrittenFile[] {
  const path = join(root, 'Directory.Build.props');
  if (!existsSync(path)) return [];
  const xml = readFileSync(path, 'utf8');
  if (/\bAlias\s*=\s*["']EntityId["']/.test(xml.replace(/<!--[\s\S]*?-->/g, ''))) return [];
  const layer = readFileSync(join(assets, 'ids', idType, '_skeleton', 'Directory.Build.props'), 'utf8');
  const group = /^[ \t]*<ItemGroup>(?:(?!<\/ItemGroup>)[\s\S])*Alias="EntityId"[\s\S]*?<\/ItemGroup>\r?\n/m.exec(layer);
  const end = xml.lastIndexOf('</Project>');
  if (!group || end < 0) throw new Error(`${path}: EntityId takma adı eklenemedi (<Project> kökü yok).`);
  writeFileSync(path, `${xml.slice(0, end)}${group[0]}${xml.slice(end)}`);
  return [{ path, action: 'updated' }];
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
