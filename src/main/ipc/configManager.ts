import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { app } from 'electron';
import { fileURLToPath } from 'url';
import { SchemaDefinition } from './schemaParser';

const CONFIG_DIR_NAME = '.scaffold';

/**
 * Get the Generator project root directory by finding package.json
 * Searches upward from the current file location until package.json is found
 */
export function getGeneratorRoot(): string {
  const isDev = process.env.NODE_ENV === 'development' || !app?.isPackaged;
  
  if (isDev) {
    // Start from the current file location (dist-electron/main/ipc/configManager.js)
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
    return resolve(dirname(__filename), '..', '..');
  } else {
    // In production, use app path
    return app.getAppPath();
  }
}

/**
 * Get the config directory path (in Generator project root)
 */
export function getConfigDirPath(): string {
  const generatorRoot = getGeneratorRoot();
  return join(generatorRoot, CONFIG_DIR_NAME);
}

/**
 * Get the schema config file path for an entity
 * Uses only entity name for the filename (no project path)
 */
export function getSchemaConfigPath(entityName: string): string {
  const configDir = getConfigDirPath();
  // Use only entity name for the filename
  return join(configDir, `${entityName}.schema.json`);
}

/**
 * Ensure the .scaffold directory exists
 */
export function ensureConfigDir(): void {
  const configDir = getConfigDirPath();
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
}

/**
 * Save schema configuration to disk
 * Saves to Generator project's .scaffold folder
 */
export function saveSchemaConfig(
  _projectRoot: string,
  schema: SchemaDefinition
): { success: boolean; error?: string; filePath?: string } {
  try {
    ensureConfigDir();
    const configPath = getSchemaConfigPath(schema.entityName);
    writeFileSync(configPath, JSON.stringify(schema, null, 2), 'utf-8');
    return { success: true, filePath: configPath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Load schema configuration from disk
 */
export function loadSchemaConfig(
  _projectRoot: string,
  entityName: string
): { success: boolean; schema?: SchemaDefinition; error?: string } {
  try {
    const configPath = getSchemaConfigPath(entityName);
    
    if (!existsSync(configPath)) {
      return { success: false, error: 'Config file not found' };
    }

    const content = readFileSync(configPath, 'utf-8');
    const schema = JSON.parse(content) as SchemaDefinition;
    
    return { success: true, schema };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if schema config exists
 */
export function schemaConfigExists(_projectRoot: string, entityName: string): boolean {
  const configPath = getSchemaConfigPath(entityName);
  return existsSync(configPath);
}

