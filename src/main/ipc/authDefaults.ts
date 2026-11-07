/**
 * First-admin defaults of the "Yeni … projesi" dialog (docs/backend/auth.md "İlk admin"). Kept on this machine only:
 * `<userData>/auth-defaults.json` (never in a repo). A successful bootstrap stores what was typed, so the next
 * project starts with the same admin.
 */
import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { AUTH_MODULES, normalizeAuthModules, type AuthBootstrapOptions } from '../../shared/authModules.js';
import { log } from '../utils/logger.js';

export type AuthDefaults = AuthBootstrapOptions;

const EMPTY: AuthDefaults = { modules: [...AUTH_MODULES], admin: { email: '', password: '', name: 'Admin' } };

function defaultsPath(): string {
  return join(app.getPath('userData'), 'auth-defaults.json');
}

export function readAuthDefaults(): AuthDefaults {
  try {
    const path = defaultsPath();
    if (!existsSync(path)) return EMPTY;
    const stored = JSON.parse(readFileSync(path, 'utf8')) as Partial<AuthDefaults>;
    return {
      modules: stored.modules ? normalizeAuthModules(stored.modules) : EMPTY.modules,
      admin: {
        email: stored.admin?.email ?? EMPTY.admin.email,
        password: stored.admin?.password ?? EMPTY.admin.password,
        name: stored.admin?.name ?? EMPTY.admin.name
      }
    };
  } catch (error) {
    log(`auth defaults unreadable: ${error instanceof Error ? error.message : String(error)}`, 'warn');
    return EMPTY;
  }
}

export function writeAuthDefaults(defaults: AuthDefaults): void {
  try {
    const path = defaultsPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ modules: normalizeAuthModules(defaults.modules), admin: defaults.admin }, null, 2)}\n`, {
      mode: 0o600
    });
  } catch (error) {
    log(`auth defaults not saved: ${error instanceof Error ? error.message : String(error)}`, 'warn');
  }
}
