import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { app } from 'electron';
import Handlebars from 'handlebars';
import { SchemaDefinition } from './schemaParser';
import { logGenerate, log } from '../utils/logger.js';

/**
 * Get the Generator project root directory
 */
function getGeneratorRoot(): string {
  const isDev = process.env.NODE_ENV === 'development' || !app?.isPackaged;

  if (isDev) {
    // Start from the current file location (dist-electron/main/ipc/backendGenerator.js)
    const __filename = fileURLToPath(import.meta.url);
    let currentDir = dirname(__filename);

    // Go up until we find package.json (Generator root)
    while (currentDir !== dirname(currentDir)) {
      const packageJsonPath = join(currentDir, 'package.json');
      if (existsSync(packageJsonPath)) {
        return currentDir;
      }
      currentDir = dirname(currentDir);
    }

    // Fallback: if package.json not found, go up two levels from dist-electron
    return join(dirname(__filename), '..', '..');
  } else {
    // In production, use app path
    return app.getAppPath();
  }
}

/**
 * Get the backend templates directory path
 */
function getBackendTemplatesDir(): string {
  const generatorRoot = getGeneratorRoot();
  const isDev = process.env.NODE_ENV === 'development' || !app?.isPackaged;

  if (isDev) {
    // In development, use src/main/templates/backend
    return join(generatorRoot, 'src', 'main', 'templates', 'backend');
  } else {
    // In production, use dist-electron/main/templates/backend
    return join(generatorRoot, 'dist-electron', 'main', 'templates', 'backend');
  }
}

/**
 * Register Handlebars helpers
 */
function registerHandlebarsHelpers(): void {
  // Register currentDate helper for Turkish locale
  Handlebars.registerHelper('currentDate', () => {
    return new Date().toLocaleString('tr-TR');
  });
  
  // Register eq helper for equality comparison
  Handlebars.registerHelper('eq', (a, b) => {
    return a === b;
  });
  
  // Register getType helper to return mongoose.Types.ObjectId for schema type and Date for date type
  Handlebars.registerHelper('getType', (type: string) => {
    if (type === 'schema') {
      return 'mongoose.Types.ObjectId';
    }
    if (type === 'date') {
      return 'Date';
    }
    return type;
  });
  
  // Register hasSchemaType helper to check if any field has schema type
  Handlebars.registerHelper('hasSchemaType', (fields: Array<{ type: string }>) => {
    if (!fields || !Array.isArray(fields)) {
      return false;
    }
    return fields.some((field: { type: string }) => field.type === 'schema');
  });

  // Register hasSearchableFields helper to check if any field is searchable
  Handlebars.registerHelper('hasSearchableFields', (fields: Array<{ isSearchable?: boolean }>) => {
    if (!fields || !Array.isArray(fields)) {
      return false;
    }
    return fields.some((field: { isSearchable?: boolean }) => field.isSearchable === true);
  });

  // Register hasField helper to check if a field with specific name exists
  Handlebars.registerHelper('hasField', (fields: Array<{ name: string }>, fieldName: string) => {
    if (!fields || !Array.isArray(fields)) {
      return false;
    }
    return fields.some((field: { name: string }) => field.name === fieldName);
  });
}

/**
 * Get the project root path by detecting if 'src' exists in the path
 * If path contains 'src', return the path up to 'src', otherwise return the path as is
 */
function getProjectRootPath(projectPath: string): string {
  // Normalize path separators
  const normalizedPath = projectPath.replace(/\\/g, '/').replace(/\/$/, ''); // Remove trailing slash

  // Check if path contains '/src/' (not at the end)
  const srcIndex = normalizedPath.indexOf('/src/');
  if (srcIndex !== -1) {
    // Path contains '/src/', return everything before it
    return normalizedPath.substring(0, srcIndex);
  }

  // Check if path ends with '/src'
  if (normalizedPath.endsWith('/src')) {
    // Path ends with '/src', return parent directory
    return dirname(projectPath);
  }

  // No 'src' found, return path as is
  return projectPath;
}

export interface GenerateBackendResult {
  success: boolean;
  files?: {
    route?: string;
    service?: string;
    types?: string;
  };
  error?: string;
}

/**
 * Generate backend code (routes, service, types) from templates
 */
export function generateBackend(
  schema: SchemaDefinition,
  projectPath: string,
  isProtectedRoute: boolean,
  sourceType?: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null
): GenerateBackendResult {
  try {
    // Register helpers
    registerHandlebarsHelpers();

    const templatesDir = getBackendTemplatesDir();
    const entityName = schema.entityName;
    const entityNameLower = entityName.charAt(0).toLowerCase() + entityName.slice(1);
    const camelEntityName = entityNameLower;

    // Get the actual project root (handle cases where path includes 'src')
    const projectRoot = getProjectRootPath(projectPath);
    log(`Backend generation started for entity: ${entityName}`);

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
      const responseFilePath = join(modelsDir, 'Response.model.ts');
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
      entityNameLower,
      camelEntityName,
      sourceType
    };

    // Generate route file
    const routeTemplatePath = join(templatesDir, 'route.hbs');
    if (existsSync(routeTemplatePath)) {
      const routeTemplateContent = readFileSync(routeTemplatePath, 'utf-8');
      const routeTemplate = Handlebars.compile(routeTemplateContent);
      const routeCode = routeTemplate(templateData);
      const routeFilePath = join(routesDir, `${entityNameLower}.routes.ts`);
      writeFileSync(routeFilePath, routeCode, 'utf-8');
      generatedFiles.route = routeFilePath;
      logGenerate(`${entityNameLower}.routes.ts`, routeFilePath);
    }

    // Generate service file
    const serviceTemplatePath = join(templatesDir, 'service.hbs');
    if (existsSync(serviceTemplatePath)) {
      const serviceTemplateContent = readFileSync(serviceTemplatePath, 'utf-8');
      const serviceTemplate = Handlebars.compile(serviceTemplateContent);
      const serviceCode = serviceTemplate(templateData);
      const serviceFilePath = join(servicesDir, `${entityNameLower}.service.ts`);
      writeFileSync(serviceFilePath, serviceCode, 'utf-8');
      generatedFiles.service = serviceFilePath;
      logGenerate(`${entityNameLower}.service.ts`, serviceFilePath);
    }

    // Generate types file
    const typesTemplatePath = join(templatesDir, 'types.hbs');
    if (existsSync(typesTemplatePath)) {
      const typesTemplateContent = readFileSync(typesTemplatePath, 'utf-8');
      const typesTemplate = Handlebars.compile(typesTemplateContent);
      const typesCode = typesTemplate(templateData);
      const typesFilePath = join(typesDir, `${entityNameLower}.types.ts`);
      writeFileSync(typesFilePath, typesCode, 'utf-8');
      generatedFiles.types = typesFilePath;
      logGenerate(`${entityNameLower}.types.ts`, typesFilePath);
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
