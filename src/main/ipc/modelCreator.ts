import { readFileSync } from 'fs';
import { writeFile, mkdir, stat } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import Handlebars from 'handlebars';
import { getTemplatesDir, registerHandlebarsHelpers } from '../utils/templateHelpers.js';
import { log } from '../utils/logger.js';
import { SourceType } from './projectScanner.js';

export interface ModelField {
  name: string;
  type: 'String' | 'Number' | 'Boolean' | 'Date' | 'ObjectId' | 'Array';
  required: boolean;
  unique: boolean;
  trim: boolean;
  displayText?: string;
  ref?: string; // Mongoose ref (e.g., "User", "Symbol") - used in schema definition
}

export interface ModelData {
  modelName: string;
  fields: ModelField[];
  hasInitializeFunction: boolean;
  initializeData?: Array<Record<string, string>>;
}

export interface CreateModelResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

/**
 * Generates a Mongoose model file based on the provided model data using template
 */
function generateMongooseModel(modelData: ModelData): string {
  const { modelName, fields, hasInitializeFunction, initializeData } = modelData;

  // Generate interface name (e.g., SymbolTypes -> ISymbolTypeModel)
  const interfaceName = `I${modelName.charAt(0).toUpperCase() + modelName.slice(1).replace(/s$/, '')}Model`;

  // Generate schema name (e.g., SymbolTypes -> SymbolTypesSchema)
  const schemaName = `${modelName}Schema`;

  // Generate model name (e.g., symbolTypes -> SymbolTypes)
  const modelExportName = modelName.charAt(0).toUpperCase() + modelName.slice(1);

  // Generate initialize function name (e.g., SymbolTypes -> initializeSymbolTypes)
  const initializeFunctionName = `initialize${modelName.charAt(0).toUpperCase() + modelName.slice(1)}`;

  // Check if ModelType pattern exists (value and displayText fields)
  const hasValueField = fields.some(f => f.name === 'value');
  const hasDisplayTextField = fields.some(f => f.name === 'displayText');
  const hasModelTypePattern = hasValueField && hasDisplayTextField;

  // Build interface extends clause
  let interfaceExtends = 'Document';
  if (hasModelTypePattern) {
    interfaceExtends = 'ModelType, Document';
  }

  // Prepare fields for template with type mappings
  const templateFields = fields.map(field => {
    // Mongoose type mapping
    let mongooseType = 'String';
    if (field.type === 'Number') mongooseType = 'Number';
    else if (field.type === 'Boolean') mongooseType = 'Boolean';
    else if (field.type === 'Date') mongooseType = 'Date';
    else if (field.type === 'ObjectId') mongooseType = 'Schema.Types.ObjectId';
    else if (field.type === 'Array') mongooseType = '[String]';

    // TypeScript type mapping
    let tsType = 'string';
    if (field.type === 'Number') tsType = 'number';
    else if (field.type === 'Boolean') tsType = 'boolean';
    else if (field.type === 'Date') tsType = 'Date';
    else if (field.type === 'ObjectId') tsType = 'Schema.Types.ObjectId';
    else if (field.type === 'Array') tsType = 'string[]';

    return {
      name: field.name,
      mongooseType,
      tsType,
      required: field.required,
      unique: field.unique,
      trim: field.trim && field.type === 'String',
      ref: field.ref // Include ref if provided (for ObjectId type fields)
    };
  });

  // Prepare initialize data for template
  const templateInitializeData =
    hasInitializeFunction && initializeData && initializeData.length > 0
      ? initializeData.map(item => {
          // Create object with all field values from the item, preserving types
          const dataItem: Record<string, any> = {};
          fields.forEach(field => {
            const value = item[field.name];
            // Convert value based on field type
            if (value === undefined || value === null || value === '') {
              // Use default based on type
              if (field.type === 'Number') {
                dataItem[field.name] = 0;
              } else if (field.type === 'Boolean') {
                dataItem[field.name] = false;
              } else if (field.type === 'Array') {
                dataItem[field.name] = [];
              } else {
                dataItem[field.name] = '';
              }
            } else {
              // Convert string values to appropriate types
              if (field.type === 'Number') {
                dataItem[field.name] = isNaN(Number(value)) ? 0 : Number(value);
              } else if (field.type === 'Boolean') {
                // Handle string "true"/"false" or actual boolean
                if (typeof value === 'string') {
                  dataItem[field.name] = value.toLowerCase() === 'true';
                } else {
                  dataItem[field.name] = Boolean(value);
                }
              } else {
                dataItem[field.name] = String(value);
              }
            }
          });
          log(`Prepared initialize data item: ${JSON.stringify(dataItem)}`, 'info');
          return dataItem;
        })
      : [];

  // Register helpers
  registerHandlebarsHelpers();

  // Read template file
  const templatesDir = getTemplatesDir('backend');
  const templatePath = join(templatesDir, 'model.hbs');

  if (!existsSync(templatePath)) {
    throw new Error(`Template file not found: ${templatePath}`);
  }

  const templateContent = readFileSync(templatePath, 'utf-8');

  // Compile template
  const template = Handlebars.compile(templateContent);

  // Prepare template context
  const templateContext = {
    modelName,
    interfaceName,
    schemaName,
    modelExportName,
    initializeFunctionName,
    hasModelTypePattern,
    interfaceExtends,
    fields: templateFields,
    hasInitializeFunction,
    initializeData: templateInitializeData
  };

  // Debug: Log template context
  log(`Template context initializeData: ${JSON.stringify(templateInitializeData, null, 2)}`, 'info');
  log(
    `Template context fields: ${JSON.stringify(
      templateFields.map(f => ({ name: f.name, mongooseType: f.mongooseType })),
      null,
      2
    )}`,
    'info'
  );

  // Render template
  const rendered = template(templateContext);
  log(`Rendered template preview (first 500 chars): ${rendered.substring(0, 500)}`, 'info');
  return rendered;
}

/**
 * Finds the models directory in the project using the same logic as scanProject
 */
async function findModelsDirectory(projectPath: string, sourceType: SourceType): Promise<string | null> {
  if (sourceType === 'nodejs-mongoose' || sourceType === 'nodejs-typeorm') {
    // Look for 'src/models' folder first (most common structure)
    const srcModelsPath = join(projectPath, 'src', 'models');
    try {
      const srcModelsStats = await stat(srcModelsPath);
      if (srcModelsStats.isDirectory()) {
        return srcModelsPath;
      }
    } catch {
      // src/models folder doesn't exist, try models folder
    }

    // Fallback: Look for 'models' folder at root
    const modelsPath = join(projectPath, 'models');
    try {
      const modelsStats = await stat(modelsPath);
      if (modelsStats.isDirectory()) {
        return modelsPath;
      }
    } catch {
      // models folder doesn't exist
    }

    // If no models directory exists, create src/models (most common)
    try {
      await mkdir(srcModelsPath, { recursive: true });
      return srcModelsPath;
    } catch (error) {
      log(`Error creating models directory: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      return null;
    }
  } else if (sourceType === 'dotnet-ef') {
    // Look for 'Entities' or 'Models' folder
    const entitiesPath = join(projectPath, 'Entities');
    const modelsPath = join(projectPath, 'Models');

    try {
      const entitiesStats = await stat(entitiesPath);
      if (entitiesStats.isDirectory()) {
        return entitiesPath;
      }
    } catch {
      // Entities folder doesn't exist
    }

    try {
      const modelsStats = await stat(modelsPath);
      if (modelsStats.isDirectory()) {
        return modelsPath;
      }
    } catch {
      // Models folder doesn't exist
    }

    // If no directory exists, create Entities (most common for .NET)
    try {
      await mkdir(entitiesPath, { recursive: true });
      return entitiesPath;
    } catch (error) {
      log(`Error creating models directory: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      return null;
    }
  }

  return null;
}

/**
 * Creates a new model file in the project
 */
export async function createModel(projectPath: string, sourceType: SourceType, modelData: ModelData): Promise<CreateModelResult> {
  try {
    if (sourceType !== 'nodejs-mongoose') {
      return {
        success: false,
        error: 'Model creation is currently only supported for Node.js (Mongoose) projects'
      };
    }

    // Find or create models directory
    const modelsDir = await findModelsDirectory(projectPath, sourceType);
    if (!modelsDir) {
      return {
        success: false,
        error: 'Could not find or create models directory'
      };
    }

    // Generate model file content
    const modelContent = generateMongooseModel(modelData);

    // Generate file name (e.g., SymbolTypes -> symbolTypes.model.ts)
    const fileName = `${modelData.modelName.charAt(0).toLowerCase() + modelData.modelName.slice(1)}.model.ts`;
    const filePath = join(modelsDir, fileName);

    // Check if file already exists
    if (existsSync(filePath)) {
      return {
        success: false,
        error: `Model file ${fileName} already exists`
      };
    }

    // Write file
    await writeFile(filePath, modelContent, 'utf-8');

    log(`Model created successfully: ${filePath}`, 'info');

    return {
      success: true,
      filePath
    };
  } catch (error) {
    log(`Error creating model: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
