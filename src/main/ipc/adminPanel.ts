/**
 * New admin panel from the app (IPC `project:bootstrapAdmin`): alone ("Yeni Admin paneli") or right after a backend
 * bootstrap into `<host>/apps/admin` ("Admin paneli de kur"). Generate writes module configs into it later
 * (`AdminConfigGenerator`, `adminDir`).
 */
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { ADMIN_BACKEND_DEFAULTS } from '../../shared/adminPanel.js';
import type { BackendStack } from '../../shared/backendDatabase.js';
import { bootstrapAdminHost, toAdminPackageName } from '../generators/admin-base/AdminHostBootstrap.js';
import { toProjectRelativePath } from '../utils/manifestSnapshot.js';
import { log } from '../utils/logger.js';
import type { BootstrapProjectResult } from '../../shared/ipcTypes.js';

/** Panel in an empty (or new) folder; refused when the folder already has a `package.json` or a `src/` folder. */
export function bootstrapAdminProject(root: string, app: string, stack: BackendStack): BootstrapProjectResult {
  try {
    const pkg = toAdminPackageName(app);
    if (!pkg) return { success: false, error: 'Panel adı geçerli bir npm paket adına çevrilemedi (harfle başlamalı), ör. OrdersAdmin → orders-admin.' };
    const backend = ADMIN_BACKEND_DEFAULTS[stack];
    if (!backend) return { success: false, error: `Bilinmeyen backend: ${stack}` };
    if (existsSync(join(root, 'package.json'))) return { success: false, error: 'Bu klasörde zaten bir package.json var.' };
    if (existsSync(join(root, 'src')) && readdirSync(join(root, 'src')).length > 0) return { success: false, error: 'Bu klasörde dolu bir src/ klasörü var.' };
    const result = bootstrapAdminHost(root, app.trim(), pkg, backend);
    const created = result.files.filter((f) => f.action === 'created').map((f) => toProjectRelativePath(root, f.path));
    log(`[admin] bootstrap ${pkg} (${stack}): ${created.length} file(s)`, 'info');
    return { success: true, package: pkg, files: created };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
