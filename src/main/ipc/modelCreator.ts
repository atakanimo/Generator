import { readFileSync } from 'fs';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import Handlebars from 'handlebars';
import { getTemplatesDir, registerHandlebarsHelpers } from '../utils/templateHelpers.js';
import { log } from '../utils/logger.js';
import { moduleNameFromEntity, pascalCase } from '../utils/namingUtils.js';
import { applyCustomBlockMerge } from '../utils/customBlockMerge.js';
import { getCustomBlockMarkersPresentInSource, getDefaultCustomBlockMarkerNames } from '../utils/customBlockMarkers.js';
import {
  resolveMainMongooseSchemaName,
  extractMainSchemaRegions,
  mainSchemaFieldsInner
} from '../utils/mongooseSchemaExtract.js';
import { SourceType } from './projectScanner.js';
import { parseModelFile } from './schemaParser.js';

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
  timestamps?: {
    createdAt?: boolean;
    updatedAt?: boolean;
  };
}

export interface CreateModelResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export interface UpdateModelResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

/**
 * Generates a Mongoose model file based on the provided model data using template
 */
function generateMongooseModel(modelData: ModelData): string {
  const { modelName, fields, hasInitializeFunction, initializeData, timestamps } = modelData;

  // Align with BackendGenerator.buildMongooseModelTemplateData (model.hbs)
  const pascalName = pascalCase(modelName.trim());
  const interfaceName = `I${pascalName}`;
  const schemaName = `${pascalName}Schema`;
  const modelExportName = pascalName;
  const initializeFunctionName = `initialize${pascalName}`;

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
    else if (field.type === 'ObjectId') tsType = 'mongoose.Types.ObjectId';
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

  // Prepare timestamps configuration
  // Ensure timestamps is always an object with boolean values
  const timestampsConfig = timestamps
    ? {
        createdAt: timestamps.createdAt === true,
        updatedAt: timestamps.updatedAt === true
      }
    : { createdAt: false, updatedAt: false };
  const hasTimestamps = timestampsConfig.createdAt || timestampsConfig.updatedAt;

  // Debug: Log timestamps
  log(`Received timestamps: ${JSON.stringify(timestamps, null, 2)}`, 'info');
  log(`Timestamps config: ${JSON.stringify(timestampsConfig, null, 2)}`, 'info');
  log(`Has timestamps: ${hasTimestamps}`, 'info');

  // model.hbs reads `modelFields` (same as BackendGenerator); exclude audit fields from schema body
  const modelFields = templateFields.filter(f => {
    const n = String(f.name).trim();
    return n !== '_id' && n !== 'createdAt' && n !== 'updatedAt';
  });

  // Prepare template context
  const templateContext = {
    modelName,
    interfaceName,
    schemaName,
    modelExportName,
    initializeFunctionName,
    hasModelTypePattern,
    interfaceExtends,
    modelFields,
    hasInitializeFunction,
    initializeData: templateInitializeData,
    timestamps: timestampsConfig,
    hasTimestamps
  };

  // Debug: Log template context
  log(`Template context timestamps: ${JSON.stringify(timestampsConfig, null, 2)}`, 'info');
  log(`Template context hasTimestamps: ${hasTimestamps}`, 'info');
  log(`Template context initializeData: ${JSON.stringify(templateInitializeData, null, 2)}`, 'info');
  log(
    `Template context modelFields: ${JSON.stringify(
      modelFields.map(f => ({ name: f.name, mongooseType: f.mongooseType })),
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
 * Module output dir for new Mongoose models — same layout as `BackendGenerator` / `scanModulesDirectory`.
 * e.g. `MobileAppConfig` → `src/modules/mobile-app-config/`
 */
async function ensureModuleDirectory(projectPath: string, moduleName: string): Promise<string | null> {
  const moduleDir = join(projectPath, 'src', 'modules', moduleName);
  try {
    await mkdir(moduleDir, { recursive: true });
    return moduleDir;
  } catch (error) {
    log(`Error creating module directory: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    return null;
  }
}

/**
 * Parses a model file and converts it to ModelData format
 */
export function parseModelToModelData(filePath: string, sourceType: SourceType): { success: boolean; modelData?: ModelData; error?: string } {
  try {
    if (sourceType !== 'nodejs-mongoose') {
      return {
        success: false,
        error: 'Model parsing is currently only supported for Node.js (Mongoose) projects'
      };
    }

    const content = readFileSync(filePath, 'utf-8');
    const fileName = filePath.split(/[/\\]/).pop() || '';

    // Extract model name from filename (e.g., "symbolTypes.model.ts" -> "SymbolTypes")
    const modelName = fileName
      .replace(/\.(model|schema|entity)\.(ts|js)$/i, '')
      .replace(/\.(ts|js)$/i, '')
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');

    // Parse the model file to get schema
    const parseResult = parseModelFile(filePath, sourceType);
    if (!parseResult.success || !parseResult.schema) {
      return {
        success: false,
        error: parseResult.error || 'Failed to parse model file'
      };
    }

    const schema = parseResult.schema;

    const mainSchemaName = resolveMainMongooseSchemaName(content, fileName);
    let schemaFieldsContent = '';
    if (mainSchemaName) {
      const regions = extractMainSchemaRegions(content, mainSchemaName);
      if (regions) {
        schemaFieldsContent = mainSchemaFieldsInner(regions);
      }
    }

    // Convert SchemaField[] to ModelField[]
    // Filter out _id, createdAt, updatedAt as they are auto-generated
    const modelFields: ModelField[] = schema.fields
      .filter(f => !['_id', 'createdAt', 'updatedAt'].includes(f.name))
      .map(field => {
        // Map generic types to ModelField types
        let modelFieldType: ModelField['type'] = 'String';
        if (field.type === 'number') modelFieldType = 'Number';
        else if (field.type === 'boolean') modelFieldType = 'Boolean';
        else if (field.type === 'date') modelFieldType = 'Date';
        else if (field.type === 'schema' && !field.isArray) modelFieldType = 'ObjectId';
        else if (field.isArray) modelFieldType = 'Array';

        // Extract ref from relationEntityName if it's a schema type
        let ref: string | undefined = undefined;
        if (field.type === 'schema' && field.relationEntityName) {
          ref = field.relationEntityName;
        }

        // Parse unique and trim from the field definition in the content
        let isUnique = false;
        let hasTrim = false;

        if (schemaFieldsContent) {
          // Find the field definition: fieldName: { ... } (handle nested objects)
          const fieldPattern = new RegExp(`(${field.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\s*:\\s*\\{`, 'i');
          const fieldMatch = schemaFieldsContent.match(fieldPattern);

          if (fieldMatch) {
            const fieldStart = fieldMatch.index! + fieldMatch[0].length;
            // Find the matching closing brace for this field definition
            let braceCount = 1;
            let inString = false;
            let stringChar = '';
            let fieldEnd = fieldStart;

            for (let i = fieldStart; i < schemaFieldsContent.length; i++) {
              const char = schemaFieldsContent[i];
              const prevChar = i > 0 ? schemaFieldsContent[i - 1] : '';

              if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
                if (!inString) {
                  inString = true;
                  stringChar = char;
                } else if (char === stringChar) {
                  inString = false;
                }
                continue;
              }

              if (!inString) {
                if (char === '{') braceCount++;
                if (char === '}') {
                  braceCount--;
                  if (braceCount === 0) {
                    fieldEnd = i;
                    break;
                  }
                }
              }
            }

            const fieldDef = schemaFieldsContent.substring(fieldStart, fieldEnd);
            // Check for unique: true
            const uniquePattern = /unique\s*:\s*(true|1)/i;
            isUnique = uniquePattern.test(fieldDef);

            // Check for trim: true (only for String types)
            if (modelFieldType === 'String') {
              const trimPattern = /trim\s*:\s*(true|1)/i;
              hasTrim = trimPattern.test(fieldDef);
            }
          }
        } else {
          // Fallback: default trim to true for String fields if we can't parse
          hasTrim = modelFieldType === 'String';
        }

        return {
          name: field.name,
          type: modelFieldType,
          required: field.required,
          unique: isUnique,
          trim: hasTrim,
          ref
        };
      });

    // Parse initialize function if it exists
    let hasInitializeFunction = false;
    let initializeData: Array<Record<string, string>> = [];

    // Find initialize function pattern: export const initializeModelName = async (): Promise<void> => { ... }
    // More flexible pattern to match the entire function body
    const initializeFunctionPattern = /export\s+const\s+initialize\w+\s*=\s*async\s*\(\)\s*:\s*Promise<void>\s*=>\s*\{/;
    const initializeMatch = content.match(initializeFunctionPattern);

    if (initializeMatch) {
      hasInitializeFunction = true;
      const functionStart = initializeMatch.index! + initializeMatch[0].length;

      // Find the matching closing brace for the function
      let braceCount = 1;
      let inString = false;
      let stringChar = '';
      let functionEnd = functionStart;

      for (let i = functionStart; i < content.length; i++) {
        const char = content[i];
        const prevChar = i > 0 ? content[i - 1] : '';

        if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
          if (!inString) {
            inString = true;
            stringChar = char;
          } else if (char === stringChar) {
            inString = false;
          }
          continue;
        }

        if (!inString) {
          if (char === '{') braceCount++;
          if (char === '}') {
            braceCount--;
            if (braceCount === 0) {
              functionEnd = i;
              break;
            }
          }
        }
      }

      const functionBody = content.substring(functionStart, functionEnd);

      // Find defaultData array: const defaultData = [ { ... }, { ... } ];
      const defaultDataPattern = /const\s+defaultData\s*=\s*\[([\s\S]*?)\];/;
      const defaultDataMatch = functionBody.match(defaultDataPattern);

      if (defaultDataMatch && defaultDataMatch[1]) {
        const dataArrayContent = defaultDataMatch[1];

        // Parse each object in the array: { field1: 'value1', field2: 'value2' }
        // Handle nested objects properly
        let i = 0;
        while (i < dataArrayContent.length) {
          // Find the start of an object: {
          if (dataArrayContent[i] === '{') {
            const objectStart = i;
            let braceCount = 1;
            let inString = false;
            let stringChar = '';
            i++;

            // Find the matching closing brace
            while (i < dataArrayContent.length && braceCount > 0) {
              const char = dataArrayContent[i];
              const prevChar = i > 0 ? dataArrayContent[i - 1] : '';

              if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
                if (!inString) {
                  inString = true;
                  stringChar = char;
                } else if (char === stringChar) {
                  inString = false;
                }
                i++;
                continue;
              }

              if (!inString) {
                if (char === '{') braceCount++;
                if (char === '}') {
                  braceCount--;
                  if (braceCount === 0) {
                    const objectContent = dataArrayContent.substring(objectStart + 1, i);
                    const dataItem: Record<string, string> = {};

                    // Parse each field: fieldName: 'value' or fieldName: value
                    const fieldPattern = /(\w+)\s*:\s*([^,}]+(?:\{[^}]*\}[^,}]*)*)/g;
                    let fieldMatch: RegExpExecArray | null;

                    while ((fieldMatch = fieldPattern.exec(objectContent)) !== null) {
                      const fieldName = fieldMatch[1];
                      let fieldValue = fieldMatch[2].trim();

                      // Remove quotes if present (handle both single and double quotes)
                      if ((fieldValue.startsWith("'") && fieldValue.endsWith("'")) || (fieldValue.startsWith('"') && fieldValue.endsWith('"'))) {
                        fieldValue = fieldValue.slice(1, -1);
                      }

                      dataItem[fieldName] = fieldValue;
                    }

                    if (Object.keys(dataItem).length > 0) {
                      initializeData.push(dataItem);
                    }
                    break;
                  }
                }
              }
              i++;
            }
          } else {
            i++;
          }
        }
      }
    }

    // Parse timestamps from schema options
    let timestampsConfig = { createdAt: false, updatedAt: false };

    // Find schema options (second parameter) - more robust pattern
    // Look for: new Schema<...>({...}, { ... })
    const schemaPattern = /new\s+Schema\s*<[^>]*>\s*\(/;
    const schemaMatch = content.match(schemaPattern);

    if (schemaMatch) {
      const schemaStart = schemaMatch.index! + schemaMatch[0].length;
      let parenCount = 1;
      let inString = false;
      let stringChar = '';
      let firstBraceEnd = -1;
      let secondBraceStart = -1;
      let braceCount = 0;

      // Find first parameter (fields) and second parameter (options)
      for (let i = schemaStart; i < content.length; i++) {
        const char = content[i];
        const prevChar = i > 0 ? content[i - 1] : '';

        if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
          if (!inString) {
            inString = true;
            stringChar = char;
          } else if (char === stringChar) {
            inString = false;
          }
          continue;
        }

        if (!inString) {
          if (char === '(') parenCount++;
          if (char === ')') {
            parenCount--;
            if (parenCount === 0) break;
          }

          // Track braces for first parameter (fields)
          if (char === '{' && firstBraceEnd === -1) {
            braceCount = 1;
            for (let j = i + 1; j < content.length; j++) {
              const c = content[j];
              const p = j > 0 ? content[j - 1] : '';
              if ((c === '"' || c === "'" || c === '`') && p !== '\\') {
                if (!inString) {
                  inString = true;
                  stringChar = c;
                } else if (c === stringChar) {
                  inString = false;
                }
                continue;
              }
              if (!inString) {
                if (c === '{') braceCount++;
                if (c === '}') {
                  braceCount--;
                  if (braceCount === 0) {
                    firstBraceEnd = j + 1;
                    // Look for comma and second parameter (options)
                    for (let k = j + 1; k < content.length && k < j + 50; k++) {
                      if (content[k] === '{') {
                        secondBraceStart = k;
                        break;
                      }
                      if (content[k] === ')') break; // No second parameter
                    }
                    break;
                  }
                }
              }
            }
          }
        }
      }

      if (secondBraceStart !== -1) {
        // Find the matching closing brace for options
        let optionsBraceCount = 1;
        let inStringOptions = false;
        let stringCharOptions = '';
        let optionsEnd = secondBraceStart + 1;

        for (let i = secondBraceStart + 1; i < content.length; i++) {
          const char = content[i];
          const prevChar = i > 0 ? content[i - 1] : '';

          if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
            if (!inStringOptions) {
              inStringOptions = true;
              stringCharOptions = char;
            } else if (char === stringCharOptions) {
              inStringOptions = false;
            }
            continue;
          }

          if (!inStringOptions) {
            if (char === '{') optionsBraceCount++;
            if (char === '}') {
              optionsBraceCount--;
              if (optionsBraceCount === 0) {
                optionsEnd = i;
                break;
              }
            }
          }
        }

        const schemaOptions = content.substring(secondBraceStart, optionsEnd);

        // Check for timestamps: { createdAt: true, updatedAt: true }
        // Handle nested braces properly
        const timestampsObjectPattern = /timestamps\s*:\s*\{/;
        const timestampsMatch = schemaOptions.match(timestampsObjectPattern);

        if (timestampsMatch) {
          const timestampsStart = timestampsMatch.index! + timestampsMatch[0].length;
          let tsBraceCount = 1;
          let inStringTS = false;
          let stringCharTS = '';
          let timestampsEnd = timestampsStart;

          for (let i = timestampsStart; i < schemaOptions.length; i++) {
            const char = schemaOptions[i];
            const prevChar = i > 0 ? schemaOptions[i - 1] : '';

            if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
              if (!inStringTS) {
                inStringTS = true;
                stringCharTS = char;
              } else if (char === stringCharTS) {
                inStringTS = false;
              }
              continue;
            }

            if (!inStringTS) {
              if (char === '{') tsBraceCount++;
              if (char === '}') {
                tsBraceCount--;
                if (tsBraceCount === 0) {
                  timestampsEnd = i;
                  break;
                }
              }
            }
          }

          const timestampsContent = schemaOptions.substring(timestampsStart, timestampsEnd);
          const createdAtPattern = /createdAt\s*:\s*(true|1)/i;
          const updatedAtPattern = /updatedAt\s*:\s*(true|1)/i;

          timestampsConfig.createdAt = createdAtPattern.test(timestampsContent);
          timestampsConfig.updatedAt = updatedAtPattern.test(timestampsContent);
        } else {
          // Check for timestamps: true (legacy format - both enabled)
          const timestampsTruePattern = /timestamps\s*:\s*(true|1)/i;
          if (timestampsTruePattern.test(schemaOptions)) {
            timestampsConfig.createdAt = true;
            timestampsConfig.updatedAt = true;
          }
        }
      }
    }

    log(`Parsed timestamps: ${JSON.stringify(timestampsConfig, null, 2)}`, 'info');

    return {
      success: true,
      modelData: {
        modelName,
        fields: modelFields,
        hasInitializeFunction,
        initializeData: initializeData.length > 0 ? initializeData : undefined,
        timestamps: timestampsConfig.createdAt || timestampsConfig.updatedAt ? timestampsConfig : undefined
      }
    };
  } catch (error) {
    log(`Error parsing model to ModelData: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
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

    const moduleName = moduleNameFromEntity(modelData.modelName);
    const moduleDir = await ensureModuleDirectory(projectPath, moduleName);
    if (!moduleDir) {
      return {
        success: false,
        error: 'Could not find or create module directory'
      };
    }

    const modelContent = generateMongooseModel(modelData);

    const fileName = `${moduleName}.model.ts`;
    const filePath = join(moduleDir, fileName);

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

/**
 * Updates an existing model file in the project
 */
export async function updateModel(filePath: string, sourceType: SourceType, modelData: ModelData): Promise<UpdateModelResult> {
  try {
    if (sourceType !== 'nodejs-mongoose') {
      return {
        success: false,
        error: 'Model update is currently only supported for Node.js (Mongoose) projects'
      };
    }

    // Check if file exists
    if (!existsSync(filePath)) {
      return {
        success: false,
        error: `Model file does not exist: ${filePath}`
      };
    }

    // Preserve initialize seed data when the modal round-trip dropped it (no field edits)
    let effectiveModelData = modelData;
    if (
      modelData.hasInitializeFunction &&
      (!modelData.initializeData || modelData.initializeData.length === 0)
    ) {
      const parsed = parseModelToModelData(filePath, sourceType);
      if (parsed.success && parsed.modelData?.initializeData?.length) {
        effectiveModelData = {
          ...modelData,
          initializeData: parsed.modelData.initializeData
        };
      }
    }

    // Generate model file content
    let modelContent = generateMongooseModel(effectiveModelData);

    const existingContent = readFileSync(filePath, 'utf-8');
    const markerNames = getCustomBlockMarkersPresentInSource(modelContent, getDefaultCustomBlockMarkerNames());
    if (markerNames.length > 0) {
      const mergeResult = applyCustomBlockMerge({
        existingContent,
        renderedContent: modelContent,
        markerNames,
        customImportsPrecedence: true
      });
      if (mergeResult.merged === null) {
        return {
          success: false,
          error: mergeResult.error || 'Failed to preserve custom blocks in model file'
        };
      }
      modelContent = mergeResult.merged;
    }

    // Write file (overwrite existing)
    await writeFile(filePath, modelContent, 'utf-8');

    log(`Model updated successfully: ${filePath}`, 'info');

    return {
      success: true,
      filePath
    };
  } catch (error) {
    log(`Error updating model: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
