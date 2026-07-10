/**
 * Frontend Generator
 * Generates frontend code (services, thunks, slices, pages) from templates
 */

import { BaseGenerator, GenerateOptions, GenerateResult } from './BaseGenerator.js';
import { renderTemplate, clearTemplateCache } from '../utils/templateEngine.js';
import { safeWriteFile, safeReadFile, safePathExists } from '../utils/fileUtils.js';
import { applyCustomBlockMerge } from '../utils/customBlockMerge.js';
import { getCustomBlockMarkersPresentInSource } from '../utils/customBlockMarkers.js';
import { handleError, ErrorCode } from '../utils/errorHandler.js';
import { log } from '../utils/logger.js';
import { injectReducer, injectRoute } from '../utils/injector.js';
import { join } from 'path';
import { mergeMongoAuditFrontendSchemaFields } from '../utils/mongoAuditFields.js';
import { readWorkspaceManifest } from '../utils/manifestSnapshot.js';
import { enrichRelationPropertyObjectFields } from '../../shared/relationDisplayMeta.js';
import { getProjectRootPath } from '../utils/templateHelpers.js';

/** Frontend templates that participate in the same custom-block merge as backend (Task 65). */
const FRONTEND_MERGE_TEMPLATE_NAMES = new Set([
  'service',
  'service.admin',
  'thunk',
  'slice',
  'page',
  'table',
  'modal'
]);

export interface FrontendGenerateOptions extends GenerateOptions {
  selectedFiles?: {
    service?: boolean;
    thunk?: boolean;
    slice?: boolean;
    page?: boolean;
  };
  backendPath?: string;
  features?: {
    deletable?: boolean;
    updatable?: boolean;
  };
  baseUrl?: string;
  isProtectedRoute?: boolean;
  updateExistingFiles?: boolean;
  isAdminUser?: boolean;
}

/**
 * Frontend Generator Class
 * Extends BaseGenerator to provide frontend-specific code generation
 */
export class FrontendGenerator extends BaseGenerator {
  private selectedFiles: { service: boolean; thunk: boolean; slice: boolean; page: boolean };
  private features: { deletable: boolean; updatable: boolean };
  private baseUrl: string;
  private isProtectedRoute: boolean;
  private updateExistingFiles: boolean;
  private isAdminUser: boolean;
  private backendPath?: string;

  private logInfo(message: string, context?: Record<string, unknown>): void {
    log(`${message}${context ? ` | ${JSON.stringify(context)}` : ''}`, 'info');
  }

  private logWarn(message: string, context?: Record<string, unknown>): void {
    log(`${message}${context ? ` | ${JSON.stringify(context)}` : ''}`, 'warn');
  }

  private logError(message: string, context?: Record<string, unknown>): void {
    log(`${message}${context ? ` | ${JSON.stringify(context)}` : ''}`, 'error');
  }

  constructor(options: FrontendGenerateOptions) {
    super(options);

    this.selectedFiles = {
      service: options.selectedFiles?.service ?? true,
      thunk: options.selectedFiles?.thunk ?? true,
      slice: options.selectedFiles?.slice ?? true,
      page: options.selectedFiles?.page ?? true
    };

    this.features = {
      deletable: options.features?.deletable ?? true,
      updatable: options.features?.updatable ?? true
    };

    this.baseUrl = options.baseUrl || '/api';
    this.isProtectedRoute = options.isProtectedRoute ?? false;
    this.updateExistingFiles = options.updateExistingFiles ?? false;
    this.isAdminUser = options.isAdminUser ?? false;
    this.backendPath = options.backendPath;
  }

  /**
   * Setup frontend directories
   */
  protected setupDirectories(): string[] {
    const dirs = this.getFrontendDirs();
    const entityNames = this.getEntityNames();
    const moduleBaseDir = join(this.projectRoot, 'src', 'modules', entityNames.camelCase);
    const moduleComponentsDir = join(moduleBaseDir, 'components');
    const modulePagesDir = join(moduleBaseDir, 'pages');
    // Keep services/store in place; UI outputs are module-centric under src/modules/<module>/...
    return [
      dirs.services,
      dirs.store,
      dirs.slices,
      dirs.thunks,
      dirs.types,
      dirs.utils,
      dirs.components,
      join(this.projectRoot, 'src', 'hooks'),
      moduleComponentsDir,
      modulePagesDir
    ];
  }

  /**
   * Main generation method
   */
  public generate(): GenerateResult {
    try {
      this.logStart('Frontend Generation');
      clearTemplateCache();

      // Setup directories
      const directories = this.setupDirectories();
      this.ensureProjectDirectories(directories);
      this.ensureCoreUiComponents();

      // Prepare template data
      const entityNames = this.getEntityNames();
      const templateData = this.prepareTemplateData(entityNames);

      // Generate files
      const files = this.generateFrontendFiles(templateData, entityNames);

      // Inject reducer to store if slice was generated
      if (this.selectedFiles.slice && files.slice) {
        this.injectReducerToStore(entityNames.camelCase);
      }

      // Inject route when page was generated (routes/routes.ts)
      if (this.selectedFiles.page && files.page) {
        const routeResult = injectRoute(this.projectRoot, entityNames.pascalCase, entityNames.camelCase);
        if (routeResult.success) {
          this.logInfo('Route injected', { entityName: this.schema.entityName });
        } else {
          this.logWarn('Route injection skipped/failed', { entityName: this.schema.entityName, reason: routeResult.message });
        }
      }

      this.logEnd('Frontend Generation', true);

      return this.createSuccessResult(files);
    } catch (error) {
      this.logEnd('Frontend Generation', false);

      const appError = handleError(error as Error, ErrorCode.GENERATION_FAILED, { entityName: this.schema.entityName });

      return this.createErrorResult(appError);
    }
  }

  /**
   * Shared UI shells (page flow only): typography-scale → CoreText → AdminTable → CoreModal + pagination hook.
   * Service/thunk/slice-only runs must not touch `src/components` shells.
   */
  private ensureCoreUiComponents(): void {
    if (!this.selectedFiles.page) {
      this.logInfo(
        'Page not selected; skipping shared Core UI components (TypographyScale, CoreText, AdminTable, CoreModal, useAdminServerPagination)'
      );
      return;
    }

    const dirs = this.getFrontendDirs();
    const hooksDir = join(this.projectRoot, 'src', 'hooks');
    const assets: Array<{ template: string; path: string; label: string }> = [
      { template: 'core.typography-scale', path: join(dirs.components, 'TypographyScale.ts'), label: 'TypographyScale' },
      { template: 'core.text', path: join(dirs.components, 'CoreText.tsx'), label: 'CoreText' },
      { template: 'core.admin-table', path: join(dirs.components, 'AdminTable.tsx'), label: 'AdminTable' },
      { template: 'core.modal', path: join(dirs.components, 'CoreModal.tsx'), label: 'CoreModal' },
      {
        template: 'use-admin-server-pagination',
        path: join(hooksDir, 'useAdminServerPagination.ts'),
        label: 'useAdminServerPagination'
      }
    ];

    for (const asset of assets) {
      if (safePathExists(asset.path) && !this.updateExistingFiles) {
        this.logInfo(`${asset.label} already exists, skipping`, { filePath: asset.path });
        continue;
      }

      const renderResult = renderTemplate(asset.template, {}, 'frontend');
      if (!renderResult.success || !renderResult.content) {
        this.logError(`Failed to render ${asset.label} template`, {
          template: asset.template,
          error: renderResult.error
        });
        continue;
      }

      const writeResult = safeWriteFile(asset.path, renderResult.content, {
        ensureDirectory: true,
        createBackup: false
      });

      if (writeResult.success) {
        this.logInfo(`${asset.label} component written`, { filePath: asset.path, template: asset.template });
      } else {
        this.logError(`Failed to write ${asset.label} component`, {
          filePath: asset.path,
          error: writeResult.error
        });
      }
    }
  }

  /**
   * Prepare template data
   */
  private prepareTemplateData(entityNames: any): any {
    const rawFields = Array.isArray(this.schema.fields) ? this.schema.fields : [];
    let fields = mergeMongoAuditFrontendSchemaFields(this.sourceType, [...rawFields]);

    const manifestRoot = this.backendPath
      ? getProjectRootPath(this.backendPath)
      : this.projectRoot;
    const manifest = readWorkspaceManifest(manifestRoot) ?? readWorkspaceManifest(this.projectRoot);
    fields = enrichRelationPropertyObjectFields(fields, manifest?.models);

    return {
      ...this.schema,
      fields,
      entityName: entityNames.pascalCase,
      camelEntityName: entityNames.camelCase,
      /** URL path segment (camelCase) - matches backend route path e.g. transactions/admin */
      entityNameLower: entityNames.camelCase,
      baseUrl: this.baseUrl,
      sourceType: this.sourceType,
      isProtectedRoute: this.isProtectedRoute,
      isAdminUser: this.isAdminUser,
      features: this.features,
      updatable: this.features.updatable,
      deletable: this.features.deletable,
      // Additional computed properties
      hasSearchableFields: fields.some((f: any) => f.isSearchable) || false,
      hasSchemaFields: fields.some((f: any) => f.type === 'schema') || false
    };
  }

  /**
   * Generate frontend files based on selection
   */
  private generateFrontendFiles(templateData: any, entityNames: any): Record<string, string> {
    const dirs = this.getFrontendDirs();
    const files: Record<string, string> = {};
    const moduleBaseDir = join(this.projectRoot, 'src', 'modules', entityNames.camelCase);
    const moduleComponentsDir = join(moduleBaseDir, 'components');
    const modulePagesDir = join(moduleBaseDir, 'pages');

    // Include Admin API (SchemaDesigner `isAdminUser`): admin → service.admin.hbs only; else → service.hbs only (mutually exclusive).
    if (this.selectedFiles.service) {
      if (this.isAdminUser) {
        const serviceAdminFile = this.generateFile('service.admin', 'frontend', dirs.services, `${entityNames.camelCase}.service.admin.ts`, templateData);
        if (serviceAdminFile) files.serviceAdmin = serviceAdminFile;
      } else {
        const serviceFile = this.generateFile('service', 'frontend', dirs.services, `${entityNames.camelCase}.service.ts`, templateData);
        if (serviceFile) files.service = serviceFile;
      }
    }

    // Thunk file
    if (this.selectedFiles.thunk) {
      const thunkFile = this.generateFile('thunk', 'frontend', dirs.thunks, `${entityNames.camelCase}.thunk.ts`, templateData);
      if (thunkFile) files.thunk = thunkFile;
    }

    // Slice file
    if (this.selectedFiles.slice) {
      const sliceFile = this.generateFile('slice', 'frontend', dirs.slices, `${entityNames.camelCase}.slice.ts`, templateData);
      if (sliceFile) files.slice = sliceFile;
    }

    // Page file: modules/{module}/pages/{EntityName}Page.tsx (e.g. modules/transactions/pages/TransactionsPage.tsx)
    if (this.selectedFiles.page) {
      const pageFile = this.generateFile('page', 'frontend', modulePagesDir, `${entityNames.pascalCase}Page.tsx`, templateData);
      if (pageFile) files.page = pageFile;
    }

    // Table component (always generated with page)
    if (this.selectedFiles.page) {
      const tableFile = this.generateFile('table', 'frontend', moduleComponentsDir, `${entityNames.pascalCase}Table.tsx`, templateData);
      if (tableFile) files.table = tableFile;
    }

    // Modal component (generated if updatable feature is enabled)
    if (this.selectedFiles.page && this.features.updatable) {
      const modalFile = this.generateFile('modal', 'frontend', moduleComponentsDir, `${entityNames.pascalCase}Modal.tsx`, templateData);
      if (modalFile) files.modal = modalFile;
    }

    return files;
  }

  /**
   * Generate a single file with update handling
   */
  private generateFile(
    templateName: string,
    templateType: 'backend' | 'frontend' | 'react',
    outputPath: string,
    fileName: string,
    templateData: any
  ): string | null {
    const filePath = join(outputPath, fileName);

    // Generate if file doesn't exist or in update mode
    if (!safePathExists(filePath) || this.updateExistingFiles) {
      const renderResult = renderTemplate(templateName, templateData, templateType);

      if (renderResult.success && renderResult.content) {
        let contentToWrite = renderResult.content;

        if (this.updateExistingFiles && FRONTEND_MERGE_TEMPLATE_NAMES.has(templateName) && safePathExists(filePath)) {
          const existingResult = safeReadFile(filePath);
          if (existingResult.success && existingResult.content) {
            const markerNames = getCustomBlockMarkersPresentInSource(contentToWrite);
            if (markerNames.length > 0) {
              const mergeResult = applyCustomBlockMerge({
                existingContent: existingResult.content,
                renderedContent: contentToWrite,
                markerNames,
                customImportsPrecedence: true
              });
              if (mergeResult.merged === null) {
                this.logWarn(
                  'Custom block merge failed; writing rendered template only (fix marker pairs in the existing file to preserve custom blocks)',
                  {
                    fileName,
                    filePath,
                    templateName,
                    reason: mergeResult.error
                  }
                );
              } else {
                contentToWrite = mergeResult.merged;
              }
            }
          }
        }

        const writeResult = safeWriteFile(filePath, contentToWrite, {
          ensureDirectory: true,
          createBackup: false
        });

        if (writeResult.success) {
          this.logInfo('Generated frontend file', { fileName, filePath });
          return filePath;
        } else {
          this.logError('Failed to write generated frontend file', { fileName, filePath, error: writeResult.error });
        }
      } else {
        this.logError('Failed to render frontend template', { templateName, error: renderResult.error });
      }
    } else {
      this.logInfo('Frontend file already exists, skipping', { fileName, filePath });
    }

    return null;
  }

  /**
   * Inject reducer to store
   */
  private injectReducerToStore(entityNameLower: string): void {
    try {
      const result = injectReducer(this.projectRoot, this.schema.entityName, entityNameLower);
      if (result.success) {
        this.logInfo('Reducer injected to store', { entityName: this.schema.entityName });
      } else {
        this.logWarn('Reducer injection skipped/failed', { entityName: this.schema.entityName, reason: result.message });
      }
    } catch (error) {
      this.logError('Failed to inject reducer', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }
}

/**
 * Parse base URL from backend src/index.ts file
 * Exported for backward compatibility
 */
export function parseBaseUrlFromBackend(backendPath: string): string {
  try {
    const { getProjectRootPath } = require('../utils/templateHelpers.js');
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
