/**
 * API settings of a module that has none stored in the manifest yet (plan 5 P5 #24), read from the files the
 * Generator wrote earlier — so opening an existing module does not silently turn a hand-trimmed route back
 * into full CRUD (R5). No files → a new model: no normal operation (G3).
 */
import { join } from 'path';
import { safePathExists, safeReadFile } from './fileUtils.js';
import { moduleNameFromEntity } from './namingUtils.js';
import type { NormalOperation } from '../../shared/normalizedModel.js';
import type { DetectedModuleApi } from '../../shared/ipcTypes.js';

export type { DetectedModuleApi };

/** Generated routes outside `custom-routes`, matched by path + method as `route.hbs` writes them. */
const OPERATION_PATTERNS: Array<[NormalOperation, RegExp]> = [
  ['list', /router\.post\(\s*'\/get-all'/],
  ['getOne', /router\.get\(\s*'\/:id'/],
  ['create', /router\.post\(\s*'\/create'/],
  ['update', /router\.post\(\s*'\/update\/:id'/],
  ['delete', /router\.delete\(\s*'\/:id'/]
];

function withoutCustomRoutes(source: string): string {
  return source.replace(/\/\/\s*<custom-routes>[\s\S]*?\/\/\s*<\/custom-routes>/g, '');
}

export function detectModuleApi(projectRoot: string, entityName: string): DetectedModuleApi {
  const moduleName = moduleNameFromEntity(entityName);
  const dir = join(projectRoot, 'src', 'modules', moduleName);
  const file = (suffix: string) => join(dir, `${moduleName}.${suffix}.ts`);
  const routes = safeReadFile(file('routes'));
  const hasAdmin = safePathExists(file('routes.admin')) || safePathExists(file('service.admin'));

  if (routes.success && routes.content !== undefined) {
    const generated = withoutCustomRoutes(routes.content);
    return {
      source: 'files',
      api: {
        normalOperations: OPERATION_PATTERNS.filter(([, re]) => re.test(generated)).map(([op]) => op),
        requiresAuth: routes.content.includes('authMiddleware'),
        admin: hasAdmin
      }
    };
  }
  const hasModuleFiles = safePathExists(file('service')) || safePathExists(file('crud'));
  return hasModuleFiles
    ? { source: 'files', api: { normalOperations: [], requiresAuth: true, admin: hasAdmin } }
    : { source: 'new', api: { normalOperations: [], requiresAuth: true } };
}
