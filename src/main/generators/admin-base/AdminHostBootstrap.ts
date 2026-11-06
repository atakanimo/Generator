/**
 * Lays down an `@atakanimo/ata-admin-base` admin panel (docs/frontend/admin-host.md), the shell the Varlik360 /
 * SharedFrame admins share: theme, left menu (`createAdminRoutes(resources)`), login, Redux store (theme, auth,
 * loading), axios interceptor, i18n (tr / en), hooks. Modules come later from `AdminConfigGenerator`.
 *
 * Skeleton (`_skeleton/`, K: created once, never overwritten), tokens:
 * `__App__` = panel name as given, `__app__` = npm package name, `__API_PREFIX__` / `__API_DEV_URL__` = backend defaults
 * of the chosen stack (`ADMIN_BACKEND_DEFAULTS`).
 */
import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { getGeneratorAssetsDir } from '../../utils/templateHelpers.js';
import { WrittenFile, listFiles, writeOnce } from '../dotnet-efcore/dotnetFiles.js';
import { toExpressPackageName } from '../express-mongoose/ExpressHostBootstrap.js';
import type { AdminBackendDefaults } from '../../../shared/adminPanel.js';

/** `OrdersAdmin` → `orders-admin`, `OrdersApi` → `orders-api-admin`; `null` when the name cannot be an npm name. */
export function toAdminPackageName(app: string): string | null {
  const name = toExpressPackageName(app);
  if (!name) return null;
  return /(^|-)admin$/.test(name) ? name : `${name}-admin`;
}

export function adminSkeletonDir(): string {
  return join(getGeneratorAssetsDir('admin-base'), '_skeleton');
}

/** Skeleton files (create-only), tokens replaced in paths and contents. */
export function bootstrapAdminHost(root: string, app: string, pkg: string, backend: AdminBackendDefaults): { files: WrittenFile[] } {
  const tokens: Array<[string, string]> = [
    ['__App__', app],
    ['__app__', pkg],
    ['__API_PREFIX__', backend.apiPrefix],
    ['__API_DEV_URL__', backend.devUrl]
  ];
  const apply = (text: string) => tokens.reduce((out, [token, value]) => out.split(token).join(value), text);
  const skeleton = adminSkeletonDir();
  const files = listFiles(skeleton).map((file) => writeOnce(join(root, apply(relative(skeleton, file))), apply(readFileSync(file, 'utf8'))));
  return { files };
}
