/**
 * Reading the backend app file (`src/app.ts` / `src/index.ts` / `src/server.ts`): API base URL and router mounts.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { findDotnetHost } from '../parsers/dotnet/dotnetHost.js';
import { join } from 'path';
import { safePathExists, safeReadFile } from './fileUtils.js';
import { log } from './logger.js';
import { getProjectRootPath } from './templateHelpers.js';

/** API base URL from the first `/api…` mount (`/api/symbols` → `/api/symbols`, `/api` → `/api`); default `/api`. */
export function parseBaseUrlFromBackend(backendPath: string): string {
  try {
    const projectRoot = getProjectRootPath(backendPath);

    const possiblePaths = [
      join(projectRoot, 'src', 'index.ts'),
      join(projectRoot, 'src', 'app.ts'),
      join(projectRoot, 'src', 'server.ts'),
      join(projectRoot, 'index.ts'),
      join(projectRoot, 'app.ts'),
      join(projectRoot, 'server.ts')
    ];

    for (const path of possiblePaths) {
      if (safePathExists(path)) {
        const readResult = safeReadFile(path);
        if (readResult.success && readResult.content) {
          const matches = Array.from(readResult.content.matchAll(/app\.use\(['"]([^'"]+)['"]/g));

          if (matches.length > 0) {
            const apiRoutes = matches.map(m => m[1]).filter(p => p.startsWith('/api'));

            if (apiRoutes.length > 0) {
              const firstRoute = apiRoutes[0];
              const parts = firstRoute.split('/').filter(p => p);

              if (parts.length >= 1 && parts[0] === 'api') {
                if (parts.length >= 2) {
                  return `/${parts[0]}/${parts[1]}`;
                }
                return '/api';
              }

              return firstRoute;
            }
          }
        }
      }
    }

    return '/api'; // Default fallback
  } catch (error) {
    log(`Error parsing base URL from backend | ${JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' })}`, 'error');
    return '/api';
  }
}

const BE_APP_FILES = ['src/app.ts', 'src/index.ts', 'src/server.ts'];

/**
 * .NET host: `MapGroup("…/<module>")` in `src/<App>.Api/Endpoints/<Folder>/<Entity>Endpoints.cs` (normal) or
 * `…/<module>/admin` in `<Entity>AdminEndpoints.cs` (admin).
 */
function findDotnetMountPath(backendRoot: string, moduleName: string, kind: MountKind): string | null {
  const host = findDotnetHost(backendRoot);
  if (!host) return null;
  const endpoints = join(backendRoot, 'src', `${host.app}.Api`, 'Endpoints');
  if (!existsSync(endpoints)) return null;
  const suffix = kind === 'admin' ? `/${moduleName}/admin` : `/${moduleName}`;
  for (const folder of readdirSync(endpoints)) {
    const dir = join(endpoints, folder);
    if (!statSync(dir).isDirectory()) continue;
    const files = readdirSync(dir).filter(f =>
      kind === 'admin' ? f.endsWith('AdminEndpoints.cs') : f.endsWith('Endpoints.cs') && !f.endsWith('AdminEndpoints.cs')
    );
    for (const file of files) {
      const path = /MapGroup\(\s*"([^"]+)"/.exec(readFileSync(join(dir, file), 'utf-8'))?.[1];
      if (path && path.endsWith(suffix)) return path;
    }
  }
  return null;
}

type MountKind = 'admin' | 'normal';

function findMountPath(backendRoot: string, moduleName: string, kind: MountKind): string | null {
  const dotnet = findDotnetMountPath(backendRoot, moduleName, kind);
  if (dotnet) return dotnet;
  const routeFile = `${moduleName}.routes${kind === 'admin' ? '.admin' : ''}`.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  for (const rel of BE_APP_FILES) {
    const file = join(backendRoot, rel);
    if (!existsSync(file)) continue;
    const content = readFileSync(file, 'utf-8');
    const importMatch = new RegExp(`import\\s+(\\w+)\\s+from\\s+['"][^'"]*/${routeFile}['"]`).exec(content);
    if (!importMatch) continue;
    const useMatch = new RegExp(`app\\.use\\(\\s*['"]([^'"]+)['"][^)]*\\b${importMatch[1]}\\b`).exec(content);
    if (useMatch) return useMatch[1];
  }
  return null;
}

/**
 * Mount path of `<module>.routes.admin` in the BE app file, e.g. `/api/symboltypes/admin`. Read, not derived:
 * existing projects mount admin routers under inconsistent paths.
 */
export function findAdminMountPath(backendRoot: string, moduleName: string): string | null {
  return findMountPath(backendRoot, moduleName, 'admin');
}

/** Mount path of the normal (mobile / web) router `<module>.routes`, e.g. `/api/userWatchList`. */
export function findNormalMountPath(backendRoot: string, moduleName: string): string | null {
  return findMountPath(backendRoot, moduleName, 'normal');
}
