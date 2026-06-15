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
  detectedType?: 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm';
  detectedTechnologies?: string[];
  discoveryInfo?: string;
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
    model?: string;
    crud?: string;
    filters?: string;
    schema?: string;
    route?: string;
    service?: string;
    types?: string;
    routeAdmin?: string;
    serviceAdmin?: string;
  };
  error?: string;
}

export interface GenerateFrontendResult {
  success: boolean;
  files?: {
    /** Present when Include Admin API is off (`service.hbs`) */
    service?: string;
    /** Present when Include Admin API is on (`service.admin.hbs`) */
    serviceAdmin?: string;
    thunk?: string;
    slice?: string;
    page?: string;
    table?: string;
    modal?: string;
  };
  warnings?: string[];
  errors?: string[];
}

