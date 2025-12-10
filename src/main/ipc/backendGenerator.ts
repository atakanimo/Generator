import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import Handlebars from 'handlebars';
import { SchemaDefinition } from './schemaParser';
import { getTemplatesDir, registerHandlebarsHelpers, getProjectRootPath } from '../utils/templateHelpers.js';
import { logGenerate, log } from '../utils/logger.js';
import { parseBaseUrlFromBackend } from './frontendGenerator.js';

export interface GenerateBackendResult {
  success: boolean;
  files?: { route?: string; service?: string; types?: string };
  error?: string;
}

/**
 * Generate backend code (routes, service, types) from templates
 */
export function generateBackend(
  schema: SchemaDefinition,
  projectPath: string,
  isProtectedRoute: boolean,
  sourceType?: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null,
  shouldAddRoute?: boolean,
  baseUrl?: string,
  updateExistingFiles?: boolean,
  isSuperUser?: boolean
): GenerateBackendResult {
  try {
    // Register helpers
    registerHandlebarsHelpers();

    const templatesDir = getTemplatesDir('backend');
    const entityName = schema.entityName;
    const entityNameLower = entityName.charAt(0).toLowerCase() + entityName.slice(1);
    const camelEntityName = entityNameLower;

    // Get the actual project root (handle cases where path includes 'src')
    const projectRoot = getProjectRootPath(projectPath);
    log(`Backend generation started for entity: ${entityName}`);

    // Use provided baseUrl or parse from backend index.ts
    const finalBaseUrl = baseUrl || parseBaseUrlFromBackend(projectPath);
    log(`Using base URL: ${finalBaseUrl}`);

    // Ensure required directories exist in the project
    const routesDir = join(projectRoot, 'src', 'routes');
    const servicesDir = join(projectRoot, 'src', 'services');
    const modelsDir = join(projectRoot, 'src', 'models');
    const typesDir = join(projectRoot, 'src', 'types');
    const utilsDir = join(projectRoot, 'src', 'utils');
    const interfacesDir = join(projectRoot, 'src', 'interfaces');
    const helpersDir = join(projectRoot, 'src', 'helpers');

    if (!existsSync(routesDir)) {
      mkdirSync(routesDir, { recursive: true });
    }
    if (!existsSync(servicesDir)) {
      mkdirSync(servicesDir, { recursive: true });
    }
    if (!existsSync(modelsDir)) {
      mkdirSync(modelsDir, { recursive: true });
    }
    if (!existsSync(typesDir)) {
      mkdirSync(typesDir, { recursive: true });
    }
    if (!existsSync(utilsDir)) {
      mkdirSync(utilsDir, { recursive: true });
    }
    if (!existsSync(interfacesDir)) {
      mkdirSync(interfacesDir, { recursive: true });
    }
    if (!existsSync(helpersDir)) {
      mkdirSync(helpersDir, { recursive: true });
    }

    // If Node.js is selected, create Response.model.ts file if it doesn't exist
    if (sourceType === 'nodejs-mongoose' || sourceType === 'nodejs-typeorm') {
      const responseFilePath = join(modelsDir, 'responses.model.ts');
      if (!existsSync(responseFilePath)) {
        // Read response template
        const responseTemplatePath = join(templatesDir, 'response.hbs');
        if (existsSync(responseTemplatePath)) {
          const responseTemplateContent = readFileSync(responseTemplatePath, 'utf-8');
          const responseTemplate = Handlebars.compile(responseTemplateContent);
          const responseCode = responseTemplate({});
          writeFileSync(responseFilePath, responseCode, 'utf-8');
          log(`Created Response.model.ts file: ${responseFilePath}`);
        }
      }
    }

    const generatedFiles: { route?: string; service?: string; types?: string } = {};

    // Prepare template data
    const templateData = {
      ...schema,
      isProtectedRoute,
      isSuperUser: isSuperUser || false,
      entityNameLower,
      camelEntityName,
      sourceType
    };

    // Generate route file
    const routeTemplatePath = join(templatesDir, 'route.hbs');
    if (existsSync(routeTemplatePath)) {
      const routeFilePath = join(routesDir, `${entityNameLower}.routes.ts`);
      if (updateExistingFiles && existsSync(routeFilePath)) {
        // Delete existing file if updateExistingFiles is true
        unlinkSync(routeFilePath);
        log(`Deleted existing route file: ${routeFilePath}`);
      }
      if (!existsSync(routeFilePath) || updateExistingFiles) {
        const routeTemplateContent = readFileSync(routeTemplatePath, 'utf-8');
        const routeTemplate = Handlebars.compile(routeTemplateContent);
        const routeCode = routeTemplate(templateData);
        writeFileSync(routeFilePath, routeCode, 'utf-8');
        generatedFiles.route = routeFilePath;
        logGenerate(`${entityNameLower}.routes.ts`, routeFilePath);
      }
    }

    // Generate service file
    const serviceTemplatePath = join(templatesDir, 'service.hbs');
    if (existsSync(serviceTemplatePath)) {
      const serviceFilePath = join(servicesDir, `${entityNameLower}.service.ts`);
      if (updateExistingFiles && existsSync(serviceFilePath)) {
        // Delete existing file if updateExistingFiles is true
        unlinkSync(serviceFilePath);
        log(`Deleted existing service file: ${serviceFilePath}`);
      }
      if (!existsSync(serviceFilePath) || updateExistingFiles) {
        const serviceTemplateContent = readFileSync(serviceTemplatePath, 'utf-8');
        const serviceTemplate = Handlebars.compile(serviceTemplateContent);
        const serviceCode = serviceTemplate(templateData);
        writeFileSync(serviceFilePath, serviceCode, 'utf-8');
        generatedFiles.service = serviceFilePath;
        logGenerate(`${entityNameLower}.service.ts`, serviceFilePath);
      }
    }

    // Generate types file
    const typesTemplatePath = join(templatesDir, 'types.hbs');
    if (existsSync(typesTemplatePath)) {
      const typesFilePath = join(typesDir, `${entityNameLower}.types.ts`);
      if (updateExistingFiles && existsSync(typesFilePath)) {
        // Delete existing file if updateExistingFiles is true
        unlinkSync(typesFilePath);
        log(`Deleted existing types file: ${typesFilePath}`);
      }
      if (!existsSync(typesFilePath) || updateExistingFiles) {
        const typesTemplateContent = readFileSync(typesTemplatePath, 'utf-8');
        const typesTemplate = Handlebars.compile(typesTemplateContent);
        const typesCode = typesTemplate(templateData);
        writeFileSync(typesFilePath, typesCode, 'utf-8');
        generatedFiles.types = typesFilePath;
        logGenerate(`${entityNameLower}.types.ts`, typesFilePath);
      }
    }

    // Add route to src/index.ts if shouldAddRoute is true
    if (shouldAddRoute && (sourceType === 'nodejs-mongoose' || sourceType === 'nodejs-typeorm')) {
      const indexPath = join(projectRoot, 'src', 'index.ts');
      if (existsSync(indexPath)) {
        try {
          addRouteToIndex(indexPath, entityNameLower, finalBaseUrl);
          log(`Route added to src/index.ts for ${entityName}`);
        } catch (error) {
          log(`Failed to add route to src/index.ts: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        }
      } else {
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
            try {
              addRouteToIndex(altPath, entityNameLower, finalBaseUrl);
              log(`Route added to ${altPath} for ${entityName}`);
              break;
            } catch (error) {
              log(`Failed to add route to ${altPath}: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
            }
          }
        }
      }
    }

    log(`Backend generation completed for: ${entityName} | Files: ${Object.keys(generatedFiles).length}`);

    return {
      success: true,
      files: generatedFiles
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : 'No stack trace';
    log(`Backend generation failed for: ${schema.entityName} | Error: ${errorMessage}`, 'error');
    log(`Error stack: ${errorStack}`, 'error');
    logGenerate('Backend Generation', projectPath, errorMessage);
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Adds a route to the src/index.ts file
 * Finds the last app.use line and adds the new route below it
 */
function addRouteToIndex(indexPath: string, entityNameLower: string, baseUrl: string): void {
  const content = readFileSync(indexPath, 'utf-8');
  const lines = content.split('\n');

  // Find the last app.use line
  let lastAppUseIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('app.use(') && lines[i].includes('Route')) {
      lastAppUseIndex = i;
      break;
    }
  }

  if (lastAppUseIndex === -1) {
    // If no app.use found, try to find where routes are typically added
    // Look for patterns like "// Routes" or similar
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('app.use') && lines[i].includes('/api')) {
        lastAppUseIndex = i;
      }
    }
  }

  if (lastAppUseIndex === -1) {
    throw new Error('Could not find a suitable location to add the route in index.ts');
  }

  // Generate route variable name (e.g., symbolTypes -> symbolTypesRoute)
  // Following the pattern: symbolTypesRoute, notificationsRoutes
  const routeVariableName = `${entityNameLower}Route`;

  // Check if import already exists (look for any import with the route file)
  const importPattern = new RegExp(`import.*from.*['"]\\./routes/${entityNameLower}\\.routes['"]`);
  const hasImport = lines.some(line => importPattern.test(line));

  // Check if route is already added
  const routePattern = new RegExp(`app\\.use\\(['"]${baseUrl}/${entityNameLower}['"]`);
  const hasRoute = lines.some(line => routePattern.test(line));

  if (hasRoute) {
    log(`Route for ${entityNameLower} already exists in index.ts`, 'info');
    return;
  }

  // Generate the route line (e.g., app.use('/api/assety/notifications', notificationsRoutes);)
  const routeLine = `app.use('${baseUrl}/${entityNameLower}', ${routeVariableName});`;

  // Add import if it doesn't exist
  if (!hasImport) {
    // Find the last import statement
    let lastImportIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('import ')) {
        lastImportIndex = i;
      }
    }

    if (lastImportIndex !== -1) {
      // Add import after the last import (default export, so we can name it anything)
      const importLine = `import ${routeVariableName} from './routes/${entityNameLower}.routes';`;
      lines.splice(lastImportIndex + 1, 0, importLine);
      lastAppUseIndex++; // Adjust index since we added a line
    }
  }

  // Add route after the last app.use
  lines.splice(lastAppUseIndex + 1, 0, routeLine);

  // Write back to file
  writeFileSync(indexPath, lines.join('\n'), 'utf-8');
  log(`Route added to ${indexPath}: ${routeLine}`, 'info');
}
