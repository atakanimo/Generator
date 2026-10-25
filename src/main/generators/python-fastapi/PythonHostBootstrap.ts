/**
 * PY4: lays down a Python + FastAPI host (plan backend-python-fastapi §2, K7, K8).
 *
 * - Skeleton (`_skeleton/`): pyproject, `core/config.py`, `core/db.py`, `api/main.py`, `api/deps.py`, worker, tests. K: once.
 * - Core assets (`core/crud`, `core/http`, `core/errors` → `src/<pkg>/core/`): byte for byte, created when missing.
 * - Registry G file (`api/routers_generated.py`): rewritten from the module list (empty for a fresh host).
 */
import { join } from 'path';
import { PYTHON_GENERATED_HEADER, isValidPythonPackage, pythonLayout } from './pythonLayout.js';
import { WrittenFile, copySkeletonTree, copyVerbatimTree, pythonAssetsDir, writePythonGenerated } from './pythonFiles.js';
import { fromImport } from './pythonFormat.js';

/** One module as the registry sees it (filled by the PY5 generator). */
export interface PythonRegistryModule {
  /** `modules/<folder>/` (snake_case collection name). */
  folder: string;
  /** Entity name: the module's user-owned repository class is `<entity>Repository`. */
  entity: string;
  hasAdmin: boolean;
}

export interface PythonBootstrapResult {
  files: WrittenFile[];
}

/** Skeleton + core assets (create-only); no registry file. */
export function ensurePythonHost(root: string, pkg: string): WrittenFile[] {
  if (!isValidPythonPackage(pkg)) throw new Error(`Invalid Python package name (snake_case): ${pkg}`);
  return [...copySkeletonTree(join(pythonAssetsDir(), '_skeleton'), root, pkg), ...ensurePythonAssets(root, pkg)];
}

/** Core assets only (create-only): what a generate needs in an existing host; the skeleton is bootstrap's. */
export function ensurePythonAssets(root: string, pkg: string): WrittenFile[] {
  return copyVerbatimTree(join(pythonAssetsDir(), 'core'), pythonLayout(root, pkg).coreDir);
}

/** Fresh host with an empty registry. */
export function bootstrapPythonHost(root: string, pkg: string): PythonBootstrapResult {
  return { files: [...ensurePythonHost(root, pkg), ...writePythonRegistries(root, pkg, [])] };
}

export function renderRoutersRegistry(pkg: string, modules: PythonRegistryModule[]): string {
  const admin = modules.filter((m) => m.hasAdmin).map((m) => m.folder).sort();
  // One statement per module (ruff isort keeps aliased imports apart), wrapped only when longer than the line.
  const imports = admin.map((folder) => `${fromImport(`${pkg}.modules.${folder}.admin_router_generated`, [`router as ${folder}_admin_router`])}\n`);
  const list = admin.length ? `[\n${admin.map((folder) => `    ${folder}_admin_router,\n`).join('')}]` : '[]';
  return [
    `${PYTHON_GENERATED_HEADER}\n`,
    '"""Üretilen admin CRUD router\'ları; `api/main.py` `API_PREFIX` altında bağlar."""\n',
    '\n',
    'from __future__ import annotations\n',
    '\n',
    'from typing import TYPE_CHECKING\n',
    '\n',
    ...(imports.length ? [imports.join(''), '\n'] : []),
    'if TYPE_CHECKING:\n',
    '    from fastapi import APIRouter\n',
    '\n',
    `ADMIN_CRUD_ROUTERS: list[APIRouter] = ${list}\n`
  ].join('');
}

/**
 * `api/indexes_generated.py`: every module's repository (the user-owned subclass, so its own indexes count too) and
 * `ensure_crud_indexes(db)`, which `api/main.py` awaits on startup. Without it a fresh host has no unique index and
 * only `check_unique` (409) guards unique fields.
 */
export function renderIndexesRegistry(pkg: string, modules: PythonRegistryModule[]): string {
  const sorted = [...modules].sort((a, b) => a.folder.localeCompare(b.folder));
  const imports = sorted.map((m) => `${fromImport(`${pkg}.modules.${m.folder}.repository`, [`${m.entity}Repository`])}\n`);
  const list = sorted.length ? `[\n${sorted.map((m) => `    ${m.entity}Repository,\n`).join('')}]` : '[]';
  return [
    `${PYTHON_GENERATED_HEADER}\n`,
    '"""Üretilen modüllerin repository\'leri; `api/main.py` açılışta `ensure_crud_indexes` ile index\'lerini kurar."""\n',
    '\n',
    'from __future__ import annotations\n',
    '\n',
    'from typing import TYPE_CHECKING\n',
    '\n',
    ...(imports.length ? [imports.join(''), '\n'] : []),
    'if TYPE_CHECKING:\n',
    `    from ${pkg}.core.crud import CrudRepository\n`,
    `    from ${pkg}.core.db import Database\n`,
    '\n',
    `CRUD_REPOSITORIES: list[type[CrudRepository]] = ${list}\n`,
    '\n',
    '\n',
    'async def ensure_crud_indexes(db: Database) -> None:\n',
    '    """Her modülün index\'leri (unique dahil). `create_index` idempotent; her açılışta çağrılabilir."""\n',
    '    for repository in CRUD_REPOSITORIES:\n',
    '        await repository(db).ensure_indexes()\n'
  ].join('');
}

export function writePythonRegistries(root: string, pkg: string, modules: PythonRegistryModule[]): WrittenFile[] {
  const layout = pythonLayout(root, pkg);
  return [
    writePythonGenerated(layout.routersRegistry, renderRoutersRegistry(pkg, modules)),
    writePythonGenerated(layout.indexesRegistry, renderIndexesRegistry(pkg, modules))
  ];
}
