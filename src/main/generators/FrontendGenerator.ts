/**
 * Frontend Generator
 * Generates frontend code (services, thunks, slices, pages) from templates
 */

import { BaseGenerator, GenerateOptions, GenerateResult } from './BaseGenerator.js';
import { renderTemplate } from '../utils/templateEngine.js';
import { safeWriteFile, safeReadFile } from '../utils/fileUtils.js';
import { handleError, ErrorCode } from '../utils/errorHandler.js';
import { log } from '../utils/logger.js';
import { injectReducer } from '../utils/injector.js';
import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';

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
  isSuperUser?: boolean;
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
  private isSuperUser: boolean;

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
    this.isSuperUser = options.isSuperUser ?? false;
  }

  /**
   * Setup frontend directories
   */
  protected setupDirectories(): string[] {
    const dirs = this.getFrontendDirs();
    return [dirs.services, dirs.components, dirs.pages, dirs.store, dirs.slices, dirs.thunks, dirs.types, dirs.utils];
  }

  /**
   * Main generation method
   */
  public generate(): GenerateResult {
    try {
      this.logStart('Frontend Generation');

      // Setup directories
      const directories = this.setupDirectories();
      this.ensureProjectDirectories(directories);

      // Prepare template data
      const entityNames = this.getEntityNames();
      const templateData = this.prepareTemplateData(entityNames);

      // Generate files
      const files = this.generateFrontendFiles(templateData, entityNames);

      // Inject reducer to store if slice was generated
      if (this.selectedFiles.slice && files.slice) {
        this.injectReducerToStore(entityNames.camelCase);
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
   * Prepare template data
   */
  private prepareTemplateData(entityNames: any): any {
    return {
      ...this.schema,
      entityName: entityNames.pascalCase,
      camelEntityName: entityNames.camelCase,
      entityNameLower: entityNames.lowerCase,
      baseUrl: this.baseUrl,
      sourceType: this.sourceType,
      isProtectedRoute: this.isProtectedRoute,
      isSuperUser: this.isSuperUser,
      features: this.features,
      // Additional computed properties
      hasSearchableFields: this.schema.fields?.some((f: any) => f.isSearchable) || false,
      hasSchemaFields: this.schema.fields?.some((f: any) => f.type === 'schema') || false
    };
  }

  /**
   * Generate frontend files based on selection
   */
  private generateFrontendFiles(templateData: any, entityNames: any): Record<string, string> {
    const dirs = this.getFrontendDirs();
    const files: Record<string, string> = {};

    // Service file
    if (this.selectedFiles.service) {
      const serviceFile = this.generateFile('service', 'frontend', dirs.services, `${entityNames.camelCase}.service.ts`, templateData);
      if (serviceFile) files.service = serviceFile;
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

    // Page file
    if (this.selectedFiles.page) {
      const pageFile = this.generateFile('page', 'frontend', dirs.pages, `${entityNames.pascalCase}Page.tsx`, templateData);
      if (pageFile) files.page = pageFile;
    }

    // Table component (always generated with page)
    if (this.selectedFiles.page) {
      const tableFile = this.generateFile('table', 'frontend', dirs.components, `${entityNames.pascalCase}Table.tsx`, templateData);
      if (tableFile) files.table = tableFile;
    }

    // Modal component (generated if updatable feature is enabled)
    if (this.selectedFiles.page && this.features.updatable) {
      const modalFile = this.generateFile('modal', 'frontend', dirs.components, `${entityNames.pascalCase}Modal.tsx`, templateData);
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

    // Delete existing file if update mode
    if (this.updateExistingFiles && existsSync(filePath)) {
      unlinkSync(filePath);
      log(`Deleted existing file: ${filePath}`, 'info');
    }

    // Generate if file doesn't exist or in update mode
    if (!existsSync(filePath) || this.updateExistingFiles) {
      const renderResult = renderTemplate(templateName, templateData, templateType);

      if (renderResult.success && renderResult.content) {
        const writeResult = safeWriteFile(filePath, renderResult.content, {
          ensureDirectory: true,
          createBackup: false
        });

        if (writeResult.success) {
          log(`Generated: ${fileName}`, 'info');
          return filePath;
        } else {
          log(`Failed to write ${fileName}: ${writeResult.error}`, 'error');
        }
      } else {
        log(`Failed to render ${templateName}: ${renderResult.error}`, 'error');
      }
    } else {
      log(`File already exists, skipping: ${fileName}`, 'info');
    }

    return null;
  }

  /**
   * Inject reducer to store
   */
  private injectReducerToStore(entityNameLower: string): void {
    const storeIndexPath = join(this.projectRoot, 'src', 'store', 'store.ts');

    if (!existsSync(storeIndexPath)) {
      log(`Store file not found at: ${storeIndexPath}`, 'warn');
      return;
    }

    try {
      const sliceImport = `import ${entityNameLower}Reducer from './slices/${entityNameLower}.slice';`;
      const reducerEntry = `${entityNameLower}: ${entityNameLower}Reducer`;

      injectReducer(storeIndexPath, this.schema.entityName, sliceImport, reducerEntry);
      log(`Reducer injected to store for ${this.schema.entityName}`, 'info');
    } catch (error) {
      log(`Failed to inject reducer: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
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
      if (existsSync(path)) {
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
    log(`Error parsing base URL from backend: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    return '/api';
  }
}
