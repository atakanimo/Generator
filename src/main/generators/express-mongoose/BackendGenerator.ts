/**
 * Backend Generator
 * Generates backend code (routes, services, types) from templates
 */

import { BaseGenerator, GenerateOptions, GenerateResult } from './BaseGenerator.js';
import { renderTemplate, clearTemplateCache } from '../../utils/templateEngine.js';
import { safeWriteFile, safeReadFile, safePathExists } from '../../utils/fileUtils.js';
import { applyCustomBlockMerge, hasCustomToJsonTransformContent } from '../../utils/customBlockMerge.js';
import { getCustomBlockMarkersPresentInSource, getDefaultCustomBlockMarkerNames } from '../../utils/customBlockMarkers.js';
import { handleError, ErrorCode } from '../../utils/errorHandler.js';
import { log } from '../../utils/logger.js';
import { getGeneratorRoot, getTemplatesDir } from '../../utils/templateHelpers.js';
import { join } from 'path';
import { kebabCase, moduleNameFromEntity } from '../../utils/namingUtils.js';
import { mergeMongoAuditBackendTemplateFields } from '../../utils/mongoAuditFields.js';
import { isGeneratorOwnedSource } from '../../utils/generatedFileOwnership.js';
import { missingHostExports } from '../../utils/coreAssetImports.js';
import {
  NORMAL_OPERATIONS,
  NORMAL_WRITE_OPERATIONS,
  type NormalizedModel as V2Model,
  type NormalOperation
} from '../../../shared/normalizedModel.js';
import {
  buildMongooseModelContext,
  normalizeField,
  normalizeMongoIdField,
  type BeField
} from '../../utils/mongooseModelContext.js';

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
  key: 'model' | 'crud' | 'filters' | 'types' | 'service' | 'serviceAdmin' | 'schema' | 'route' | 'routeAdmin' | 'hooks';
  templateCandidates: string[];
  outputDir: string;
  outputFileName: string;
  enabled: boolean;
  buildTemplateData?: (baseTemplateData: Record<string, unknown>) => Record<string, unknown>;
  /** When true, write even if file exists while updateExistingFiles is false. Model still supports merge markers (e.g. custom-tojson-transform) when update mode is on. */
  alwaysRegenerate?: boolean;
}



/** BE generation context: names + derived fields + ownership, built from the v2 model (`source`). */
interface BeModelContext {
  source: V2Model;
  name: string;
  camelName: string;
  pascalName: string;
  kebabName: string;
  fields: BeField[];
  ownership?: {
    /** `self`: the record is the user (G5) — no ownership field, scope `{ _id: authUserId }`. */
    kind: 'field' | 'self';
    /** Ownership field name (`userId`); empty for `self`. */
    field: string;
    normalApiFromAuth: boolean;
    adminApiBodyAllowed: boolean;
    adminApiFilterable: boolean;
  };
}


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
      this.logInfo('BeModelContext build started', { step: 'normalized-model-build' });
      const normalizedModel = this.buildNormalizedModel();
      const moduleName = normalizedModel.kebabName;
      this.logInfo('BeModelContext created', {
        step: 'normalized-model-build',
        ownershipField: normalizedModel.ownership?.field ?? null,
        fieldCount: normalizedModel.fields.length
      });
      const normalApi = this.resolveNormalApi(normalizedModel);
      const templateData = {
        entityName: normalizedModel.pascalName,
        fields: mergeMongoAuditBackendTemplateFields(this.sourceType, this.toTemplateFields(normalizedModel)),
        isProtectedRoute: this.isProtectedRoute,
        isAdminUser: this.isAdminUser,
        ...normalApi,
        entityNameLower: normalizedModel.camelName,
        camelEntityName: normalizedModel.camelName,
        moduleName,
        sourceType: this.sourceType,
        normalizedModel
      };

      // Generate files in parallel
      this.logInfo('Generation queue created', { step: 'queue-creation' });
      // P5 #24: with no normal operation a new model gets no normal route file; an existing one keeps its custom routes.
      const normalRouteWanted = normalApi.hasNormalOps === true || this.normalRouteFileExists(moduleName);
      const files = this.generateBackendFiles(templateData, {
        entityNameLower: normalizedModel.camelName,
        moduleName,
        normalRouteWanted
      });

      // Add route to index if needed
      if (normalRouteWanted && this.shouldAddRoute && (this.sourceType === 'nodejs-mongoose' || this.sourceType === 'nodejs-typeorm')) {
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
        sourceRelativePath: 'src/generator-assets/express-mongoose/errors/error-codes.ts',
        targetRelativePath: 'src/core/errors/error-codes.ts'
      },
      {
        sourceRelativePath: 'src/generator-assets/express-mongoose/errors/error.helper.ts',
        targetRelativePath: 'src/core/errors/error.helper.ts'
      },
      {
        sourceRelativePath: 'src/generator-assets/express-mongoose/logging/logger.ts',
        targetRelativePath: 'src/core/logging/logger.ts'
      },
      // logger.ts imports (bootstrap must be import-closed, plan 5 P2.1)
      {
        sourceRelativePath: 'src/generator-assets/express-mongoose/logging/job-log-context.ts',
        targetRelativePath: 'src/core/logging/job-log-context.ts'
      },
      {
        sourceRelativePath: 'src/generator-assets/express-mongoose/logging/pino-stdout-file-tee.ts',
        targetRelativePath: 'src/core/logging/pino-stdout-file-tee.ts'
      },
      {
        sourceRelativePath: 'src/generator-assets/express-mongoose/logging/daily-log-file-path.ts',
        targetRelativePath: 'src/core/logging/daily-log-file-path.ts'
      },
      {
        sourceRelativePath: 'src/generator-assets/express-mongoose/pagination/pagination.helper.ts',
        targetRelativePath: 'src/core/pagination/pagination.helper.ts'
      },
      {
        sourceRelativePath: 'src/generator-assets/express-mongoose/filters/filter-query.helper.ts',
        targetRelativePath: 'src/core/filters/filter-query.helper.ts'
      },
      {
        sourceRelativePath: 'src/generator-assets/express-mongoose/response/response.helper.ts',
        targetRelativePath: 'src/core/response/response.helper.ts'
      },
      {
        sourceRelativePath: 'src/generator-assets/express-mongoose/response/wire.ts',
        targetRelativePath: 'src/core/response/wire.ts'
      },
      {
        sourceRelativePath: 'src/generator-assets/express-mongoose/schema/list-pagination.schema.ts',
        targetRelativePath: 'src/core/schema/list-pagination.schema.ts'
      },
      {
        sourceRelativePath: 'src/generator-assets/express-mongoose/types/api-contract.ts',
        targetRelativePath: 'src/core/types/api-contract.ts'
      },
      {
        sourceRelativePath: 'src/generator-assets/express-mongoose/services/base-crud.service.ts',
        targetRelativePath: 'src/core/services/base-crud.service.ts'
      },
      {
        sourceRelativePath: 'src/generator-assets/express-mongoose/services/crud-projection.ts',
        targetRelativePath: 'src/core/services/crud-projection.ts'
      },
      {
        sourceRelativePath: 'src/generator-assets/express-mongoose/services/crud-scope.ts',
        targetRelativePath: 'src/core/services/crud-scope.ts'
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

      // An existing (kept) sibling may be an older copy without a name this asset imports: skip, do not break the host.
      const missing = missingHostExports(sourceRead.content, targetPath);
      if (missing.length > 0) {
        this.logWarn('Core bootstrap file skipped (host sibling lacks imported exports)', {
          step: 'core-bootstrap-create',
          file: targetPath,
          reason: 'missing-host-exports',
          missing
        });
        continue;
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
    names: { entityNameLower: string; moduleName: string; normalRouteWanted: boolean }
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
        'backend-express-mongoose',
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

  private normalRouteFileExists(moduleName: string): boolean {
    return safePathExists(join(this.projectRoot, 'src', 'modules', moduleName, `${moduleName}.routes.ts`));
  }

  private createArtifactManifest(names: { entityNameLower: string; moduleName: string; normalRouteWanted: boolean }): ArtifactConfig[] {
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
        enabled: this.selectedFiles.service ?? true,
        buildTemplateData: baseTemplateData => ({
          ...baseTemplateData,
          needsMongooseDocumentLean: this.resolveNeedsMongooseDocumentLean(moduleDir, fileBase)
        })
      },
      {
        // Business-rule hooks of both services: created once without a generator header, so the file is
        // user-owned from then on and never overwritten.
        key: 'hooks',
        templateCandidates: ['express-mongoose/hooks', 'hooks'],
        outputDir: moduleDir,
        outputFileName: `${fileBase}.hooks.ts`,
        enabled:
          ((this.selectedFiles.service ?? true) || (this.isAdminUser && (this.selectedFiles.serviceAdmin ?? true))) &&
          this.servicesAreGeneratorOwned(moduleDir, fileBase)
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
        enabled: names.normalRouteWanted && this.shouldAddRoute && (this.selectedFiles.route ?? true)
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

  /** Hooks only serve generated services: a module whose service files are user-owned (no header) gets none. */
  private servicesAreGeneratorOwned(moduleDir: string, fileBase: string): boolean {
    return ['service', 'service.admin'].every(suffix => {
      const existing = safeReadFile(join(moduleDir, `${fileBase}.${suffix}.ts`));
      return !existing.success || !existing.content || isGeneratorOwnedSource(existing.content);
    });
  }

  /**
   * Model `custom-tojson-transform` doluysa normal API servisi Mongoose dokümanı döndürmeli
   * (`lean: false`) — `.lean()` toJSON transform'u atlar. Admin serviste gerek yok.
   */
  private resolveNeedsMongooseDocumentLean(moduleDir: string, fileBase: string): boolean {
    if (!this.isExpressMongooseStack()) {
      return false;
    }
    const modelPath = join(moduleDir, `${fileBase}.model.ts`);
    const read = safeReadFile(modelPath);
    if (!read.success || !read.content) {
      return false;
    }
    return hasCustomToJsonTransformContent(read.content);
  }

  private buildMongooseModelTemplateData(baseTemplateData: Record<string, unknown>): Record<string, unknown> {
    const normalizedModel = baseTemplateData.normalizedModel as BeModelContext | undefined;
    if (!normalizedModel) {
      return baseTemplateData;
    }
    const moduleName = moduleNameFromEntity(normalizedModel.pascalName);
    const existing = safeReadFile(join(this.projectRoot, 'src', 'modules', moduleName, `${moduleName}.model.ts`));
    // Do not emit `_id` in Schema/interface body: Document already defines `_id` (builder filters it).
    return {
      ...baseTemplateData,
      ...buildMongooseModelContext(normalizedModel.source, {
        pascalName: normalizedModel.pascalName,
        sourceType: this.sourceType,
        existingContent: existing.success ? existing.content : null,
        // Before P3 every generated model had both timestamps; keep that when the source does not say.
        timestampsFallback: { createdAt: true, updatedAt: true }
      })
    };
  }

  private resolveTemplateName(templateCandidates: string[]): string | null {
    const templatesDir = getTemplatesDir('backend-express-mongoose');
    for (const templateName of templateCandidates) {
      const templatePath = join(templatesDir, `${templateName}.hbs`);
      const readResult = safeReadFile(templatePath);
      if (readResult.success && readResult.content) {
        return templateName;
      }
    }
    return null;
  }

  private buildNormalizedModel(): BeModelContext {
    const entityNames = this.getEntityNames();
    const source: V2Model = { ...(this.schema as V2Model), fields: this.schema.fields || [] };
    const normalizedFields = source.fields.map(field => normalizeMongoIdField(normalizeField(field), this.sourceType));

    const ownershipField = normalizedFields.find((field: BeField) => field.name.toLowerCase() === 'userid');
    const ownership: BeModelContext['ownership'] =
      source.ownership?.kind === 'self'
        ? { kind: 'self', field: '', normalApiFromAuth: this.isProtectedRoute, adminApiBodyAllowed: false, adminApiFilterable: false }
        : ownershipField
          ? {
              kind: 'field',
              field: ownershipField.name,
              normalApiFromAuth: this.isProtectedRoute,
              adminApiBodyAllowed: true,
              adminApiFilterable: ownershipField.filterable
            }
          : undefined;

    return {
      source,
      name: entityNames.pascalCase,
      camelName: entityNames.camelCase,
      pascalName: entityNames.pascalCase,
      kebabName: this.toKebabCase(entityNames.pascalCase),
      fields: normalizedFields,
      ownership
    };
  }

  /**
   * Normal (mobile) API surface (plan 5 P4 #22, contract §2.1, G5).
   * Requested set: `api.normalOperations`, else every operation (pre-P4 behaviour until P5 stores the set).
   * Writes need auth + ownership; a `self` model has no create (the record is the user).
   */
  private resolveNormalApi(model: BeModelContext): Record<string, unknown> & { hasNormalOps: boolean } {
    const requested = model.source.api?.normalOperations ?? NORMAL_OPERATIONS;
    const canWrite = this.isProtectedRoute && model.ownership !== undefined;
    const isSelf = model.ownership?.kind === 'self';
    const normalOps = Object.fromEntries(NORMAL_OPERATIONS.map(op => [op, false])) as Record<NormalOperation, boolean>;
    const dropped: NormalOperation[] = [];
    for (const op of requested) {
      if (!NORMAL_OPERATIONS.includes(op)) continue;
      const isWrite = NORMAL_WRITE_OPERATIONS.includes(op);
      if ((isWrite && !canWrite) || (op === 'create' && isSelf)) {
        dropped.push(op);
        continue;
      }
      normalOps[op] = true;
    }
    if (dropped.length > 0) {
      this.logWarn('Normal API operations dropped', {
        step: 'normal-api',
        entityName: model.pascalName,
        dropped,
        reason: !this.isProtectedRoute ? 'unprotected-route' : model.ownership === undefined ? 'no-ownership' : 'self-ownership-create'
      });
    }
    const hasAdminOnly = model.fields.some(field => field.adminOnly === true);
    return {
      normalOps,
      hasNormalOps: Object.values(normalOps).some(Boolean),
      authScope: canWrite ? (isSelf ? "'self'" : 'true') : 'false',
      hiddenFields: model.fields.filter(field => field.hidden === true).map(field => field.name),
      /** Admin update keeps `userId` in the body: an admin may reassign the owner (G5). */
      adminOwnershipInBody: model.ownership?.kind === 'field',
      /** Admin route uses `*AdminSchema` when the normal schema omits something (ownership field, adminOnly fields). */
      adminSchemaVariant: this.isAdminUser && (Boolean(model.ownership?.field) || hasAdminOnly)
    };
  }






  private toTemplateFields(model: BeModelContext): Array<Record<string, unknown>> {
    return model.fields.map(field => ({
      name: field.name,
      required: field.required,
      isArray: field.isArray,
      isSearchable: field.filterable && field.hidden !== true,
      filterType: this.resolveTemplateFilterType(field),
      enumValues: field.enumValues && field.enumValues.length > 0 ? field.enumValues : undefined,
      /** `default: null` in the model: the API takes / returns `null` for this field. */
      nullable: field.schemaDefault === null ? true : undefined,
      /** Literal model `default:` — the create schema applies it when the field is omitted. */
      schemaDefault: field.schemaDefault ?? undefined,
      isHidden: field.hidden === true ? true : undefined,
      adminOnly: field.adminOnly === true ? true : undefined,
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
      relationPropertyObjectFields: field.relationPropertyObjectFields,
      relationType: field.relationType,
      /** Explicit DB field type for helpers (avoids Handlebars `type` name ambiguity in some contexts). */
      fieldDbType: field.type,
      type: field.type,
      objectFields:
        field.type === 'object' && !field.isMap && Array.isArray(field.objectFields)
          ? field.objectFields.map(sub => ({
              ...sub,
              includeRelation: sub.type === 'schema' && Boolean(sub.ref),
              relationEntityName: sub.ref
            }))
          : undefined,
      nestedTypeName: field.nestedTypeName,
      nestedSchemaName: field.nestedSchemaName,
      isMap: field.isMap === true ? true : undefined
    }));
  }




  /** Enum fields filter by equality / `$in` (contract §3) unless another filter type was chosen explicitly. */
  private resolveTemplateFilterType(field: BeField): string | undefined {
    const hasEnum = Array.isArray(field.enumValues) && field.enumValues.length > 0 && !field.isArray;
    if (hasEnum && (field.filterType === undefined || field.filterType === 'regex' || field.filterType === 'exact')) {
      return 'enum';
    }
    return field.filterType;
  }

  private toKebabCase(value: string): string {
    return kebabCase(value);
  }

  /**
   * Generate a single file with update handling
   */
  private generateFile(
    templateName: string,
    templateType: 'backend-express-mongoose',
    outputPath: string,
    fileName: string,
    templateData: Record<string, unknown>,
    options?: { alwaysRegenerate?: boolean }
  ): string | null {
    const filePath = join(outputPath, fileName);

    if (safePathExists(filePath)) {
      const existing = safeReadFile(filePath);
      if (existing.success && !isGeneratorOwnedSource(existing.content ?? '')) {
        this.logWarn('Skipped user-owned file (no generator header)', {
          step: 'file-write',
          file: filePath,
          action: 'skip',
          reason: 'user-owned'
        });
        return null;
      }
    }

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
      markerNames
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
