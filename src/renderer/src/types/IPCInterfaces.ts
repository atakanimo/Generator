/**
 * IPC-related interfaces for communication between renderer and main process
 */

export interface ScannedModel {
  fileName: string;
  path: string;
}

export interface ScanResult {
  success: boolean;
  models: ScannedModel[];
  error?: string;
}

export interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  isArray: boolean;
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

export interface GenerateCodeResult {
  success: boolean;
  filePath?: string;
  error?: string;
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

export interface GenerateFrontendResult {
  success: boolean;
  files?: {
    service?: string;
    thunk?: string;
    slice?: string;
    page?: string;
  };
  warnings?: string[];
  errors?: string[];
}

