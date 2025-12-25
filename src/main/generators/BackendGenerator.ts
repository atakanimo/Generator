/**
 * Backend Generator
 * Generates backend code (routes, services, types) from templates
 */

import { BaseGenerator, GenerateOptions, GenerateResult } from './BaseGenerator.js';
import { renderTemplate } from '../utils/templateEngine.js';
import { safeWriteFile, contentExistsInFile, safeReadFile } from '../utils/fileUtils.js';
import { handleError, ErrorCode } from '../utils/errorHandler.js';
import { log } from '../utils/logger.js';
import { join } from 'path';
import { existsSync, unlinkSync } from 'fs';

export interface BackendGenerateOptions extends GenerateOptions {
  isProtectedRoute: boolean;
  shouldAddRoute?: boolean;
  shouldGenerateResponseModel?: boolean;
  baseUrl?: string;
  updateExistingFiles?: boolean;
  isSuperUser?: boolean;
}

/**
 * Backend Generator Class
 * Extends BaseGenerator to provide backend-specific code generation
 */
export class BackendGenerator extends BaseGenerator {
  private isProtectedRoute: boolean;
  private shouldAddRoute: boolean;
  private shouldGenerateResponseModel: boolean;
  private baseUrl: string;
  private updateExistingFiles: boolean;
  private isSuperUser: boolean;

  constructor(options: BackendGenerateOptions) {
    super(options);
    
    this.isProtectedRoute = options.isProtectedRoute;
    this.shouldAddRoute = options.shouldAddRoute ?? true;
    this.shouldGenerateResponseModel = options.shouldGenerateResponseModel ?? false;
    this.baseUrl = options.baseUrl || '/api';
    this.updateExistingFiles = options.updateExistingFiles ?? false;
    this.isSuperUser = options.isSuperUser ?? false;
  }

  /**
   * Setup backend directories
   */
  protected setupDirectories(): string[] {
    const dirs = this.getCommonDirectories();
    return [
      dirs.routes,
      dirs.services,
      dirs.models,
      dirs.types,
      dirs.utils,
      dirs.interfaces,
      dirs.helpers
    ];
  }

  /**
   * Main generation method
   */
  public generate(): GenerateResult {
    try {
      this.logStart('Backend Generation');

      // Setup directories
      const directories = this.setupDirectories();
      this.ensureProjectDirectories(directories);

      // Generate response model if needed
      if (this.shouldGenerateResponseModel) {
        this.generateResponseModel();
      }

      // Prepare template data
      const entityNames = this.getEntityNames();
      const templateData = {
        ...this.schema,
        isProtectedRoute: this.isProtectedRoute,
        isSuperUser: this.isSuperUser,
        entityNameLower: entityNames.camelCase,
        camelEntityName: entityNames.camelCase,
        sourceType: this.sourceType
      };

      // Generate files in parallel
      const files = this.generateBackendFiles(templateData, entityNames);

      // Add route to index if needed
      if (this.shouldAddRoute && (this.sourceType === 'nodejs-mongoose' || this.sourceType === 'nodejs-typeorm')) {
        this.addRouteToIndex(entityNames.camelCase);
      }

      this.logEnd('Backend Generation', true);
      
      return this.createSuccessResult(files);
    } catch (error) {
      this.logEnd('Backend Generation', false);
      
      const appError = handleError(
        error as Error,
        ErrorCode.GENERATION_FAILED,
        { entityName: this.schema.entityName }
      );

      return this.createErrorResult(appError);
    }
  }

  /**
   * Generate response model file
   */
  private generateResponseModel(): void {
    if (this.sourceType !== 'nodejs-mongoose' && this.sourceType !== 'nodejs-typeorm') {
      log('Response model generation skipped: Not a Node.js project', 'info');
      return;
    }

    const dirs = this.getCommonDirectories();
    const responseFilePath = join(dirs.models, 'responses.model.ts');

    // Delete existing file if update mode
    if (this.updateExistingFiles && existsSync(responseFilePath)) {
      unlinkSync(responseFilePath);
      log(`Deleted existing response model file: ${responseFilePath}`, 'info');
    }

    // Generate if file doesn't exist or in update mode
    if (!existsSync(responseFilePath) || this.updateExistingFiles) {
      const renderResult = renderTemplate('response', {}, 'backend');

      if (renderResult.success && renderResult.content) {
        safeWriteFile(responseFilePath, renderResult.content, {
          ensureDirectory: true,
          createBackup: false
        });
        log(`Created/Updated Response.model.ts file: ${responseFilePath}`, 'info');
      } else {
        log(`Failed to generate response model: ${renderResult.error}`, 'error');
      }
    } else {
      log(`Response model file already exists: ${responseFilePath}`, 'info');
    }
  }

  /**
   * Generate backend files (route, service, types)
   */
  private generateBackendFiles(templateData: any, entityNames: any): Record<string, string> {
    const dirs = this.getCommonDirectories();
    const files: Record<string, string> = {};

    // Route file
    if (this.shouldAddRoute) {
      const routeFile = this.generateFile(
        'route',
        'backend',
        dirs.routes,
        `${entityNames.camelCase}.routes.ts`,
        templateData
      );
      if (routeFile) files.route = routeFile;
    }

    // Service file
    const serviceFile = this.generateFile(
      'service',
      'backend',
      dirs.services,
      `${entityNames.camelCase}.service.ts`,
      templateData
    );
    if (serviceFile) files.service = serviceFile;

    // Types file
    const typesFile = this.generateFile(
      'types',
      'backend',
      dirs.types,
      `${entityNames.camelCase}.types.ts`,
      templateData
    );
    if (typesFile) files.types = typesFile;

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
   * Add route to src/index.ts
   */
  private addRouteToIndex(entityNameLower: string): void {
    const indexPath = this.findIndexFile();
    
    if (!indexPath) {
      log('Could not find index.ts, app.ts, or server.ts file', 'warn');
      return;
    }

    try {
      this.injectRouteToFile(indexPath, entityNameLower);
      log(`Route added to ${indexPath} for ${this.schema.entityName}`, 'info');
    } catch (error) {
      log(`Failed to add route to ${indexPath}: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  }

  /**
   * Find the main index file (index.ts, app.ts, or server.ts)
   */
  private findIndexFile(): string | null {
    const possiblePaths = [
      join(this.projectRoot, 'src', 'index.ts'),
      join(this.projectRoot, 'src', 'app.ts'),
      join(this.projectRoot, 'src', 'server.ts'),
      join(this.projectRoot, 'index.ts'),
      join(this.projectRoot, 'app.ts'),
      join(this.projectRoot, 'server.ts')
    ];

    for (const path of possiblePaths) {
      if (existsSync(path)) {
        return path;
      }
    }

    return null;
  }

  /**
   * Inject route import and usage to index file
   */
  private injectRouteToFile(indexPath: string, entityNameLower: string): void {
    const readResult = safeReadFile(indexPath);
    
    if (!readResult.success || !readResult.content) {
      throw new Error(`Failed to read ${indexPath}`);
    }

    const content = readResult.content;
    const lines = content.split('\n');

    // Generate route variable name
    const routeVariableName = `${entityNameLower}Route`;
    
    // Check if route already exists
    const routePattern = new RegExp(`app\\.use\\(['"]${this.baseUrl}/${entityNameLower}['"]`);
    const hasRoute = lines.some(line => routePattern.test(line));

    if (hasRoute) {
      log(`Route for ${entityNameLower} already exists in ${indexPath}`, 'info');
      return;
    }

    // Check if import already exists
    const importPattern = new RegExp(`import.*from.*['"]\\./routes/${entityNameLower}\\.routes['"]`);
    const hasImport = lines.some(line => importPattern.test(line));

    // Find insertion points
    const lastImportIndex = this.findLastImportIndex(lines);
    const lastAppUseIndex = this.findLastAppUseIndex(lines);

    if (lastAppUseIndex === -1) {
      throw new Error('Could not find a suitable location to add the route');
    }

    // Add import if needed
    if (!hasImport && lastImportIndex !== -1) {
      const importLine = `import ${routeVariableName} from './routes/${entityNameLower}.routes';`;
      lines.splice(lastImportIndex + 1, 0, importLine);
    }

    // Add route
    const routeLine = `app.use('${this.baseUrl}/${entityNameLower}', ${routeVariableName});`;
    const insertIndex = hasImport ? lastAppUseIndex + 1 : lastAppUseIndex + 2; // +2 if we added import
    lines.splice(insertIndex, 0, routeLine);

    // Write back
    const newContent = lines.join('\n');
    safeWriteFile(indexPath, newContent, { createBackup: true });
    
    log(`Route injected: ${routeLine}`, 'info');
  }

  /**
   * Find the last import statement index
   */
  private findLastImportIndex(lines: string[]): number {
    let lastIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('import ')) {
        lastIndex = i;
      }
    }
    return lastIndex;
  }

  /**
   * Find the last app.use index
   */
  private findLastAppUseIndex(lines: string[]): number {
    let lastIndex = -1;
    
    // First, try to find app.use with Route
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes('app.use(') && lines[i].includes('Route')) {
        lastIndex = i;
        break;
      }
    }

    // If not found, look for app.use with /api
    if (lastIndex === -1) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('app.use') && lines[i].includes('/api')) {
          lastIndex = i;
        }
      }
    }

    return lastIndex;
  }
}

