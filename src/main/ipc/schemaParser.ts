import { readFileSync } from 'fs';
import {
  entityNameFromModelFileName,
  resolveMainMongooseSchemaName,
  extractMainSchemaRegions,
  parseSchemaOptionsMeta,
  parseMongooseFieldModifiers
} from '../utils/mongooseSchemaExtract.js';

export { entityNameFromModelFileName };

export interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  isArray: boolean;
  includeRelation?: boolean;
  relationEntityName?: string;
  relationProperty?: string;
  relationPopulateFields?: string[];
  uiComponent?: string;
  showInTable?: boolean;
  isSearchable?: boolean;
  filterType?: string;
  isReadonly?: boolean;
  hiddenFromCreate?: boolean;
  hiddenFromUpdate?: boolean;
  label?: string;
  trim?: boolean;
  unique?: boolean;
}

export interface SchemaDefinition {
  entityName: string;
  fields: SchemaField[];
  nestedSchemas?: SchemaDefinition[];
}

export interface ParseResult {
  success: boolean;
  schema?: SchemaDefinition;
  error?: string;
}

/**
 * Check if the file contains model-related code (Mongoose or TypeScript model patterns)
 */
function isModelFile(content: string, fileName: string): { isValid: boolean; reason?: string } {
  // Check if filename contains "model" (case insensitive)
  const lowerFileName = fileName.toLowerCase();
  if (!lowerFileName.includes('model')) {
    return {
      isValid: false,
      reason: 'File name must contain "model" (e.g., User.model.ts, UserModel.ts)'
    };
  }

  // Check for Mongoose Schema pattern: new Schema<...>({...})
  const mongooseSchemaPattern = /new\s+Schema\s*<[^>]*>\s*\(/i;
  const hasMongooseSchema = mongooseSchemaPattern.test(content);

  // Check for mongoose.model export: mongoose.model<...>('...', ...Schema)
  const mongooseModelPattern = /mongoose\.model\s*<[^>]*>\s*\(/i;
  const hasMongooseModel = mongooseModelPattern.test(content);

  // If both Schema and model are present, it's definitely a model file
  if (hasMongooseSchema && hasMongooseModel) {
    return { isValid: true };
  }

  // Check for alternative patterns
  const alternativeSchemaPattern = /Schema\s*\(/i;
  const hasAlternativeSchema = alternativeSchemaPattern.test(content);
  const hasMongooseImport = /from\s+['"]mongoose['"]/i.test(content);

  if (hasAlternativeSchema && hasMongooseImport) {
    return { isValid: true };
  }

  // Check for TypeScript model patterns (interface/class with properties)
  const tsModelPatterns = [
    /(interface|class)\s+\w+\s*\{[\s\S]{0,500}?\w+\s*:\s*(string|number|boolean|Date|ObjectId)/i,
    /export\s+(interface|class)\s+\w+/i
  ];

  const hasTsModel = tsModelPatterns.some(pattern => pattern.test(content));
  if (hasTsModel && hasMongooseImport) {
    return { isValid: true };
  }

  return {
    isValid: false,
    reason: 'File does not contain Mongoose Schema and model export patterns'
  };
}

export interface ParseModelFileOptions {
  /** When the file stem differs from mongoose.model('ThisName'), pass the registered name so the correct schema is resolved. */
  preferredMongooseModelName?: string;
}

/**
 * Parse a TypeScript/JavaScript model file and extract schema information
 * Supports both Mongoose schemas and TypeScript interfaces/classes
 */
export function parseModelFile(
  filePath: string,
  sourceType?: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | null,
  options?: ParseModelFileOptions | null
): ParseResult {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const fileName = filePath.split(/[/\\]/).pop() || '';

    // Check if this is actually a model file
    const modelCheck = isModelFile(content, fileName);
    if (!modelCheck.isValid) {
      return {
        success: false,
        error: modelCheck.reason || 'File does not appear to be a model file'
      };
    }

    const fileEntityName = entityNameFromModelFileName(fileName);
    const preferred = options?.preferredMongooseModelName?.trim();

    const mainSchemaName = resolveMainMongooseSchemaName(content, fileName, preferred ?? undefined);

    let schemaContent = content;
    let hasTimestamps = false;
    let deletedInToJSON: string[] = [];

    if (mainSchemaName) {
      const regions = extractMainSchemaRegions(content, mainSchemaName);
      if (regions) {
        schemaContent = regions.fieldsBlock;
        const meta = parseSchemaOptionsMeta(regions.optionsBlock);
        hasTimestamps = meta.hasTimestamps;
        deletedInToJSON = meta.deletedInToJSON;
      }
    }

    const fields: SchemaField[] = [];

    // Strategy 1: Parse Mongoose Schema
    // First, find all field definitions: fieldName: { ... }
    const fieldPattern = /(\w+)\s*:\s*\{/g;
    let fieldMatch: RegExpExecArray | null;
    let hasMongooseSchema = false;

    while ((fieldMatch = fieldPattern.exec(schemaContent)) !== null) {
      const fieldName = fieldMatch[1];
      const fieldStart = fieldMatch.index;

      // Find the end of this field definition (matching closing brace)
      let braceCount = 1;
      let inString = false;
      let stringChar = '';
      let fieldEnd = fieldStart + fieldMatch[0].length;

      for (let i = fieldStart + fieldMatch[0].length; i < schemaContent.length; i++) {
        const char = schemaContent[i];
        const prevChar = i > 0 ? schemaContent[i - 1] : '';

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
              fieldEnd = i + 1;
              break;
            }
          }
        }
      }

      const fieldContent = schemaContent.substring(fieldStart, fieldEnd);
      hasMongooseSchema = true;

      // Check if this is a nested schema array (e.g., items: { type: [PortfolioSnapshotItemSchema], required: true })
      const nestedSchemaArrayPattern = /type\s*:\s*\[\s*(\w+Schema)\s*\]/;
      const nestedSchemaArrayMatch = fieldContent.match(nestedSchemaArrayPattern);

      if (nestedSchemaArrayMatch) {
        // This is an array of nested schema
        // More robust required check
        const requiredPattern = /required\s*:\s*(true|1)/i;
        const requiredMatch = fieldContent.match(requiredPattern);
        const isRequired = requiredMatch !== null;

        fields.push({
          name: fieldName,
          type: 'schema',
          required: isRequired,
          isArray: true
        });
        continue;
      }

      // Check if this field references a nested schema (e.g., Schema.Types.ObjectId with ref)
      if (fieldContent.includes('Schema.Types.ObjectId') && fieldContent.includes('ref:')) {
        const isArrayField = fieldContent.includes('type: [Schema.Types.ObjectId]') || fieldContent.includes('type:[Schema.Types.ObjectId]');
        // More robust required check: required: true, required:true, required: true, or just required (without value)
        const requiredPattern = /required\s*:\s*(true|1)/i;
        const requiredMatch = fieldContent.match(requiredPattern);
        const isRequired = requiredMatch !== null;

        // Extract entity name from ref: 'EntityName' or ref: "EntityName"
        const refPattern = /ref\s*:\s*['"]([^'"]+)['"]/;
        const refMatch = fieldContent.match(refPattern);
        let relationEntityName: string | undefined = undefined;
        if (refMatch && refMatch[1]) {
          // Convert ref name to PascalCase entity name
          // e.g., "SymbolTypes" -> "SymbolTypes", "symbol-types" -> "SymbolTypes"
          const refName = refMatch[1];
          // If it contains dashes/underscores, split and convert each word
          if (refName.includes('-') || refName.includes('_') || refName.includes(' ')) {
            relationEntityName = refName
              .split(/[-_\s]/)
              .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join('');
          } else {
            // Already in PascalCase or camelCase, just capitalize first letter
            relationEntityName = refName.charAt(0).toUpperCase() + refName.slice(1);
          }
        }

        fields.push({
          name: fieldName,
          type: 'schema',
          required: isRequired,
          isArray: isArrayField,
          includeRelation: true,
          relationEntityName,
          ...parseMongooseFieldModifiers(fieldContent, 'schema')
        });
        continue;
      }

      // Parse standard Mongoose types (String, Number, Date, etc.)
      // Support both: type: String and type: [String]
      const mongooseTypePattern = /type\s*:\s*\[?\s*(\w+(?:\.\w+)*)\s*\]?/;
      const mongooseTypeMatch = fieldContent.match(mongooseTypePattern);

      if (mongooseTypeMatch) {
        const mongooseType = mongooseTypeMatch[1];
        // More robust required check
        const requiredPattern = /required\s*:\s*(true|1)/i;
        const requiredMatch = fieldContent.match(requiredPattern);
        const isRequired = requiredMatch !== null;

        // Check if it's an array: type: [String] or type:[String]
        const isArray = fieldContent.includes('type: [') || fieldContent.includes('type:[');

        const mapped = mapMongooseTypeToGeneric(mongooseType);
        fields.push({
          name: fieldName,
          type: fieldName === '_id' ? 'schema' : mapped,
          required: isRequired,
          isArray,
          ...parseMongooseFieldModifiers(fieldContent, fieldName === '_id' ? 'schema' : mapped)
        });
      }
    }

    // Strategy 2: Parse TypeScript Interface/Class (e.g., name: string; or name?: string;)
    if (!hasMongooseSchema) {
      // Match property declarations: "name: string;" or "name?: string;" or "name: string[];"
      const tsInterfacePattern = /(?:public\s+|private\s+|protected\s+)?(\w+)(\??)\s*:\s*(\w+)(\[\])?(\s*;|\s*=|)/g;
      let match: RegExpExecArray | null;

      while ((match = tsInterfacePattern.exec(schemaContent)) !== null) {
        const fieldName = match[1];
        const optional = match[2] === '?';
        const tsType = match[3];
        const isArray = match[4] === '[]';

        // Skip if it's a method or constructor
        const matchIndex = match.index ?? 0;
        if (
          ['constructor', 'function', 'async'].some(keyword => schemaContent.substring(Math.max(0, matchIndex - 20), matchIndex).includes(keyword))
        ) {
          continue;
        }

        const mappedTs = mapTypeScriptTypeToGeneric(tsType);
        fields.push({
          name: fieldName,
          type: fieldName === '_id' ? 'schema' : mappedTs,
          required: !optional,
          isArray
        });
      }

      // Also try simpler pattern for interface properties
      if (fields.length === 0) {
        const simplePattern = /(\w+)(\??)\s*:\s*(\w+)(\[\])?/g;
        let match: RegExpExecArray | null;
        while ((match = simplePattern.exec(schemaContent)) !== null) {
          // Skip if inside a function or method
          const beforeMatch = schemaContent.substring(Math.max(0, match.index! - 50), match.index!);
          if (beforeMatch.includes('(') && !beforeMatch.includes(')')) {
            continue;
          }

          const fieldName = match[1];
          const optional = match[2] === '?';
          const tsType = match[3];
          const isArray = match[4] === '[]';

          // Avoid duplicates
          if (!fields.some(f => f.name === fieldName)) {
            const mappedTs = mapTypeScriptTypeToGeneric(tsType);
            fields.push({
              name: fieldName,
              type: fieldName === '_id' ? 'schema' : mappedTs,
              required: !optional,
              isArray
            });
          }
        }
      }
    }

    // Add _id field if sourceType is nodejs-mongoose and not already present (at the beginning)
    if (sourceType === 'nodejs-mongoose' && !fields.some(f => f.name === '_id')) {
      fields.unshift({
        name: '_id',
        type: 'schema',
        required: true,
        isArray: false,
        showInTable: true,
        isSearchable: true,
        label: 'ID'
      });
    }

    if (sourceType === 'nodejs-mongoose') {
      for (let i = 0; i < fields.length; i++) {
        if (fields[i].name === '_id') {
          fields[i] = { ...fields[i], type: 'schema', required: true, isArray: false };
        }
      }
    }

    // Add createdAt and updatedAt if timestamps is enabled and not deleted in toJSON
    if (hasTimestamps) {
      if (!deletedInToJSON.includes('createdAt') && !fields.some(f => f.name === 'createdAt')) {
        fields.push({
          name: 'createdAt',
          type: 'date',
          required: false,
          isArray: false,
          showInTable: true,
          isSearchable: true,
          filterType: 'date-range',
          label: 'Created At',
          isReadonly: true,
          hiddenFromCreate: true,
          hiddenFromUpdate: true
        });
      }
      if (!deletedInToJSON.includes('updatedAt') && !fields.some(f => f.name === 'updatedAt')) {
        fields.push({
          name: 'updatedAt',
          type: 'date',
          required: false,
          isArray: false,
          showInTable: true,
          isSearchable: true,
          filterType: 'date-range',
          label: 'Updated At',
          isReadonly: true,
          hiddenFromCreate: true,
          hiddenFromUpdate: true
        });
      }
    }

    if (fields.length === 0 && !mainSchemaName) {
      return {
        success: false,
        error: 'No fields found in the model file'
      };
    }

    // Parse nested schemas (schemas that are not the main one)
    const nestedSchemas: SchemaDefinition[] = [];
    if (mainSchemaName) {
      // Find all schema definitions except the main one
      const allSchemaPattern = /const\s+(\w+Schema)\s*=\s*new\s+Schema\s*<[^>]*>\s*\(/gi;
      const allSchemaMatches: Array<{ name: string; index: number }> = [];
      let schemaMatch: RegExpExecArray | null;

      while ((schemaMatch = allSchemaPattern.exec(content)) !== null) {
        if (schemaMatch[1] !== mainSchemaName) {
          allSchemaMatches.push({
            name: schemaMatch[1],
            index: schemaMatch.index
          });
        }
      }

      // Parse each nested schema
      for (const nestedSchemaMatch of allSchemaMatches) {
        const nestedSchemaResult = parseNestedSchema(content, nestedSchemaMatch.name);
        if (nestedSchemaResult) {
          nestedSchemas.push(nestedSchemaResult);
        }
      }
    }

    return {
      success: true,
      schema: {
        entityName: fileEntityName,
        fields,
        nestedSchemas: nestedSchemas.length > 0 ? nestedSchemas : undefined
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Parse a nested schema definition
 */
function parseNestedSchema(content: string, schemaName: string): SchemaDefinition | null {
  try {
    // Find the schema definition: const SchemaName = new Schema<...>({...})
    const schemaPattern = new RegExp(`const\\s+${schemaName}\\s*=\\s*new\\s+Schema\\s*<[^>]*>\\s*\\(\\s*\\{`, 'i');
    const schemaMatch = schemaPattern.exec(content);

    if (!schemaMatch) {
      return null;
    }

    // Extract entity name from schema name (e.g., "PortfolioSnapshotItemSchema" -> "PortfolioSnapshotItem")
    const entityName = schemaName.replace(/Schema$/, '');

    // Find the opening brace of the schema object
    const objectStart = schemaMatch.index + schemaMatch[0].length - 1; // -1 to include the {

    // Find the matching closing brace for the schema object (first level)
    let braceCount = 1;
    let inString = false;
    let stringChar = '';
    let objectEnd = objectStart + 1;

    for (let i = objectStart + 1; i < content.length; i++) {
      const char = content[i];
      const prevChar = i > 0 ? content[i - 1] : '';

      // Handle string literals
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
            objectEnd = i + 1;
            break;
          }
        }
      }
    }

    // Extract the schema object content
    const schemaContent = content.substring(objectStart, objectEnd);

    const fields: SchemaField[] = [];

    // Parse fields similar to main schema parsing
    const fieldPattern = /(\w+)\s*:\s*\{/g;
    let fieldMatch: RegExpExecArray | null;

    while ((fieldMatch = fieldPattern.exec(schemaContent)) !== null) {
      const fieldName = fieldMatch[1];
      const fieldStart = fieldMatch.index;

      // Find the end of this field definition
      let braceCount = 1;
      let inString = false;
      let stringChar = '';
      let fieldEnd = fieldStart + fieldMatch[0].length;

      for (let i = fieldStart + fieldMatch[0].length; i < schemaContent.length; i++) {
        const char = schemaContent[i];
        const prevChar = i > 0 ? schemaContent[i - 1] : '';

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
              fieldEnd = i + 1;
              break;
            }
          }
        }
      }

      const fieldContent = schemaContent.substring(fieldStart, fieldEnd);

      // Check if this field references a nested schema (e.g., Schema.Types.ObjectId with ref)
      if (fieldContent.includes('Schema.Types.ObjectId') && fieldContent.includes('ref:')) {
        const isArrayField = fieldContent.includes('type: [Schema.Types.ObjectId]') || fieldContent.includes('type:[Schema.Types.ObjectId]');
        // More robust required check
        const requiredPattern = /required\s*:\s*(true|1)/i;
        const requiredMatch = fieldContent.match(requiredPattern);
        const isRequired = requiredMatch !== null;

        // Extract entity name from ref: 'EntityName' or ref: "EntityName"
        const refPattern = /ref\s*:\s*['"]([^'"]+)['"]/;
        const refMatch = fieldContent.match(refPattern);
        let relationEntityName: string | undefined = undefined;
        if (refMatch && refMatch[1]) {
          // Convert ref name to PascalCase entity name
          // e.g., "SymbolTypes" -> "SymbolTypes", "symbol-types" -> "SymbolTypes"
          const refName = refMatch[1];
          // If it contains dashes/underscores, split and convert each word
          if (refName.includes('-') || refName.includes('_') || refName.includes(' ')) {
            relationEntityName = refName
              .split(/[-_\s]/)
              .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join('');
          } else {
            // Already in PascalCase or camelCase, just capitalize first letter
            relationEntityName = refName.charAt(0).toUpperCase() + refName.slice(1);
          }
        }

        fields.push({
          name: fieldName,
          type: 'schema',
          required: isRequired,
          isArray: isArrayField,
          includeRelation: true,
          relationEntityName,
          ...parseMongooseFieldModifiers(fieldContent, 'schema')
        });
        continue;
      }

      // Parse standard Mongoose types
      // Support both: type: String and type: [String]
      const mongooseTypePattern = /type\s*:\s*\[?\s*(\w+(?:\.\w+)*)\s*\]?/;
      const mongooseTypeMatch = fieldContent.match(mongooseTypePattern);

      if (mongooseTypeMatch) {
        const mongooseType = mongooseTypeMatch[1];
        // More robust required check
        const requiredPattern = /required\s*:\s*(true|1)/i;
        const requiredMatch = fieldContent.match(requiredPattern);
        const isRequired = requiredMatch !== null;

        // Check if it's an array: type: [String] or type:[String]
        const isArray = fieldContent.includes('type: [') || fieldContent.includes('type:[');

        const mapped = mapMongooseTypeToGeneric(mongooseType);
        fields.push({
          name: fieldName,
          type: fieldName === '_id' ? 'schema' : mapped,
          required: isRequired,
          isArray,
          ...parseMongooseFieldModifiers(fieldContent, fieldName === '_id' ? 'schema' : mapped)
        });
      }
    }

    if (fields.length === 0) {
      return null;
    }

    return {
      entityName,
      fields
    };
  } catch (error) {
    return null;
  }
}

/**
 * Map Mongoose types to generic types
 */
function mapMongooseTypeToGeneric(mongooseType: string): string {
  const trimmed = mongooseType.trim();
  // Schema.Types.ObjectId, Types.ObjectId, ObjectId → object id (stored as generic 'schema' in this app)
  if (/objectid$/i.test(trimmed) || /types\.objectid$/i.test(trimmed)) {
    return 'schema';
  }
  const typeMap: Record<string, string> = {
    String: 'string',
    Number: 'number',
    Boolean: 'boolean',
    Date: 'date',
    ObjectId: 'schema',
    Object: 'object',
    Array: 'array',
    Buffer: 'buffer',
    Mixed: 'mixed'
  };

  return typeMap[trimmed] || trimmed.toLowerCase();
}

/**
 * Map TypeScript types to generic types
 */
function mapTypeScriptTypeToGeneric(tsType: string): string {
  const key = tsType.toLowerCase();
  if (key.includes('objectid')) {
    return 'schema';
  }
  const typeMap: Record<string, string> = {
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    Date: 'date',
    ObjectId: 'schema',
    object: 'object',
    any: 'mixed',
    unknown: 'mixed'
  };

  return typeMap[key] || key;
}
