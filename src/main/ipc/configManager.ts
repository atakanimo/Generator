import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { SchemaDefinition } from './schemaParser';
import { getGeneratorRoot } from '../utils/templateHelpers.js';
import { recordWorkspaceManifestUpsert, type ManifestWorkspacePrefs } from '../utils/manifestSnapshot.js';
import { log } from '../utils/logger.js';

const CONFIG_DIR_NAME = '.scaffold';

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
 * Saves to Generator project's .scaffold folder; optionally updates workspace `.generator/manifest.json`.
 */
export function saveSchemaConfig(
  projectRoot: string,
  schema: SchemaDefinition,
  sourceRelativePath?: string,
  workspace?: ManifestWorkspacePrefs
): { success: boolean; error?: string; filePath?: string; manifestPath?: string } {
  try {
    ensureConfigDir();
    const configPath = getSchemaConfigPath(schema.entityName);
    writeFileSync(configPath, JSON.stringify(schema, null, 2), 'utf-8');

    let manifestPath: string | undefined;
    if (projectRoot?.trim() && sourceRelativePath?.trim()) {
      const man = recordWorkspaceManifestUpsert(
        projectRoot.trim(),
        schema,
        sourceRelativePath.trim(),
        'save',
        workspace
      );
      if (man.success && man.manifestPath) {
        manifestPath = man.manifestPath;
      } else if (!man.success) {
        log(`Manifest snapshot skipped or failed on save | ${JSON.stringify({ reason: man.error })}`, 'warn');
      }
    }

    return { success: true, filePath: configPath, manifestPath };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Load schema configuration from disk
 */
export function loadSchemaConfig(_projectRoot: string, entityName: string): { success: boolean; schema?: SchemaDefinition; error?: string } {
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
      error: error instanceof Error ? error.message : 'Unknown error'
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
