import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import Handlebars from 'handlebars';
import { SchemaDefinition } from './schemaParser';
import { getTemplatesDir, registerHandlebarsHelpers, toCamelCase, getProjectRootPath } from '../utils/templateHelpers.js';
import { injectRoute, injectReducer } from '../utils/injector.js';
import { logGenerate, log } from '../utils/logger.js';

export interface GenerateFrontendResult {
  success: boolean;
  files?: {
    service?: string;
    thunk?: string;
    slice?: string;
    page?: string;
    table?: string;
    modal?: string;
  };
  warnings?: string[];
  errors?: string[];
}

/**
 * Generate frontend code (service, thunk, slice, page) from templates
 */
/**
 * Parse base URL from backend src/index.ts file
 * Looks for patterns like: app.use('/api/users', userRoutes) or app.use('/api', routes)
 * Exported for use in IPC handlers
 */
export function parseBaseUrlFromBackend(backendPath: string): string {
  try {
    const projectRoot = getProjectRootPath(backendPath);
    const indexPath = join(projectRoot, 'src', 'index.ts');

    if (!existsSync(indexPath)) {
      // Try alternative paths
      const altPaths = [
        join(projectRoot, 'src', 'app.ts'),
        join(projectRoot, 'src', 'server.ts'),
        join(projectRoot, 'index.ts'),
        join(projectRoot, 'app.ts'),
        join(projectRoot, 'server.ts')
      ];

      for (const altPath of altPaths) {
        if (existsSync(altPath)) {
          const content = readFileSync(altPath, 'utf-8');
          // Look for all app.use patterns to find the base API path
          const matches = Array.from(content.matchAll(/app\.use\(['"]([^'"]+)['"]/g));

          if (matches.length > 0) {
            const apiRoutes = matches.map(m => m[1]).filter(path => path.startsWith('/api'));

            if (apiRoutes.length > 0) {
              const firstRoute = apiRoutes[0];
              const parts = firstRoute.split('/').filter(p => p);

              if (parts.length >= 1 && parts[0] === 'api') {
                if (parts.length >= 2) {
                  // Has sub-path like /api/assety
                  return `/${parts[0]}/${parts[1]}`;
                }
                return '/api';
              }

              return firstRoute;
            }
          }
        }
      }

      return '/api'; // Default fallback
    }

    const content = readFileSync(indexPath, 'utf-8');
    // Look for all app.use patterns to find the base API path
    // Examples: app.use('/api/assety/user', ...) -> extract '/api/assety'
    //          app.use('/api/users', ...) -> extract '/api'
    const matches = Array.from(content.matchAll(/app\.use\(['"]([^'"]+)['"]/g));

    if (matches.length > 0) {
      // Find routes that start with /api
      const apiRoutes = matches.map(m => m[1]).filter(path => path.startsWith('/api'));

      if (apiRoutes.length > 0) {
        // Get the first API route and extract base path
        const firstRoute = apiRoutes[0];

        // If route is like '/api/assety/user', extract '/api/assety'
        // If route is like '/api/users', extract '/api'
        // Split by '/' and take /api and optionally next segment
        const parts = firstRoute.split('/').filter(p => p);

        if (parts.length >= 1 && parts[0] === 'api') {
          if (parts.length >= 2) {
            // Has sub-path like /api/assety
            return `/${parts[0]}/${parts[1]}`;
          }
          return '/api';
        }

        return firstRoute;
      }
    }

    return '/api'; // Default fallback
  } catch (error) {
    log(`Error parsing base URL from backend: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    return '/api'; // Default fallback
  }
}

export function generateFrontend(
  schema: SchemaDefinition,
  projectPath: string,
  selectedFiles?: { service?: boolean; thunk?: boolean; slice?: boolean; page?: boolean },
  backendPath?: string,
  features?: { deletable?: boolean; updatable?: boolean },
  baseUrl?: string,
  sourceType?: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null,
  isProtectedRoute?: boolean,
  updateExistingFiles?: boolean,
  isSuperUser?: boolean
): GenerateFrontendResult {
  log(`[STEP 0] Frontend generation started for entity: ${schema.entityName}`);
  log(`[STEP 0] Project path: ${projectPath}`);
  log(`[STEP 0] Backend path: ${backendPath || 'not provided'}`);
  log(`[STEP 0] Selected files: ${JSON.stringify(selectedFiles)}`);
  log(`[STEP 0] Features: ${JSON.stringify(features)}`);
  log(`[STEP 0] Base URL: ${baseUrl || 'not provided'}`);
  log(`[STEP 0] Source type: ${sourceType || 'not provided'}`);
  log(`[STEP 0] Is protected route: ${isProtectedRoute === true}`);
  log(`[STEP 0] Is super user: ${isSuperUser === true}`);

  const warnings: string[] = [];
  const errors: string[] = [];
  const generatedFiles: { service?: string; thunk?: string; slice?: string; page?: string; table?: string; modal?: string } = {};

  try {
    registerHandlebarsHelpers();

    const templatesDir = getTemplatesDir('frontend');

    const entityName = schema.entityName;
    const camelEntityName = toCamelCase(entityName);
    const entityNameLower = entityName.toLowerCase();

    // Get the actual project root (handle cases where path includes 'src')
    const projectRoot = getProjectRootPath(projectPath);
    log(`[STEP 4] Project root: ${projectRoot}`);

    log(`[STEP 5] Checking if slice already exists...`);
    // Step 1: Check if slice already exists (warning only, continue generation)
    const slicePath = join(projectRoot, 'src', 'store', 'slices', `${camelEntityName}.slice.ts`);
    const sliceExists = existsSync(slicePath);
    log(`[STEP 5] Slice path: ${slicePath}, Exists: ${sliceExists}`);
    if (sliceExists) {
      warnings.push(`Slice file already exists, skipped: ${slicePath}`);
      log(`[STEP 5] Warning: Slice file already exists`);
    }

    log(`[STEP 6] Ensuring required directories exist...`);
    // Step 2: Ensure required directories exist
    const servicesDir = join(projectRoot, 'src', 'services');
    const thunksDir = join(projectRoot, 'src', 'store', 'thunks');
    const slicesDir = join(projectRoot, 'src', 'store', 'slices');
    const pagesDir = join(projectRoot, 'src', 'pages', entityName);
    const componentsDir = join(projectRoot, 'src', 'components');

    log(`[STEP 6] Services dir: ${servicesDir}`);
    log(`[STEP 6] Thunks dir: ${thunksDir}`);
    log(`[STEP 6] Slices dir: ${slicesDir}`);
    log(`[STEP 6] Pages dir: ${pagesDir}`);
    log(`[STEP 6] Components dir: ${componentsDir}`);

    [servicesDir, thunksDir, slicesDir, pagesDir, componentsDir].forEach(dir => {
      if (!existsSync(dir)) {
        log(`[STEP 6] Creating directory: ${dir}`);
        mkdirSync(dir, { recursive: true });
        log(`[STEP 6] Directory created: ${dir}`);
      }
    });

    // Use provided baseUrl or parse from backend if backend path is provided
    let finalBaseUrl = '/api'; // Default
    log(`[STEP 7] Initial baseUrl (default): ${finalBaseUrl}`);

    if (baseUrl && typeof baseUrl === 'string' && baseUrl.trim() !== '') {
      // Use user-provided baseUrl
      log(`[STEP 7] User provided baseUrl: ${baseUrl}`);
      finalBaseUrl = baseUrl.startsWith('/') ? baseUrl : `/${baseUrl}`;
    } else if (backendPath) {
      // Parse from backend if not provided
      log(`[STEP 7] Parsing baseUrl from backend path: ${backendPath}`);
      finalBaseUrl = parseBaseUrlFromBackend(backendPath);
      log(`[STEP 7] Parsed baseUrl from backend: ${finalBaseUrl}`);
    } else {
      log(`[STEP 7] No baseUrl provided and no backend path, using default: ${finalBaseUrl}`);
    }

    // Keep the full baseUrl as provided by user
    // Don't remove /api prefix - use it as-is
    // If user provides /api/assety, use /api/assety
    // If user provides /assety, use /assety
    log(`[STEP 7] Using baseUrl as provided: ${finalBaseUrl}`);

    // Ensure finalBaseUrl is always defined and valid
    if (finalBaseUrl === undefined || finalBaseUrl === null) {
      finalBaseUrl = '';
    }
    log(`[STEP 7] Final baseUrl: ${finalBaseUrl}`);

    // Prepare template data
    // Default both features to true if not explicitly set to false
    const deletable = features?.deletable !== false;
    const updatable = features?.updatable !== false;
    log(`[STEP 8] Deletable: ${deletable}, Updatable: ${updatable}`);

    const templateData = {
      ...schema,
      entityName,
      camelEntityName,
      entityNameLower,
      baseUrl: finalBaseUrl,
      deletable,
      updatable,
      sourceType: sourceType || null,
      isProtectedRoute: isProtectedRoute === true,
      isSuperUser: isSuperUser === true,
      currentDate: new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
    };

    log(`[STEP 8] Template data prepared: ${JSON.stringify(templateData, null, 2)}`);

    log(`[STEP 9] Generating service file...`);
    // Step 3: Generate service file (skip if already exists or not selected)
    const serviceFilePath = join(servicesDir, `${camelEntityName}.service.ts`);
    log(`[STEP 9] Service file path: ${serviceFilePath}`);
    if (selectedFiles?.service === false) {
      log(`[STEP 9] Service file generation skipped (not selected)`);
      // Skip if not selected
    } else if (existsSync(serviceFilePath) && !updateExistingFiles) {
      warnings.push(`Service file already exists, skipped: ${serviceFilePath}`);
      log(`[STEP 9] Service file already exists, skipped for entity: ${entityName}`);
    } else {
      if (updateExistingFiles && existsSync(serviceFilePath)) {
        unlinkSync(serviceFilePath);
        log(`[STEP 9] Deleted existing service file: ${serviceFilePath}`);
      }
      const serviceTemplatePath = join(templatesDir, 'service.hbs');
      if (existsSync(serviceTemplatePath)) {
        const serviceTemplateContent = readFileSync(serviceTemplatePath, 'utf-8');
        log(`[STEP 9] Compiling service template...`);
        const serviceTemplate = Handlebars.compile(serviceTemplateContent);
        log(`[STEP 9] Rendering service template with data...`);
        const serviceCode = serviceTemplate(templateData);
        log(`[STEP 9] Writing service file...`);
        writeFileSync(serviceFilePath, serviceCode, 'utf-8');
        generatedFiles.service = serviceFilePath;
        logGenerate(`${camelEntityName}.service.ts`, serviceFilePath);
        log(`[STEP 9] Service file generated successfully: ${serviceFilePath}`);
      } else {
        errors.push(`Service template not found: ${serviceTemplatePath}`);
        log(`[STEP 9] ERROR: Service template not found for entity: ${entityName}`, 'error');
      }
    }

    log(`[STEP 10] Generating thunk file...`);
    // Step 4: Generate thunk file (skip if already exists or not selected)
    const thunkFilePath = join(thunksDir, `${camelEntityName}.thunk.ts`);
    log(`[STEP 10] Thunk file path: ${thunkFilePath}`);
    if (selectedFiles?.thunk === false) {
      log(`[STEP 10] Thunk file generation skipped (not selected)`);
      // Skip if not selected
    } else if (existsSync(thunkFilePath) && !updateExistingFiles) {
      warnings.push(`Thunk file already exists, skipped: ${thunkFilePath}`);
      log(`[STEP 10] Thunk file already exists, skipped for entity: ${entityName}`);
    } else {
      if (updateExistingFiles && existsSync(thunkFilePath)) {
        unlinkSync(thunkFilePath);
        log(`[STEP 10] Deleted existing thunk file: ${thunkFilePath}`);
      }
      const thunkTemplatePath = join(templatesDir, 'thunk.hbs');
      if (existsSync(thunkTemplatePath)) {
        const thunkTemplateContent = readFileSync(thunkTemplatePath, 'utf-8');
        log(`[STEP 10] Compiling thunk template...`);
        const thunkTemplate = Handlebars.compile(thunkTemplateContent);
        log(`[STEP 10] Rendering thunk template with data...`);
        const thunkCode = thunkTemplate(templateData);
        log(`[STEP 10] Writing thunk file...`);
        writeFileSync(thunkFilePath, thunkCode, 'utf-8');
        generatedFiles.thunk = thunkFilePath;
        logGenerate(`${camelEntityName}.thunk.ts`, thunkFilePath);
        log(`[STEP 10] Thunk file generated successfully: ${thunkFilePath}`);
      } else {
        errors.push(`Thunk template not found: ${thunkTemplatePath}`);
        log(`[STEP 10] ERROR: Thunk template not found for entity: ${entityName}`, 'error');
      }
    }

    log(`[STEP 11] Generating slice file...`);
    // Step 5: Generate slice file (skip if already exists or not selected)
    if (selectedFiles?.slice === false) {
      log(`[STEP 11] Slice file generation skipped (not selected)`);
      // Skip if not selected
    } else if (sliceExists && !updateExistingFiles) {
      warnings.push(`Slice file already exists, skipped: ${slicePath}`);
      log(`[STEP 11] Slice file already exists, skipped for entity: ${entityName}`);
    } else {
      if (updateExistingFiles && sliceExists) {
        unlinkSync(slicePath);
        log(`[STEP 11] Deleted existing slice file: ${slicePath}`);
      }
      const sliceTemplatePath = join(templatesDir, 'slice.hbs');
      log(`[STEP 11] Slice template path: ${sliceTemplatePath}`);
      if (existsSync(sliceTemplatePath)) {
        const sliceTemplateContent = readFileSync(sliceTemplatePath, 'utf-8');
        log(`[STEP 11] Compiling slice template...`);
        const sliceTemplate = Handlebars.compile(sliceTemplateContent);
        log(`[STEP 11] Rendering slice template with data...`);
        const sliceCode = sliceTemplate(templateData);
        log(`[STEP 11] Writing slice file...`);
        writeFileSync(slicePath, sliceCode, 'utf-8');
        generatedFiles.slice = slicePath;
        logGenerate(`${camelEntityName}.slice.ts`, slicePath);
        log(`[STEP 11] Slice file generated successfully: ${slicePath}`);
      } else {
        errors.push(`Slice template not found: ${sliceTemplatePath}`);
        log(`[STEP 11] ERROR: Slice template not found for entity: ${entityName}`, 'error');
      }
    }

    log(`[STEP 12] Generating table component file...`);
    // Step 6: Generate table component file (only if page is selected, skip if already exists)
    if (selectedFiles?.page === false) {
      log(`[STEP 12] Table component generation skipped (page not selected)`);
      // Skip table generation if page is not selected
    } else {
      const tableFilePath = join(componentsDir, `${entityName}Table.tsx`);
      if (existsSync(tableFilePath) && !updateExistingFiles) {
        warnings.push(`Table component file already exists, skipped: ${tableFilePath}`);
        log(`[STEP 12] Table file already exists, skipped for entity: ${entityName}`);
      } else {
        if (updateExistingFiles && existsSync(tableFilePath)) {
          unlinkSync(tableFilePath);
          log(`[STEP 12] Deleted existing table file: ${tableFilePath}`);
        }
        const tableTemplatePath = join(templatesDir, 'table.hbs');
        log(`[STEP 12] Table template path: ${tableTemplatePath}`);
        if (existsSync(tableTemplatePath)) {
          const tableTemplateContent = readFileSync(tableTemplatePath, 'utf-8');
          log(`[STEP 12] Compiling table template...`);
          const tableTemplate = Handlebars.compile(tableTemplateContent);
          log(`[STEP 12] Rendering table template with data...`);
          let tableCode = tableTemplate(templateData);

          log(`[STEP 12] Replacing item ID key placeholder (sourceType: ${sourceType})...`);
          // Replace item ID key placeholder with platform-specific ID
          if (sourceType === 'nodejs-mongoose') {
            tableCode = tableCode.replace(/__ITEM_ID_KEY__/g, 'item._id');
            log(`[STEP 12] Replaced __ITEM_ID_KEY__ with item._id`);
          } else {
            tableCode = tableCode.replace(/__ITEM_ID_KEY__/g, 'item.id');
            log(`[STEP 12] Replaced __ITEM_ID_KEY__ with item.id`);
          }

          log(`[STEP 12] Writing table file...`);
          writeFileSync(tableFilePath, tableCode, 'utf-8');
          generatedFiles.table = tableFilePath;
          logGenerate(`${entityName}Table.tsx`, tableFilePath);
          log(`[STEP 12] Table file generated successfully: ${tableFilePath}`);
        } else {
          errors.push(`Table template not found: ${tableTemplatePath}`);
          log(`[STEP 12] ERROR: Table template not found for entity: ${entityName}`, 'error');
        }
      }
    }

    log(`[STEP 13] Generating CoreModal component...`);
    // Step 6.4: Generate CoreModal component (only if page is selected, skip if already exists)
    if (selectedFiles?.page === false) {
      log(`[STEP 13] CoreModal generation skipped (page not selected)`);
      // Skip CoreModal generation if page is not selected
    } else {
      const coreModalFilePath = join(componentsDir, 'CoreModal.tsx');
      if (!existsSync(coreModalFilePath)) {
        const coreModalTemplatePath = join(templatesDir, 'coreModal.hbs');
        log(`[STEP 13] CoreModal template path: ${coreModalTemplatePath}`);
        if (existsSync(coreModalTemplatePath)) {
          const coreModalTemplateContent = readFileSync(coreModalTemplatePath, 'utf-8');
          log(`[STEP 13] Compiling CoreModal template...`);
          const coreModalTemplate = Handlebars.compile(coreModalTemplateContent);
          log(`[STEP 13] Rendering CoreModal template...`);
          const coreModalCode = coreModalTemplate({
            currentDate: new Date().toLocaleString('tr-TR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })
          });
          log(`[STEP 13] Writing CoreModal file...`);
          writeFileSync(coreModalFilePath, coreModalCode, 'utf-8');
          logGenerate('CoreModal.tsx', coreModalFilePath);
          log(`[STEP 13] CoreModal file generated successfully: ${coreModalFilePath}`);
        } else {
          warnings.push(`CoreModal template not found: ${coreModalTemplatePath}`);
          log(`[STEP 13] WARNING: CoreModal template not found: ${coreModalTemplatePath}`, 'warn');
        }
      } else {
        log(`[STEP 13] CoreModal file already exists, skipped for entity: ${entityName}`);
      }
    }

    log(`[STEP 14] Generating modal component file...`);
    // Step 6.5: Generate modal component file (only if page is selected, skip if already exists)
    if (selectedFiles?.page === false) {
      log(`[STEP 14] Modal component generation skipped (page not selected)`);
      // Skip modal generation if page is not selected
    } else {
      const modalFilePath = join(componentsDir, `${entityName}Modal.tsx`);
      log(`[STEP 14] Modal file path: ${modalFilePath}`);
      if (existsSync(modalFilePath) && !updateExistingFiles) {
        warnings.push(`Modal component file already exists, skipped: ${modalFilePath}`);
        log(`[STEP 14] Modal file already exists, skipped for entity: ${entityName}`);
      } else {
        if (updateExistingFiles && existsSync(modalFilePath)) {
          unlinkSync(modalFilePath);
          log(`[STEP 14] Deleted existing modal file: ${modalFilePath}`);
        }
        const modalTemplatePath = join(templatesDir, 'modal.hbs');
        log(`[STEP 14] Modal template path: ${modalTemplatePath}`);
        if (existsSync(modalTemplatePath)) {
          const modalTemplateContent = readFileSync(modalTemplatePath, 'utf-8');
          log(`[STEP 14] Compiling modal template...`);
          const modalTemplate = Handlebars.compile(modalTemplateContent);
          log(`[STEP 14] Rendering modal template with data...`);
          let modalCode = modalTemplate(templateData);

          log(`[STEP 14] Processing relation fields...`);
          // Replace relation modal placeholders with actual variable names
          // Pattern: __RELATION_MODAL_OPEN_fieldName__ -> fieldNameRelationModalOpen (without curly braces, as they're already in template)
          // Pattern: __RELATION_DATA_fieldName__ -> fieldNameRelationData
          // Pattern: set__RELATION_MODAL_OPEN_fieldName__ -> setfieldNameRelationModalOpen
          const relationFields = schema.fields?.filter(f => f.includeRelation && f.relationEntityName) || [];
          log(`[STEP 14] Found ${relationFields.length} relation fields`);
          relationFields.forEach(field => {
            const fieldName = field.name;
            const camelFieldName = toCamelCase(fieldName);
            const pascalFieldName = camelFieldName.charAt(0).toUpperCase() + camelFieldName.slice(1);
            log(`[STEP 14] Processing relation field: ${fieldName} (camel: ${camelFieldName}, pascal: ${pascalFieldName})`);

            // Replace open prop - template has open={__RELATION_MODAL_OPEN_fieldName__}
            // We need to replace __RELATION_MODAL_OPEN_fieldName__ with fieldNameRelationModalOpen
            const openPattern = `__RELATION_MODAL_OPEN_${fieldName}__`;
            modalCode = modalCode.replace(new RegExp(openPattern, 'g'), `${camelFieldName}RelationModalOpen`);
            log(`[STEP 14] Replaced ${openPattern} with ${camelFieldName}RelationModalOpen`);

            // Replace setState calls
            const setOpenPattern = `set__RELATION_MODAL_OPEN_${fieldName}__`;
            modalCode = modalCode.replace(new RegExp(setOpenPattern, 'g'), `set${pascalFieldName}RelationModalOpen`);
            log(`[STEP 14] Replaced ${setOpenPattern} with set${pascalFieldName}RelationModalOpen`);

            // Replace relation data
            const dataPattern = `__RELATION_DATA_${fieldName}__`;
            modalCode = modalCode.replace(new RegExp(dataPattern, 'g'), `${camelFieldName}RelationData`);
            log(`[STEP 14] Replaced ${dataPattern} with ${camelFieldName}RelationData`);

            // Replace relation data ID (for TextField value) - use platform-specific ID
            const dataIdPattern = `__RELATION_DATA_ID_${fieldName}__`;
            if (sourceType === 'nodejs-mongoose') {
              modalCode = modalCode.replace(new RegExp(dataIdPattern, 'g'), `${camelFieldName}RelationData?._id`);
              log(`[STEP 14] Replaced ${dataIdPattern} with ${camelFieldName}RelationData?._id`);
            } else {
              modalCode = modalCode.replace(new RegExp(dataIdPattern, 'g'), `${camelFieldName}RelationData?.id`);
              log(`[STEP 14] Replaced ${dataIdPattern} with ${camelFieldName}RelationData?.id`);
            }
          });

          writeFileSync(modalFilePath, modalCode, 'utf-8');
          generatedFiles.modal = modalFilePath;
          logGenerate(`${entityName}Modal.tsx`, modalFilePath);
          log(`[STEP 14] Modal file generated successfully: ${modalFilePath}`);
        } else {
          errors.push(`Modal template not found: ${modalTemplatePath}`);
          log(`[STEP 14] ERROR: Modal template not found: ${modalTemplatePath}`, 'error');
        }
      }
    }

    log(`[STEP 15] Generating page file...`);
    // Step 7: Generate page file (skip if already exists or not selected)
    const pageFilePath = join(pagesDir, 'index.tsx');
    log(`[STEP 15] Page file path: ${pageFilePath}`);
    if (selectedFiles?.page === false) {
      log(`[STEP 15] Page file generation skipped (not selected)`);
      // Skip if not selected
    } else if (existsSync(pageFilePath) && !updateExistingFiles) {
      warnings.push(`Page file already exists, skipped: ${pageFilePath}`);
      log(`[STEP 15] Page file already exists, skipped for entity: ${entityName}`);
    } else {
      if (updateExistingFiles && existsSync(pageFilePath)) {
        unlinkSync(pageFilePath);
        log(`[STEP 15] Deleted existing page file: ${pageFilePath}`);
      }
      const pageTemplatePath = join(templatesDir, 'page.hbs');
      if (existsSync(pageTemplatePath)) {
        log(`[STEP 15] Reading page template...`);
        const pageTemplateContent = readFileSync(pageTemplatePath, 'utf-8');
        log(`[STEP 15] Compiling page template...`);
        const pageTemplate = Handlebars.compile(pageTemplateContent);
        log(`[STEP 15] Rendering page template with data...`);
        const pageCode = pageTemplate(templateData);
        log(`[STEP 15] Writing page file...`);
        writeFileSync(pageFilePath, pageCode, 'utf-8');
        generatedFiles.page = pageFilePath;
        logGenerate(`${entityName}/index.tsx`, pageFilePath);
        log(`[STEP 15] Page file generated successfully: ${pageFilePath}`);
      } else {
        log(`[STEP 15] ERROR: Page template not found: ${pageTemplatePath}`, 'error');
      }
    }

    log(`[STEP 16] Running injection operations...`);
    // Step 7: Run injection
    // Inject route (only if page is explicitly selected)
    if (selectedFiles?.page === true) {
      log(`[STEP 16.1] Attempting route injection for: ${entityName}`);
      log(`[STEP 16.1] Entity name: ${entityName}, Camel: ${camelEntityName}`);
      const routeInjectionResult = injectRoute(projectRoot, entityName, camelEntityName);
      log(`[STEP 16.1] Route injection result: ${JSON.stringify(routeInjectionResult)}`);
      if (!routeInjectionResult.success) {
        warnings.push(`Route injection: ${routeInjectionResult.message}`);
        logGenerate('Route Injection', join(projectRoot, 'src', 'routes', 'routes.ts'), routeInjectionResult.message);
        log(`[STEP 16.1] Route injection failed: ${routeInjectionResult.message}`, 'warn');
      } else {
        logGenerate('Route Injection', join(projectRoot, 'src', 'routes', 'routes.ts'));
        log(`[STEP 16.1] Route injection successful for: ${entityName}`);
      }
    } else {
      log(`[STEP 16.1] Route injection skipped (page not selected)`);
    }

    // Inject reducer (only if slice is explicitly selected)
    if (selectedFiles?.slice === true) {
      log(`[STEP 16.2] Attempting reducer injection for: ${entityName}`);
      log(`[STEP 16.2] Entity name: ${entityName}, Camel: ${camelEntityName}`);
      const reducerInjectionResult = injectReducer(projectRoot, entityName, camelEntityName);
      log(`[STEP 16.2] Reducer injection result: ${JSON.stringify(reducerInjectionResult)}`);
      if (!reducerInjectionResult.success) {
        warnings.push(`Reducer injection: ${reducerInjectionResult.message}`);
        logGenerate('Reducer Injection', join(projectRoot, 'src', 'store', 'index.ts'), reducerInjectionResult.message);
        log(`[STEP 16.2] Reducer injection failed: ${reducerInjectionResult.message}`, 'warn');
      } else {
        logGenerate('Reducer Injection', join(projectRoot, 'src', 'store', 'index.ts'));
        log(`[STEP 16.2] Reducer injection successful for: ${entityName}`);
      }
    } else {
      log(`[STEP 16.2] Reducer injection skipped (slice not selected)`);
    }

    log(`[STEP 17] Frontend generation completed for: ${entityName}`);
    log(`[STEP 17] Generated files count: ${Object.keys(generatedFiles).length}`);
    log(`[STEP 17] Generated files: ${JSON.stringify(Object.keys(generatedFiles))}`);
    log(`[STEP 17] Warnings count: ${warnings.length}`);
    if (warnings.length > 0) {
      log(`[STEP 17] Warnings: ${JSON.stringify(warnings)}`, 'warn');
    }
    log(`[STEP 17] Errors count: ${errors.length}`);
    if (errors.length > 0) {
      log(`[STEP 17] Errors: ${JSON.stringify(errors)}`, 'error');
    }
    log(
      `Frontend generation completed for: ${entityName} | Files: ${Object.keys(generatedFiles).length} | Warnings: ${warnings.length} | Errors: ${
        errors.length
      }`
    );

    const result = {
      success: errors.length === 0,
      files: generatedFiles,
      warnings: warnings.length > 0 ? warnings : undefined,
      errors: errors.length > 0 ? errors : undefined
    };
    log(`[STEP 17] Returning result: ${JSON.stringify(result)}`);
    return result;
  } catch (error) {
    log(`[ERROR] Frontend generation failed for: ${schema.entityName}`, 'error');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : 'No stack trace';
    log(`[ERROR] Error message: ${errorMessage}`, 'error');
    log(`[ERROR] Error stack: ${errorStack}`, 'error');
    logGenerate('Frontend Generation', projectPath, errorMessage);

    const errorResult = {
      success: false,
      errors: [errorMessage],
      warnings: warnings.length > 0 ? warnings : undefined
    };
    log(`[ERROR] Returning error result: ${JSON.stringify(errorResult)}`, 'error');
    return errorResult;
  }
}
