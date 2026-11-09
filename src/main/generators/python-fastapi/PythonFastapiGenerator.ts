/**
 * Python + FastAPI module generator (plan backend-python-fastapi §2, §5 PY5): one NormalizedModel → `modules/<folder>/`
 * files, then the registry G file (`api/routers_generated.py`) from the whole module list.
 *
 * G files (`*_generated.py`, the auth layer's shared files) carry the Generator header and are rewritten; K files (`model.py`, `repository.py`,
 * `hooks.py`, `service.py`, `__init__.py`, the module test `tests/modules/<folder>/test_admin_crud.py`) are created once. A generate only ensures the core assets (create-only);
 * the skeleton belongs to the bootstrap, so an existing host (StockExchange) gets no new skeleton files.
 */
import { AUTH_USERS_ENTITY, normalizeAuthModules } from '../../../shared/authModules.js';
import Handlebars from 'handlebars';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { NormalizedModel } from '../../../shared/normalizedModel.js';
import { getTemplatesDir } from '../../utils/templateHelpers.js';
import { writeOnce } from '../dotnet-efcore/dotnetFiles.js';
import { readWorkspaceManifest } from '../../utils/manifestSnapshot.js';
import { syncPythonAuth } from './PythonAuthFiles.js';
import { ensurePythonAssets, writePythonRegistries } from './PythonHostBootstrap.js';
import { PythonModuleContext, buildPythonModuleContexts } from './pythonContext.js';
import { WrittenFile, writePythonGenerated } from './pythonFiles.js';
import { isValidPythonPackage, pythonLayout } from './pythonLayout.js';

export interface PythonGenerateResult {
  files: WrittenFile[];
  modules: PythonModuleContext[];
}

const templateCache = new Map<string, HandlebarsTemplateDelegate>();

export function renderPythonTemplate(name: string, data: unknown): string {
  let template = templateCache.get(name);
  if (!template) {
    template = Handlebars.compile(readFileSync(join(getTemplatesDir('backend-python-fastapi'), `${name}.hbs`), 'utf8'), { noEscape: true });
    templateCache.set(name, template);
  }
  return template(data);
}

/** G files of one module, rendered (path relative to the module folder → content). */
export function renderPythonGeneratedFiles(ctx: PythonModuleContext): Array<{ file: string; content: string }> {
  const files = ['model_generated.py', 'schemas_generated.py', 'repository_generated.py', 'service_generated.py'];
  if (ctx.hasAdmin) files.push('admin_router_generated.py');
  return files.map((file) => ({ file, content: renderPythonTemplate(`module/${file}`, ctx) }));
}

/** K files of one module (created once). `admin_router.py` is not created: CRUD-dışı uçlar elle eklenir. */
export function renderPythonOwnedFiles(ctx: PythonModuleContext): Array<{ file: string; content: string }> {
  return [
    { file: '__init__.py', content: '' },
    ...['model.py', 'repository.py', 'hooks.py', 'service.py'].map((file) => ({ file, content: renderPythonTemplate(`module/${file}`, ctx) }))
  ];
}

/**
 * Module test (K, PY8): `tests/modules/<folder>/test_admin_crud.py`, only for modules with admin routes. Relies on the
 * skeleton's `tests/conftest.py` fixtures (`client`, `make_token`, `mock_db`).
 */
export function renderPythonModuleTest(ctx: PythonModuleContext): { file: string; content: string } | undefined {
  if (!ctx.hasAdmin) return undefined;
  return { file: join('tests', 'modules', ctx.folder, 'test_admin_crud.py'), content: renderPythonTemplate('module/test_admin_crud.py', ctx) };
}

function moduleFiles(root: string, ctx: PythonModuleContext): WrittenFile[] {
  const dir = join(pythonLayout(root, ctx.pkg).packageDir, 'modules', ctx.folder);
  const files = [
    ...renderPythonGeneratedFiles(ctx).map(({ file, content }) => writePythonGenerated(join(dir, file), content)),
    ...renderPythonOwnedFiles(ctx).map(({ file, content }) => writeOnce(join(dir, file), content))
  ];
  // Written once, and only into a host that has a `tests/` folder (the skeleton does; a copied `src/` alone does not).
  // The shared auth layer's `Users` (docs/backend/auth.md) is covered by the auth scenarios: its rows are also the
  // test tokens' users and the seeded admin, so the generic list / count assertions do not hold there.
  const authUsers = ctx.entity === AUTH_USERS_ENTITY && existsSync(join(pythonLayout(root, ctx.pkg).packageDir, 'modules', 'auth'));
  const test = authUsers ? undefined : renderPythonModuleTest(ctx);
  if (test && existsSync(join(root, 'tests'))) files.push(writeOnce(join(root, test.file), test.content));
  return files;
}

/**
 * Generates every given module and rewrites the registry from that list. `models` must be the host's full list of
 * Generator-owned modules (the manifest's models).
 */
export function generatePythonModules(root: string, pkg: string, models: NormalizedModel[]): PythonGenerateResult {
  if (!isValidPythonPackage(pkg)) throw new Error(`Invalid Python package name (snake_case): ${pkg}`);
  const modules = buildPythonModuleContexts(pkg, models);
  const files: WrittenFile[] = ensurePythonAssets(root, pkg);
  for (const ctx of modules) files.push(...moduleFiles(root, ctx));
  // Auth G files follow `workspace.auth` (hosts without `appName` get it from `python-host.mjs auth`).
  const auth = readWorkspaceManifest(root)?.workspace?.auth;
  if (auth?.appName && existsSync(join(pythonLayout(root, pkg).packageDir, 'modules', 'auth'))) {
    files.push(...syncPythonAuth(root, pkg, auth.appName, normalizeAuthModules(auth.modules), true));
  }
  files.push(...writePythonRegistries(root, pkg, modules.map((m) => ({ folder: m.folder, entity: m.entity, hasAdmin: m.hasAdmin }))));
  return { files, modules };
}
