/**
 * Express + Mongoose new-host bootstrap from the app (plan backend-python-fastapi PY9, IPC `project:bootstrapExpress`).
 * Generate, scan and the model editor use the existing Express path (`BackendGenerator`, `modelCreator`).
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { onlyHostDatabase } from '../../shared/backendDatabase.js';
import { bootstrapExpressHost, toExpressPackageName } from '../generators/express-mongoose/ExpressHostBootstrap.js';
import { existingHostError, toProjectRelativePath, writeWorkspaceManifestUpdate } from '../utils/manifestSnapshot.js';
import { log } from '../utils/logger.js';

export interface ExpressBootstrapResponse {
  success: boolean;
  /** npm package name written to `package.json`. */
  package?: string;
  files?: string[];
  error?: string;
}

/** New host in an empty (or new) folder; refused when the folder already has a `package.json`. */
export function bootstrapExpressProject(root: string, app: string): ExpressBootstrapResponse {
  try {
    const pkg = toExpressPackageName(app);
    if (!pkg) return { success: false, error: 'Uygulama adı geçerli bir npm paket adına çevrilemedi (harfle başlamalı), ör. OrdersApi → orders-api.' };
    if (existsSync(join(root, 'package.json'))) return { success: false, error: 'Bu klasörde zaten bir package.json var.' };
    const hostError = existingHostError(root);
    if (hostError) return { success: false, error: hostError };
    const result = bootstrapExpressHost(root, app.trim(), pkg);
    writeWorkspaceManifestUpdate(root, { event: 'workspace', workspace: { backendStack: 'nodejs-mongoose', ...onlyHostDatabase('nodejs-mongoose') } });
    const created = result.files.filter((f) => f.action === 'created').map((f) => toProjectRelativePath(root, f.path));
    log(`[express] bootstrap ${pkg}: ${created.length} file(s)`, 'info');
    return { success: true, package: pkg, files: created };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
