/**
 * Backend Generator
 * Generates backend code (routes, services, types) from templates
 */

import { BaseGenerator, GenerateOptions, GenerateResult } from './BaseGenerator.js';
import { renderTemplate, clearTemplateCache } from '../utils/templateEngine.js';
import { safeWriteFile, safeReadFile, safePathExists } from '../utils/fileUtils.js';
import { applyCustomBlockMerge } from '../utils/customBlockMerge.js';
import { getCustomBlockMarkersPresentInSource, getDefaultCustomBlockMarkerNames } from '../utils/customBlockMarkers.js';
import { handleError, ErrorCode } from '../utils/errorHandler.js';
import { log } from '../utils/logger.js';
import { getGeneratorRoot, getTemplatesDir } from '../utils/templateHelpers.js';
import { join } from 'path';
import { kebabCase } from '../utils/namingUtils.js';
import { mergeMongoAuditBackendTemplateFields } from '../utils/mongoAuditFields.js';

export interface BackendGenerateOptions extends GenerateOptions {
  isProtectedRoute: boolean;
  shouldAddRoute?: boolean;
  baseUrl?: string;
  updateExistingFiles?: boolean;
  /** When true, generates admin route/service (e.g. *.routes.admin.ts, *.service.admin.ts) for admin-only operations */
  isAdminUser?: boolean;
  selectedFiles?: {
    model?: boolean;
    crud?: boolean;
    filters?: boolean;
    types?: boolean;
    service?: boolean;
    serviceAdmin?: boolean;
    schema?: boolean;
    route?: boolean;
    routeAdmin?: boolean;
  };
}

interface ArtifactConfig {
  key: 'model' | 'crud' | 'filters' | 'types' | 'service' | 'serviceAdmin' | 'schema' | 'route' | 'routeAdmin';
  templateCandidates: string[];
  outputDir: string;
  outputFileName: string;
  enabled: boolean;
  buildTemplateData?: (baseTemplateData: Record<string, unknown>) => Record<string, unknown>;
  /** When true, write even if file exists while updateExistingFiles is false. Model still supports merge markers (e.g. custom-tojson-transform) when update mode is on. */
  alwaysRegenerate?: boolean;
}

type NormalizedFieldType = 'string' | 'number' | 'boolean' | 'date' | 'objectId' | 'array' | 'object';
type NormalizedRelationType = 'oneToOne' | 'oneToMany' | 'manyToOne' | 'manyToMany';

interface NormalizedField {
  name: string;
  type: NormalizedFieldType;
  required: boolean;
  isArray: boolean;
  filterable: boolean;
  filterType?: 'regex' | 'exact' | 'objectId' | 'range' | 'boolean' | 'date-range';
  defaultValue?: string;
  isReadonly?: boolean;
  hiddenFromCreate?: boolean;
  hiddenFromUpdate?: boolean;
  relation?: {
    target: string;
    type: NormalizedRelationType;
    displayField?: string;
  };
  relationPopulateFields?: string[];
  relationType?: NormalizedRelationType;
  trim?: boolean;
  unique?: boolean;
  ui: {
    showInTable: boolean;
    label: string;
    uiComponent?: string;
  };
}

interface NormalizedModel {
  name: string;
  camelName: string;
  pascalName: string;
  kebabName: string;
  fields: NormalizedField[];
  ownership?: {
    field: string;
    normalApiFromAuth: boolean;
    adminApiBodyAllowed: boolean;
    adminApiFilterable: boolean;
  };
}

type MongooseFieldShape = {
  name: string;
  tsType: string;
  mongooseType: string;
  required: boolean;
  unique: boolean;
  trim: boolean;
  ref?: string;
};

interface MergeConflictPolicy {
  onMissingPlaceholderInRenderedTemplate: 'fail';
  onMalformedExistingMarkers: 'fail';
}

interface CoreBootstrapFile {
  sourceRelativePath: string;
  targetRelativePath: string;
}

/**
 * Backend Generator Class
 * Extends BaseGenerator to provide backend-specific code generation
 */
export class BackendGenerator extends BaseGenerator {
  private isProtectedRoute: boolean;
  private shouldAddRoute: boolean;
  private baseUrl: string;
  private updateExistingFiles: boolean;
  private isAdminUser: boolean;
  private selectedFiles: NonNullable<BackendGenerateOptions['selectedFiles']>;
  private readonly mergeConflictPolicy: MergeConflictPolicy = {
    onMissingPlaceholderInRenderedTemplate: 'fail',
    onMalformedExistingMarkers: 'fail'
  };

  private logInfo(message: string, context?: Record<string, unknown>): void {
    log(`${message}${context ? ` | ${JSON.stringify(context)}` : ''}`, 'info');
  }

  private logWarn(message: string, context?: Record<string, unknown>): void {
    log(`${message}${context ? ` | ${JSON.stringify(context)}` : ''}`, 'warn');
  }

  private logError(message: string, context?: Record<string, unknown>): void {
    log(`${message}${context ? ` | ${JSON.stringify(context)}` : ''}`, 'error');
  }

  constructor(options: BackendGenerateOptions) {
    super(options);

    this.isProtectedRoute = options.isProtectedRoute;
    this.shouldAddRoute = options.shouldAddRoute ?? true;
    this.baseUrl = options.baseUrl || '/api';
    this.updateExistingFiles = options.updateExistingFiles ?? false;
    this.isAdminUser = options.isAdminUser ?? false;
    this.selectedFiles = {
      model: options.selectedFiles?.model ?? true,
      crud: options.selectedFiles?.crud ?? true,
      filters: options.selectedFiles?.filters ?? true,
      types: options.selectedFiles?.types ?? true,
      service: options.selectedFiles?.service ?? true,
      serviceAdmin: options.selectedFiles?.serviceAdmin ?? true,
      schema: options.selectedFiles?.schema ?? true,
      route: options.selectedFiles?.route ?? true,
      routeAdmin: options.selectedFiles?.routeAdmin ?? true
    };
  }

  /**
   * Setup backend directories
   */
  protected setupDirectories(): string[] {
    // Backend artifacts are generated under src/modules/<module>/...
    // Ensure the modules root exists; per-module folders are created on write.
    return [join(this.projectRoot, 'src', 'modules')];
  }

  /**
   * Main generation method
   */
  public generate(): GenerateResult {
    try {
      this.logStart('Backend Generation');
      clearTemplateCache();
      this.logInfo('Stack detection (sourceType)', {
        step: 'stack-detection',
        sourceType: this.sourceType ?? 'unknown'
      });

      // Setup directories
      const directories = this.setupDirectories();
      this.ensureProjectDirectories(directories);
      this.logInfo('Project directories ensured', { step: 'project-directories' });
      this.ensureCoreBootstrapFiles();

      // Prepare template data
      const entityNames = this.getEntityNames();
      this.logInfo('Model parse / entity names prepared', {
        step: 'model-parse',
        entityName: this.schema.entityName,
        camelName: entityNames.camelCase,
        pascalName: entityNames.pascalCase
      });
      this.logInfo('NormalizedModel build started', { step: 'normalized-model-build' });
      const normalizedModel = this.buildNormalizedModel();
      const moduleName = normalizedModel.kebabName;
      this.logInfo('NormalizedModel created', {
        step: 'normalized-model-build',
        ownershipField: normalizedModel.ownership?.field ?? null,
        fieldCount: normalizedModel.fields.length
      });
      const templateData = {
        entityName: normalizedModel.pascalName,
        fields: mergeMongoAuditBackendTemplateFields(this.sourceType, this.toTemplateFields(normalizedModel)),
        isProtectedRoute: this.isProtectedRoute,
        isAdminUser: this.isAdminUser,
        entityNameLower: normalizedModel.camelName,
        camelEntityName: normalizedModel.camelName,
        moduleName,
        sourceType: this.sourceType,
        normalizedModel
      };

      // Generate files in parallel
      this.logInfo('Generation queue created', { step: 'queue-creation' });
      const files = this.generateBackendFiles(templateData, {
        entityNameLower: normalizedModel.camelName,
        moduleName
      });

      // Add route to index if needed
      if (this.shouldAddRoute && (this.sourceType === 'nodejs-mongoose' || this.sourceType === 'nodejs-typeorm')) {
        if (this.updateExistingFiles) {
          this.addRouteToIndex(moduleName, normalizedModel.camelName);
        } else {
          this.logInfo('Route injection skipped (updateExistingFiles disabled)', {
            step: 'route-injection-skip',
            module: moduleName,
            reason: 'update-disabled'
          });
        }
      }

      // Add admin route to index if isAdminUser
      if (this.isAdminUser && (this.sourceType === 'nodejs-mongoose' || this.sourceType === 'nodejs-typeorm')) {
        if (this.updateExistingFiles) {
          this.addAdminRouteToIndex(moduleName, normalizedModel.camelName);
        } else {
          this.logInfo('Admin route injection skipped (updateExistingFiles disabled)', {
            step: 'route-injection-skip',
            module: moduleName,
            reason: 'update-disabled',
            admin: true
          });
        }
      }

      this.logEnd('Backend Generation', true);

      return this.createSuccessResult(files);
    } catch (error) {
      this.logEnd('Backend Generation', false);

      const appError = handleError(error as Error, ErrorCode.GENERATION_FAILED, { entityName: this.schema.entityName });

      return this.createErrorResult(appError);
    }
  }

  private isExpressMongooseStack(): boolean {
    return this.sourceType === 'nodejs-mongoose';
  }

  private ensureCoreBootstrapFiles(): void {
    if (!this.isExpressMongooseStack()) {
      this.logInfo('Core bootstrap skipped: non-target backend stack', {
        step: 'core-bootstrap-check',
        sourceType: this.sourceType ?? 'unknown'
      });
      return;
    }

    const generatorRoot = getGeneratorRoot();
    const coreBootstrapFiles: CoreBootstrapFile[] = [
      {
        sourceRelativePath: 'src/generator-assets/core/errors/error-codes.ts',
        targetRelativePath: 'src/core/errors/error-codes.ts'
      },
      {
        sourceRelativePath: 'src/generator-assets/core/errors/error.helper.ts',
        targetRelativePath: 'src/core/errors/error.helper.ts'
      },
      {
        sourceRelativePath: 'src/generator-assets/core/logging/logger.ts',
        targetRelativePath: 'src/core/logging/logger.ts'
      },
      {
        sourceRelativePath: 'src/generator-assets/core/pagination/pagination.helper.ts',
        targetRelativePath: 'src/core/pagination/pagination.helper.ts'
      },
      {
        sourceRelativePath: 'src/generator-assets/core/response/response.helper.ts',
        targetRelativePath: 'src/core/response/response.helper.ts'
      },
      {
        sourceRelativePath: 'src/generator-assets/core/types/api-contract.ts',
        targetRelativePath: 'src/core/types/api-contract.ts'
      },
      {
        sourceRelativePath: 'src/generator-assets/core/services/base-crud.service.ts',
        targetRelativePath: 'src/core/services/base-crud.service.ts'
      }
    ];

    this.logInfo('Core bootstrap check started', {
      step: 'core-bootstrap-check',
      fileCount: coreBootstrapFiles.length
    });

    for (const bootstrapFile of coreBootstrapFiles) {
      const sourcePath = join(generatorRoot, bootstrapFile.sourceRelativePath);
      const targetPath = join(this.projectRoot, bootstrapFile.targetRelativePath);

      if (!safePathExists(sourcePath)) {
        this.logError('Core bootstrap source missing', {
          step: 'core-bootstrap-check',
          file: sourcePath,
          reason: 'source-not-found'
        });
        throw new Error(`Core bootstrap source missing: ${sourcePath}`);
      }

      if (safePathExists(targetPath)) {
        const canonicalRead = safeReadFile(sourcePath);
        const targetRead = safeReadFile(targetPath);
        if (
          canonicalRead.success &&
          targetRead.success &&
          canonicalRead.content !== undefined &&
          targetRead.content !== undefined &&
          canonicalRead.content !== targetRead.content
        ) {
          this.logWarn('Core helper differs from canonical asset (kept existing file)', {
            step: 'core-bootstrap-check',
            file: targetPath,
            reason: 'canonical-deviation-detected',
            action: 'skip-existing'
          });
        }

        this.logInfo('Core bootstrap file skipped (already exists)', {
          step: 'core-bootstrap-check',
          file: targetPath,
          action: 'skip'
        });
        continue;
      }

      const sourceRead = safeReadFile(sourcePath);
      if (!sourceRead.success || sourceRead.content === undefined) {
        this.logError('Core bootstrap read failed', {
          step: 'core-bootstrap-create',
          file: sourcePath,
          reason: sourceRead.error ?? 'read-failed'
        });
        throw new Error(`Failed to read core bootstrap source: ${sourcePath}`);
      }

      const writeResult = safeWriteFile(targetPath, sourceRead.content, {
        ensureDirectory: true,
        createBackup: false
      });

      if (!writeResult.success) {
        this.logError('Core bootstrap file creation failed', {
          step: 'core-bootstrap-create',
          file: targetPath,
          reason: writeResult.error ?? 'write-failed'
        });
        throw new Error(`Failed to create core bootstrap file: ${targetPath}`);
      }

      this.logInfo('Core bootstrap file created', {
        step: 'core-bootstrap-create',
        file: targetPath,
        action: 'create'
      });
    }
  }

  /**
   * Generate backend files in strict dependency order.
   */
  private generateBackendFiles(
    templateData: Record<string, unknown>,
    names: { entityNameLower: string; moduleName: string }
  ): Record<string, string> {
    const files: Record<string, string> = {};

    const manifest = this.createArtifactManifest(names);
    this.logInfo('Artifact manifest resolved', {
      step: 'queue-creation',
      artifactCount: manifest.filter(a => a.enabled).length
    });
    for (const artifact of manifest) {
      if (!artifact.enabled) {
        continue;
      }

      this.logInfo('Artifact render started', {
        step: 'template-render',
        artifact: artifact.key,
        file: artifact.outputFileName
      });
      const resolvedTemplateName = this.resolveTemplateName(artifact.templateCandidates);
      if (!resolvedTemplateName) {
        this.logError('Template resolution failed for artifact', {
          step: 'template-resolution',
          artifact: artifact.key,
          file: artifact.outputFileName,
          reason: 'template-not-found',
          tried: artifact.templateCandidates
        });
        continue;
      }

      const generatedFile = this.generateFile(
        resolvedTemplateName,
        'backend',
        artifact.outputDir,
        artifact.outputFileName,
        artifact.buildTemplateData ? artifact.buildTemplateData(templateData) : templateData,
        { alwaysRegenerate: artifact.alwaysRegenerate === true }
      );

      if (generatedFile) {
        files[artifact.key] = generatedFile;
      }
    }

    return files;
  }

  private createArtifactManifest(names: { entityNameLower: string; moduleName: string }): ArtifactConfig[] {
    const moduleDir = join(this.projectRoot, 'src', 'modules', names.moduleName);
    const fileBase = names.moduleName;
    return [
      {
        key: 'model',
        templateCandidates: ['express-mongoose/model', 'model'],
        outputDir: moduleDir,
        outputFileName: `${fileBase}.model.ts`,
        enabled: this.selectedFiles.model ?? true,
        alwaysRegenerate: true,
        buildTemplateData: baseTemplateData => this.buildMongooseModelTemplateData(baseTemplateData as Record<string, unknown>)
      },
      {
        key: 'crud',
        templateCandidates: ['express-mongoose/crud', 'crud'],
        outputDir: moduleDir,
        outputFileName: `${fileBase}.crud.ts`,
        enabled: this.selectedFiles.crud ?? true
      },
      {
        key: 'filters',
        templateCandidates: ['express-mongoose/filters', 'filters'],
        outputDir: moduleDir,
        outputFileName: `${fileBase}.filters.ts`,
        enabled: this.selectedFiles.filters ?? true
      },
      {
        key: 'types',
        templateCandidates: ['express-mongoose/types', 'types'],
        outputDir: moduleDir,
        outputFileName: `${fileBase}.types.ts`,
        enabled: this.selectedFiles.types ?? true
      },
      {
        key: 'service',
        templateCandidates: ['express-mongoose/service', 'service'],
        outputDir: moduleDir,
        outputFileName: `${fileBase}.service.ts`,
        enabled: this.selectedFiles.service ?? true
      },
      {
        key: 'serviceAdmin',
        templateCandidates: ['express-mongoose/service.admin', 'service.admin'],
        outputDir: moduleDir,
        outputFileName: `${fileBase}.service.admin.ts`,
        enabled: this.isAdminUser && (this.selectedFiles.serviceAdmin ?? true)
      },
      {
        key: 'schema',
        templateCandidates: ['express-mongoose/schema', 'schema'],
        outputDir: moduleDir,
        outputFileName: `${fileBase}.schema.ts`,
        enabled: this.selectedFiles.schema ?? true
      },
      {
        key: 'route',
        templateCandidates: ['express-mongoose/route', 'route'],
        outputDir: moduleDir,
        outputFileName: `${fileBase}.routes.ts`,
        enabled: this.shouldAddRoute && (this.selectedFiles.route ?? true)
      },
      {
        key: 'routeAdmin',
        templateCandidates: ['express-mongoose/route.admin', 'route.admin'],
        outputDir: moduleDir,
        outputFileName: `${fileBase}.routes.admin.ts`,
        enabled: this.shouldAddRoute && this.isAdminUser && (this.selectedFiles.routeAdmin ?? true)
      }
    ];
  }

  private buildMongooseModelTemplateData(baseTemplateData: Record<string, unknown>): Record<string, unknown> {
    const normalizedModel = baseTemplateData.normalizedModel as NormalizedModel | undefined;
    if (!normalizedModel) {
      return baseTemplateData;
    }

    return {
      ...baseTemplateData,
      interfaceName: `I${normalizedModel.pascalName}`,
      interfaceExtends: 'Document',
      schemaName: `${normalizedModel.pascalName}Schema`,
      modelExportName: normalizedModel.pascalName,
      modelName: normalizedModel.pascalName,
      hasTimestamps: true,
      timestamps: { createdAt: true, updatedAt: true },
      hasModelTypePattern: false,
      hasInitializeFunction: false,
      initializeData: [],
      // Do not emit `_id` in Schema/interface body: Document already defines `_id`;
      // explicit `_id` + Schema<T> triggers TS2322 when type isn’t aligned with Hydrated inference.
      modelFields: this.toMongooseModelFields(normalizedModel).filter(f => {
        const n = String(f.name).trim();
        return n !== '_id' && n !== 'createdAt' && n !== 'updatedAt';
      })
    };
  }

  private resolveTemplateName(templateCandidates: string[]): string | null {
    const templatesDir = getTemplatesDir('backend');
    for (const templateName of templateCandidates) {
      const templatePath = join(templatesDir, `${templateName}.hbs`);
      const readResult = safeReadFile(templatePath);
      if (readResult.success && readResult.content) {
        return templateName;
      }
    }
    return null;
  }

  private buildNormalizedModel(): NormalizedModel {
    const entityNames = this.getEntityNames();
    const normalizedFields = (this.schema.fields || []).map((field: Record<string, unknown>) =>
      this.normalizeMongoIdField(this.normalizeField(field))
    );

    const ownershipField = normalizedFields.find((field: NormalizedField) => field.name.toLowerCase() === 'userid');

    return {
      name: entityNames.pascalCase,
      camelName: entityNames.camelCase,
      pascalName: entityNames.pascalCase,
      kebabName: this.toKebabCase(entityNames.pascalCase),
      fields: normalizedFields,
      ownership: ownershipField
        ? {
            field: ownershipField.name,
            normalApiFromAuth: this.isProtectedRoute,
            adminApiBodyAllowed: true,
            adminApiFilterable: ownershipField.filterable
          }
        : undefined
    };
  }

  private normalizeMongoIdField(field: NormalizedField): NormalizedField {
    if (this.sourceType !== 'nodejs-mongoose' || field.name !== '_id') {
      return field;
    }
    return { ...field, type: 'objectId', required: true, isArray: false };
  }

  private normalizeField(field: Record<string, unknown>): NormalizedField {
    const rawType = String(field.type || 'string').toLowerCase();
    const relationTarget = field.relationEntityName ? String(field.relationEntityName) : undefined;
    const isArray = Boolean(field.isArray);
    const normalizedType = this.mapFieldType(rawType, isArray);
    const filterable = Boolean(field.isSearchable);
    const relationPopulateFields = Array.isArray(field.relationPopulateFields)
      ? (field.relationPopulateFields as unknown[]).map(v => String(v).trim()).filter(Boolean)
      : undefined;

    return {
      name: String(field.name || ''),
      type: normalizedType,
      required: Boolean(field.required),
      isArray,
      filterable,
      filterType: filterable
        ? typeof field.filterType === 'string'
          ? (field.filterType as NormalizedField['filterType'])
          : this.resolveFilterType(normalizedType)
        : undefined,
      defaultValue: typeof field.defaultValue === 'string' ? field.defaultValue : '',
      isReadonly: Boolean(field.isReadonly),
      hiddenFromCreate: Boolean(field.hiddenFromCreate),
      hiddenFromUpdate: Boolean(field.hiddenFromUpdate),
      relation: relationTarget
        ? {
            target: relationTarget,
            type: typeof field.relationType === 'string' ? (field.relationType as NormalizedRelationType) : isArray ? 'oneToMany' : 'manyToOne',
            displayField: field.relationProperty ? String(field.relationProperty) : undefined
          }
        : undefined,
      relationPopulateFields: relationPopulateFields && relationPopulateFields.length > 0 ? relationPopulateFields : undefined,
      relationType: relationTarget
        ? typeof field.relationType === 'string'
          ? (field.relationType as NormalizedRelationType)
          : isArray
            ? 'oneToMany'
            : 'manyToOne'
        : undefined,
      trim: typeof field.trim === 'boolean' ? field.trim : undefined,
      unique: typeof field.unique === 'boolean' ? field.unique : undefined,
      ui: {
        showInTable: field.showInTable !== false,
        label: String(field.label || field.name || ''),
        uiComponent: field.uiComponent ? String(field.uiComponent) : undefined
      }
    };
  }

  private mapFieldType(rawType: string, _isArray: boolean): NormalizedFieldType {
    /** Keep element type (string, number, …); `isArray` on the field marks `[]` in TS/Mongoose — do not collapse to 'array'. */
    const lower = rawType.toLowerCase();
    if (lower.includes('mixed')) {
      return 'object';
    }
    if (rawType === 'schema') {
      return 'objectId';
    }
    if (rawType === 'date') {
      return 'date';
    }
    if (rawType === 'number') {
      return 'number';
    }
    if (rawType === 'boolean') {
      return 'boolean';
    }
    if (rawType === 'object') {
      return 'object';
    }
    return 'string';
  }

  private resolveFilterType(type: NormalizedFieldType): 'regex' | 'exact' | 'objectId' | 'range' | 'boolean' | 'date-range' {
    if (type === 'objectId') {
      return 'objectId';
    }
    if (type === 'number') {
      return 'exact';
    }
    if (type === 'boolean') {
      return 'boolean';
    }
    if (type === 'date') {
      return 'date-range';
    }
    return 'regex';
  }

  private toTemplateFields(model: NormalizedModel): Array<Record<string, unknown>> {
    return model.fields.map(field => ({
      name: field.name,
      required: field.required,
      isArray: field.isArray,
      isSearchable: field.filterable,
      filterType: field.filterType,
      defaultValue: field.defaultValue ?? '',
      isReadonly: field.isReadonly ?? false,
      hiddenFromCreate: field.hiddenFromCreate ?? false,
      hiddenFromUpdate: field.hiddenFromUpdate ?? false,
      showInTable: field.ui.showInTable,
      label: field.ui.label,
      uiComponent: field.ui.uiComponent,
      includeRelation: Boolean(field.relation),
      relationEntityName: field.relation?.target,
      relationProperty: field.relation?.displayField,
      relationPopulateFields: field.relationPopulateFields,
      relationType: field.relationType,
      /** Explicit DB field type for helpers (avoids Handlebars `type` name ambiguity in some contexts). */
      fieldDbType: field.type === 'objectId' ? 'schema' : field.type,
      type: field.type === 'objectId' ? 'schema' : field.type
    }));
  }

  private toMongooseModelFields(model: NormalizedModel): MongooseFieldShape[] {
    return model.fields.map(field => {
      const effectiveType = this.sourceType === 'nodejs-mongoose' && field.name === '_id' ? 'objectId' : field.type;
      const mongooseBaseType = this.toMongooseBaseType(effectiveType);
      const mongooseType = field.isArray ? `[${mongooseBaseType}]` : mongooseBaseType;
      const tsBaseType = this.toTsBaseType(effectiveType);
      const tsType = field.isArray ? `${tsBaseType}[]` : tsBaseType;

      return {
        name: field.name,
        tsType,
        mongooseType,
        required: field.required,
        unique: field.unique === true,
        trim: effectiveType === 'string' && field.trim === true,
        ref: field.relation?.target
      };
    });
  }

  private toMongooseBaseType(type: NormalizedFieldType): string {
    switch (type) {
      case 'number':
        return 'Number';
      case 'boolean':
        return 'Boolean';
      case 'date':
        return 'Date';
      case 'objectId':
        return 'Schema.Types.ObjectId';
      case 'object':
        return 'Schema.Types.Mixed';
      case 'array':
        // array element type is handled via isArray on field
        return 'Schema.Types.Mixed';
      case 'string':
      default:
        return 'String';
    }
  }

  private toTsBaseType(type: NormalizedFieldType): string {
    switch (type) {
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'date':
        return 'Date';
      case 'objectId':
        return 'mongoose.Types.ObjectId';
      case 'object':
        return 'Record<string, unknown>';
      case 'array':
        return 'unknown';
      case 'string':
      default:
        return 'string';
    }
  }

  private toKebabCase(value: string): string {
    return kebabCase(value);
  }

  /**
   * Generate a single file with update handling
   */
  private generateFile(
    templateName: string,
    templateType: 'backend' | 'frontend' | 'react',
    outputPath: string,
    fileName: string,
    templateData: Record<string, unknown>,
    options?: { alwaysRegenerate?: boolean }
  ): string | null {
    const filePath = join(outputPath, fileName);

    const shouldWrite = !safePathExists(filePath) || this.updateExistingFiles || options?.alwaysRegenerate === true;

    if (shouldWrite) {
      const renderResult = renderTemplate(templateName, templateData, templateType);

      if (renderResult.success && renderResult.content) {
        const contentToWrite = this.applyUpdateStrategy(filePath, renderResult.content, {
          mergeMarkersIfExisting: options?.alwaysRegenerate === true
        });
        if (!contentToWrite) {
          this.logWarn('Skipped file due to invalid custom marker structure', {
            step: 'update-merge',
            file: filePath,
            reason: 'invalid-custom-marker-structure'
          });
          return null;
        }

        const writeResult = safeWriteFile(filePath, contentToWrite, {
          ensureDirectory: true,
          createBackup: false
        });

        if (writeResult.success) {
          this.logInfo('Generated backend file', {
            step: 'file-write',
            file: filePath,
            action: this.updateExistingFiles || options?.alwaysRegenerate ? 'update' : 'create'
          });
          return filePath;
        } else {
          this.logError('Failed to write generated file', {
            step: 'file-write',
            file: filePath,
            reason: writeResult.error
          });
        }
      } else {
        this.logError('Failed to render template', {
          step: 'template-render',
          file: filePath,
          templateName,
          reason: renderResult.error
        });
      }
    } else {
      this.logInfo('File already exists, skipping', {
        step: 'file-check',
        file: filePath,
        reason: 'exists-and-update-disabled'
      });
    }

    return null;
  }

  private applyUpdateStrategy(filePath: string, renderedContent: string, options?: { mergeMarkersIfExisting?: boolean }): string | null {
    const fileExists = safePathExists(filePath);
    const shouldMergeCustomBlocks = fileExists && (this.updateExistingFiles || options?.mergeMarkersIfExisting === true);

    if (!shouldMergeCustomBlocks) {
      return renderedContent;
    }

    const existingFileResult = safeReadFile(filePath);
    if (!existingFileResult.success || !existingFileResult.content) {
      this.logWarn('Failed to read existing file for update strategy', {
        step: 'update-read',
        file: filePath,
        reason: 'read-failed'
      });
      return renderedContent;
    }

    const markerNames = getCustomBlockMarkersPresentInSource(renderedContent, getDefaultCustomBlockMarkerNames());
    if (markerNames.length === 0) {
      return renderedContent;
    }

    const mergeResult = applyCustomBlockMerge({
      existingContent: existingFileResult.content,
      renderedContent,
      markerNames,
      customImportsPrecedence: true
    });

    if (mergeResult.merged === null) {
      this.logWarn('Custom block merge failed', {
        step: 'custom-block-merge',
        file: filePath,
        reason: mergeResult.error,
        policy: this.mergeConflictPolicy.onMalformedExistingMarkers
      });
      return null;
    }

    this.logInfo('Custom block merge completed', {
      step: 'custom-block-merge',
      file: filePath,
      markers: markerNames
    });

    return mergeResult.merged;
  }

  /**
   * Add route to src/index.ts
   */
  private addRouteToIndex(moduleName: string, entityNameLower: string): void {
    const indexPath = this.findIndexFile();

    if (!indexPath) {
      this.logWarn('Could not find index.ts, app.ts, or server.ts file');
      return;
    }

    try {
      this.injectRouteToFile(indexPath, moduleName, entityNameLower);
      this.logInfo('Route added to index', { indexPath, entityName: this.schema.entityName });
    } catch (error) {
      this.logError('Failed to add route to index', {
        indexPath,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Add admin route to index (e.g. /api/entity/admin)
   */
  private addAdminRouteToIndex(moduleName: string, entityNameLower: string): void {
    const indexPath = this.findIndexFile();

    if (!indexPath) {
      this.logWarn('Could not find index.ts, app.ts, or server.ts file');
      return;
    }

    try {
      this.injectAdminRouteToFile(indexPath, moduleName, entityNameLower);
      this.logInfo('Admin route added to index', { indexPath, entityName: this.schema.entityName });
    } catch (error) {
      this.logError('Failed to add admin route to index', {
        indexPath,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Inject admin route import and usage to index file
   */
  private injectAdminRouteToFile(indexPath: string, moduleName: string, entityNameLower: string): void {
    const readResult = safeReadFile(indexPath);

    if (!readResult.success || !readResult.content) {
      throw new Error(`Failed to read ${indexPath}`);
    }

    const content = readResult.content;
    const lines = content.split('\n');

    const routeVariableName = `${entityNameLower}AdminRoutes`;
    const adminPath = `${this.baseUrl}/${moduleName}/admin`;

    const routePattern = new RegExp(`app\\.use\\(['"]${adminPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`);
    if (lines.some(line => routePattern.test(line))) {
      this.logInfo('Admin route already exists in index', { entityNameLower, indexPath });
      return;
    }

    const importPattern = new RegExp(`import.*from.*['"]\\./modules/${moduleName}/${moduleName}\\.routes\\.admin['"]`);
    const hasImport = lines.some(line => importPattern.test(line));

    const lastImportIndex = this.findLastImportIndex(lines);
    const lastAppUseIndex = this.findLastAppUseIndex(lines);

    if (lastAppUseIndex === -1) {
      throw new Error('Could not find a suitable location to add the admin route');
    }

    if (!hasImport && lastImportIndex !== -1) {
      const importLine = `import ${routeVariableName} from './modules/${moduleName}/${moduleName}.routes.admin';`;
      lines.splice(lastImportIndex + 1, 0, importLine);
    }

    const routeLine = `app.use('${adminPath}', ${routeVariableName});`;
    const insertIndex = hasImport ? lastAppUseIndex + 1 : lastAppUseIndex + 2;
    lines.splice(insertIndex, 0, routeLine);

    const newContent = lines.join('\n');
    safeWriteFile(indexPath, newContent, { createBackup: false });

    this.logInfo('Admin route injected', { routeLine, indexPath });
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
      if (safePathExists(path)) {
        return path;
      }
    }

    return null;
  }

  /**
   * Inject route import and usage to index file
   */
  private injectRouteToFile(indexPath: string, moduleName: string, entityNameLower: string): void {
    const readResult = safeReadFile(indexPath);

    if (!readResult.success || !readResult.content) {
      throw new Error(`Failed to read ${indexPath}`);
    }

    const content = readResult.content;
    const lines = content.split('\n');

    // Generate route variable name
    const routeVariableName = `${entityNameLower}Route`;

    // Check if route already exists
    const routePattern = new RegExp(`app\\.use\\(['"]${this.baseUrl}/${moduleName}['"]`);
    const hasRoute = lines.some(line => routePattern.test(line));

    if (hasRoute) {
      this.logInfo('Route already exists in index', { entityNameLower, indexPath });
      return;
    }

    // Check if import already exists
    const importPattern = new RegExp(`import.*from.*['"]\\./modules/${moduleName}/${moduleName}\\.routes['"]`);
    const hasImport = lines.some(line => importPattern.test(line));

    // Find insertion points
    const lastImportIndex = this.findLastImportIndex(lines);
    const lastAppUseIndex = this.findLastAppUseIndex(lines);

    if (lastAppUseIndex === -1) {
      throw new Error('Could not find a suitable location to add the route');
    }

    // Add import if needed
    if (!hasImport && lastImportIndex !== -1) {
      const importLine = `import ${routeVariableName} from './modules/${moduleName}/${moduleName}.routes';`;
      lines.splice(lastImportIndex + 1, 0, importLine);
    }

    // Add route
    const routeLine = `app.use('${this.baseUrl}/${moduleName}', ${routeVariableName});`;
    const insertIndex = hasImport ? lastAppUseIndex + 1 : lastAppUseIndex + 2; // +2 if we added import
    lines.splice(insertIndex, 0, routeLine);

    // Write back
    const newContent = lines.join('\n');
    safeWriteFile(indexPath, newContent, { createBackup: false });

    this.logInfo('Route injected', { routeLine, indexPath });
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
