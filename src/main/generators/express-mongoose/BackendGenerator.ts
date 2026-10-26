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
import { getTemplatesDir } from '../../utils/templateHelpers.js';
import { join } from 'path';
import { findAdminMountPath, findBackendAppFile, findNormalMountPath } from '../../utils/backendAppFile.js';
import { kebabCase, moduleNameFromEntity } from '../../utils/namingUtils.js';
import { mergeMongoAuditBackendTemplateFields } from '../../utils/mongoAuditFields.js';
import { isGeneratorOwnedSource } from '../../utils/generatedFileOwnership.js';
import { ensureExpressCoreAssets } from './expressCoreAssets.js';
import {
  NORMAL_OPERATIONS,
  NORMAL_WRITE_OPERATIONS,
  adminExportEnabled,
  resolveAdminOperations,
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

      // Add route to index if needed: only when the route file is generated now or already there (an unselected
      // route file must not leave an import of a missing module in the app file).
      const normalRouteFile = this.selectedFiles.route || this.normalRouteFileExists(moduleName);
      if (normalRouteWanted && normalRouteFile && this.shouldAddRoute && (this.sourceType === 'nodejs-mongoose' || this.sourceType === 'nodejs-typeorm')) {
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
      const adminRouteFile =
        this.selectedFiles.routeAdmin || safePathExists(join(this.projectRoot, 'src', 'modules', moduleName, `${moduleName}.routes.admin.ts`));
      if (this.isAdminUser && adminRouteFile && (this.sourceType === 'nodejs-mongoose' || this.sourceType === 'nodejs-typeorm')) {
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

    ensureExpressCoreAssets(this.projectRoot);
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
    const adminOpList = resolveAdminOperations(model.source.api);
    const exportOn = adminExportEnabled(model.source.api);
    // Export columns (api-contract §2 "Export"): row fields in order (`hidden` never); a populated reference shows
    // its `display` field.
    const visibleFields = model.fields.filter(field => field.hidden !== true && !['_id', 'id', 'createdAt', 'updatedAt'].includes(field.name));
    const timestamps = model.source.timestamps ?? { createdAt: true, updatedAt: true };
    const exportFields = [
      'id',
      ...visibleFields.map(field => field.name),
      ...(timestamps.createdAt ? ['createdAt'] : []),
      ...(timestamps.updatedAt ? ['updatedAt'] : [])
    ];
    const exportDisplay = visibleFields
      .filter(field => field.relation?.displayField && (field.relationPopulateFields?.length || field.relation.displayField))
      .map(field => ({ name: field.name, display: field.relation!.displayField! }));
    return {
      normalOps,
      /** Admin routes (`api.adminOperations`; `list` always; `export` only when listed, PY12). */
      adminOps: { ...Object.fromEntries(NORMAL_OPERATIONS.map(op => [op, adminOpList.includes(op)])), export: exportOn },
      exportFieldsLiteral: exportOn ? exportFields.map(name => `'${name}'`).join(', ') : '',
      exportDisplay,
      /** Export file name module (api-contract §2: `kebabCase(entityName)`). */
      adminRoute: kebabCase(model.source.entityName),
      hasNormalOps: Object.values(normalOps).some(Boolean),
      authScope: canWrite ? (isSelf ? "'self'" : 'true') : 'false',
      hiddenFields: model.fields.filter(field => field.hidden === true).map(field => field.name),
      /** List reads leave out `hidden` and `detailOnly` fields (getOne reads `detailOnly`). Empty → no projection option. */
      listProjection: model.fields
        .filter(field => field.detailOnly === true)
        .concat(model.fields.filter(field => field.hidden === true && field.detailOnly !== true))
        .map(field => `-${field.name}`)
        .join(' '),
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
      enumNumbers: field.enumNumbers,
      numberFormat: field.numberFormat,
      dateFormat: field.dateFormat,
      format: field.format,
      constraints: field.constraints,
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

  /** Mount the normal router (`<module>.routes`) in the BE app file unless it is already mounted. */
  private addRouteToIndex(moduleName: string, entityNameLower: string): void {
    this.mountRouter(moduleName, 'normal', `${entityNameLower}Route`, `${this.baseUrl}/${moduleName}`);
  }

  /** Mount the admin router (`<module>.routes.admin`, e.g. `/api/<module>/admin`) unless it is already mounted. */
  private addAdminRouteToIndex(moduleName: string, entityNameLower: string): void {
    this.mountRouter(moduleName, 'admin', `${entityNameLower}AdminRoutes`, `${this.baseUrl}/${moduleName}/admin`);
  }

  /**
   * Import + `app.use(mountPath, router)` in the BE app file (`findBackendAppFile`: the file that mounts the routers).
   * "Already mounted" is read from the file (import of the router file + its `app.use`), not derived from the path:
   * existing projects mount under their own paths (`/api/symboltypes`). The import follows the file's existing router
   * imports (`@modules/…` or `./modules/…`); the `app.use` line goes after the last router mount, with its indent.
   */
  private mountRouter(moduleName: string, kind: 'normal' | 'admin', variable: string, mountPath: string): void {
    const appFile = findBackendAppFile(this.projectRoot);
    if (!appFile) {
      this.logWarn('Could not find the backend app file (src/app.ts, src/index.ts, src/server.ts)');
      return;
    }
    const existing = kind === 'admin' ? findAdminMountPath(this.projectRoot, moduleName) : findNormalMountPath(this.projectRoot, moduleName);
    if (existing) {
      this.logInfo('Route already mounted', { moduleName, kind, mountPath: existing, appFile });
      return;
    }
    try {
      const readResult = safeReadFile(appFile);
      if (!readResult.success || !readResult.content) throw new Error(`Failed to read ${appFile}`);
      const lines = readResult.content.split('\n');
      const lastMount = this.findLastAppUseIndex(lines);
      if (lastMount === -1) throw new Error('No app.use(...) router mount to add the route after');
      const routeFile = `${moduleName}/${moduleName}.routes${kind === 'admin' ? '.admin' : ''}`;
      const prefix = /from\s+['"]([^'"]*modules\/)[^'"]+\.routes(?:\.admin)?['"]/.exec(readResult.content)?.[1] ?? './modules/';
      const indent = /^\s*/.exec(lines[lastMount])?.[0] ?? '';
      lines.splice(lastMount + 1, 0, `${indent}app.use('${mountPath}', ${variable});`);
      lines.splice(this.findLastImportIndex(lines) + 1, 0, `import ${variable} from '${prefix}${routeFile}';`);
      safeWriteFile(appFile, lines.join('\n'), { createBackup: false });
      this.logInfo('Route mounted', { moduleName, kind, mountPath, appFile });
    } catch (error) {
      this.logError('Failed to mount route', { appFile, moduleName, kind, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  private findLastImportIndex(lines: string[]): number {
    let lastIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('import ')) lastIndex = i;
    }
    return lastIndex;
  }

  /** Last `app.use('/…', …)` line (a router mount), so the new mount stays before error / docs handlers. */
  private findLastAppUseIndex(lines: string[]): number {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (/app\.use\(\s*['"]\//.test(lines[i])) return i;
    }
    return -1;
  }
}
