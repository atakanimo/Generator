/**
 * Base Generator Class
 * Abstract base class for all code generators with common functionality
 */

import { renderTemplate } from '../utils/templateEngine.js';
import { safeWriteFile, ensureDirectory, getProjectDirectories, getFrontendDirectories } from '../utils/fileUtils.js';
import { validateSchema, validateDirectory } from '../utils/validationUtils.js';
import { handleError, ErrorCode, AppError, errorToResult } from '../utils/errorHandler.js';
import { logGenerate, log } from '../utils/logger.js';
import { getProjectRootPath } from '../utils/templateHelpers.js';
import { camelCase, pascalCase } from '../utils/namingUtils.js';

export interface GenerateOptions {
  schema: any;
  projectPath: string;
  sourceType?: 'nodejs-mongoose' | 'nodejs-typeorm' | 'dotnet-ef' | null;
  [key: string]: any;
}

export interface GenerateResult {
  success: boolean;
  files?: Record<string, string>;
  error?: string;
  code?: ErrorCode;
}

/**
 * Abstract Base Generator
 * Provides common functionality for all generators
 */
export abstract class BaseGenerator {
  protected projectRoot: string;
  protected schema: any;
  protected sourceType?: 'nodejs-mongoose' | 'nodejs-typeorm' | 'dotnet-ef' | null;

  constructor(options: GenerateOptions) {
    this.validateOptions(options);
    this.projectRoot = getProjectRootPath(options.projectPath);
    this.schema = options.schema;
    this.sourceType = options.sourceType;
  }

  /**
   * Validate generator options
   */
  protected validateOptions(options: GenerateOptions): void {
    // Validate schema
    const schemaValidation = validateSchema(options.schema);
    if (!schemaValidation.valid) {
      const error = handleError(
        schemaValidation.error || 'Invalid schema',
        ErrorCode.INVALID_SCHEMA,
        { entityName: options.schema?.entityName }
      );
      throw new Error(error.userMessage);
    }

    // Validate project path
    const pathValidation = validateDirectory(options.projectPath);
    if (!pathValidation.valid) {
      const error = handleError(
        pathValidation.error || 'Invalid project path',
        ErrorCode.INVALID_PATH,
        { filePath: options.projectPath }
      );
      throw new Error(error.userMessage);
    }
  }

  /**
   * Setup required directories for the project
   */
  protected abstract setupDirectories(): string[];

  /**
   * Generate code (main entry point)
   */
  public abstract generate(): GenerateResult;

  /**
   * Ensure all required directories exist
   */
  protected ensureProjectDirectories(directories: string[]): void {
    for (const dir of directories) {
      ensureDirectory(dir);
    }
  }

  /**
   * Render a template and write to file
   */
  protected async renderAndWriteTemplate(
    templateName: string,
    templateType: 'backend',
    outputPath: string,
    outputFileName: string,
    data: any = {}
  ): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      // Merge schema data with additional data
      const templateData = {
        ...this.schema,
        entityName: this.schema.entityName,
        camelEntityName: this.schema.entityName.charAt(0).toLowerCase() + this.schema.entityName.slice(1),
        fields: this.schema.fields,
        ...data
      };

      // Render template
      const renderResult = renderTemplate(templateName, templateData, templateType);

      if (!renderResult.success || !renderResult.content) {
        return {
          success: false,
          error: renderResult.error
        };
      }

      // Write file
      const fullPath = `${outputPath}/${outputFileName}`;
      const writeResult = safeWriteFile(fullPath, renderResult.content, {
        ensureDirectory: true,
        createBackup: false
      });

      if (!writeResult.success) {
        return {
          success: false,
          error: writeResult.error
        };
      }

      // Log success
      logGenerate(outputFileName, fullPath);

      return {
        success: true,
        filePath: fullPath
      };
    } catch (error) {
      const appError = handleError(
        error as Error,
        ErrorCode.GENERATION_FAILED,
        { entityName: this.schema.entityName, templateName }
      );

      return {
        success: false,
        error: appError.userMessage
      };
    }
  }

  /**
   * Generate multiple files in parallel
   */
  protected async generateFilesParallel(
    fileConfigs: Array<{
      templateName: string;
      templateType: 'backend';
      outputPath: string;
      outputFileName: string;
      data?: any;
      enabled?: boolean;
    }>
  ): Promise<Record<string, string>> {
    const enabledConfigs = fileConfigs.filter(config => config.enabled !== false);

    const results = await Promise.all(
      enabledConfigs.map(config =>
        this.renderAndWriteTemplate(
          config.templateName,
          config.templateType,
          config.outputPath,
          config.outputFileName,
          config.data
        )
      )
    );

    const files: Record<string, string> = {};

    results.forEach((result, index) => {
      if (result.success && result.filePath) {
        const config = enabledConfigs[index];
        files[config.templateName] = result.filePath;
      }
    });

    return files;
  }

  /**
   * Get entity names in different cases
   */
  protected getEntityNames() {
    const entityName = this.schema.entityName;
    return {
      pascalCase: pascalCase(entityName),
      camelCase: camelCase(entityName),
      lowerCase: entityName.toLowerCase(),
      upperCase: entityName.toUpperCase()
    };
  }

  /**
   * Get common project directories
   */
  protected getCommonDirectories() {
    return getProjectDirectories(this.projectRoot);
  }

  /**
   * Get common frontend directories
   */
  protected getFrontendDirs() {
    return getFrontendDirectories(this.projectRoot);
  }

  /**
   * Log generation start
   */
  protected logStart(generatorName: string): void {
    log(`${generatorName} started for entity: ${this.schema.entityName}`, 'info');
  }

  /**
   * Log generation end
   */
  protected logEnd(generatorName: string, success: boolean): void {
    if (success) {
      log(`${generatorName} completed successfully for entity: ${this.schema.entityName}`, 'info');
    } else {
      log(`${generatorName} failed for entity: ${this.schema.entityName}`, 'error');
    }
  }

  /**
   * Create a success result
   */
  protected createSuccessResult(files: Record<string, string>): GenerateResult {
    return {
      success: true,
      files
    };
  }

  /**
   * Create an error result
   */
  protected createErrorResult(error: string | AppError, code?: ErrorCode): GenerateResult {
    if (typeof error === 'string') {
      return {
        success: false,
        error,
        code: code || ErrorCode.GENERATION_FAILED
      };
    }

    return {
      success: false,
      error: error.userMessage,
      code: error.code
    };
  }
}

