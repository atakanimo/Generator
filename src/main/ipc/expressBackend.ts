/**
 * Express + Mongoose new-host bootstrap from the app (plan backend-python-fastapi PY9, IPC `project:bootstrapExpress`).
 * Generate, scan and the model editor use the existing Express path (`BackendGenerator`, `modelCreator`).
 */
import { existsSync } from 'fs';
import { join } from 'path';
import { onlyHostDatabase } from '../../shared/backendDatabase.js';
import { AUTH_USERS_ENTITY, buildAuthUsersModel, normalizeAuthModules, type AuthBootstrapOptions, type AuthModule } from '../../shared/authModules.js';
import { bootstrapExpressAuth } from '../generators/express-mongoose/ExpressAuthBootstrap.js';
import { bootstrapExpressHost, toExpressPackageName } from '../generators/express-mongoose/ExpressHostBootstrap.js';
import { buildAuthSeedAdmin } from '../utils/authSeed.js';
import {
  existingHostError,
  recordWorkspaceManifestUpsert,
  toProjectRelativePath,
  writeWorkspaceManifestUpdate
} from '../utils/manifestSnapshot.js';
import { log } from '../utils/logger.js';
import { generateBackend } from './backendGenerator.js';
import { createModel } from './modelCreator.js';

export interface ExpressBootstrapResponse {
  success: boolean;
  /** npm package name written to `package.json`. */
  package?: string;
  files?: string[];
  error?: string;
}

/**
 * New host in an empty (or new) folder; refused when the folder already has a `package.json`. With the shared auth
 * layer (docs/backend/auth.md): auth files for the picked modules, first admin seed, and the `Users` model (manifest
 * row + generated module, admin router mounted).
 */
export async function bootstrapExpressProject(root: string, app: string, auth: AuthBootstrapOptions): Promise<ExpressBootstrapResponse> {
  try {
    const modules = normalizeAuthModules(auth.modules);
    const admin = buildAuthSeedAdmin(auth.admin);
    const pkg = toExpressPackageName(app);
    if (!pkg) return { success: false, error: 'Uygulama adı geçerli bir npm paket adına çevrilemedi (harfle başlamalı), ör. OrdersApi → orders-api.' };
    if (existsSync(join(root, 'package.json'))) return { success: false, error: 'Bu klasörde zaten bir package.json var.' };
    const hostError = existingHostError(root);
    if (hostError) return { success: false, error: hostError };
    const result = bootstrapExpressHost(root, app.trim(), pkg);
    const authFiles = bootstrapExpressAuth(root, app.trim(), pkg, modules, admin);
    writeWorkspaceManifestUpdate(root, {
      event: 'workspace',
      workspace: { backendStack: 'nodejs-mongoose', ...onlyHostDatabase('nodejs-mongoose'), auth: { modules } }
    });
    const usersError = await generateUsersModule(root, modules);
    if (usersError) return { success: false, error: `Users modeli üretilemedi: ${usersError}` };
    const created = [...result.files, ...authFiles.files]
      .filter((f) => f.action === 'created')
      .map((f) => toProjectRelativePath(root, f.path));
    log(`[express] bootstrap ${pkg}: ${created.length} file(s)`, 'info');
    return { success: true, package: pkg, files: created };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/** `Users` the model editor's way (model file + manifest row), then generate with the full model (access rules). */
async function generateUsersModule(root: string, modules: readonly AuthModule[]): Promise<string | null> {
  const model = buildAuthUsersModel(modules);
  const created = await createModel(root, 'nodejs-mongoose', { model });
  if (!created.success || !created.filePath) return created.error ?? 'createModel';
  const gen = generateBackend(model, root, false, 'nodejs-mongoose', true, '/api', true, true, undefined);
  if (!gen.success) return gen.error ?? 'generateBackend';
  const saved = recordWorkspaceManifestUpsert(root, model, toProjectRelativePath(root, created.filePath), 'generate');
  if (!saved.success) return saved.error ?? 'manifest';
  log(`[express] ${AUTH_USERS_ENTITY} generated`, 'info');
  return null;
}
