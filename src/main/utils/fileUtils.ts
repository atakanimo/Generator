/**
 * File Operations Utility
 * Centralized file I/O operations with error handling and safety features
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { log } from './logger.js';

export interface FileReadResult {
  success: boolean;
  content?: string;
  error?: string;
}

export interface FileWriteResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

/**
 * Safely read a file with error handling
 */
export function safeReadFile(filePath: string): FileReadResult {
  try {
    if (!existsSync(filePath)) {
      return {
        success: false,
        error: `File not found: ${filePath}`
      };
    }

    const content = readFileSync(filePath, 'utf-8');
    return {
      success: true,
      content
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`Failed to read file ${filePath}: ${errorMessage}`, 'error');
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Safely write a file with directory creation and optional backup
 */
export function safeWriteFile(
  filePath: string,
  content: string,
  options: {
    createBackup?: boolean;
    ensureDirectory?: boolean;
  } = {}
): FileWriteResult {
  const { createBackup = false, ensureDirectory = true } = options;

  try {
    // Ensure directory exists
    if (ensureDirectory) {
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    // Create backup if file exists and backup is requested
    if (createBackup && existsSync(filePath)) {
      const backupPath = `${filePath}.backup`;
      copyFileSync(filePath, backupPath);
      log(`Backup created: ${backupPath}`, 'info');
    }

    // Write file
    writeFileSync(filePath, content, 'utf-8');

    log(`File written successfully: ${filePath}`, 'info');
    return {
      success: true,
      filePath
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`Failed to write file ${filePath}: ${errorMessage}`, 'error');
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Ensure a directory exists, create if it doesn't
 */
export function ensureDirectory(dirPath: string): boolean {
  try {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
      log(`Directory created: ${dirPath}`, 'info');
    }
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`Failed to create directory ${dirPath}: ${errorMessage}`, 'error');
    return false;
  }
}

/**
 * Ensure multiple directories exist
 */
export function ensureDirectories(dirPaths: string[]): boolean {
  try {
    for (const dirPath of dirPaths) {
      if (!ensureDirectory(dirPath)) {
        return false;
      }
    }
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`Failed to create directories: ${errorMessage}`, 'error');
    return false;
  }
}

/**
 * Append content to a file (safe injection helper)
 */
export function appendToFile(filePath: string, content: string): FileWriteResult {
  try {
    const readResult = safeReadFile(filePath);

    if (!readResult.success) {
      // File doesn't exist, create new with content
      return safeWriteFile(filePath, content);
    }

    const existingContent = readResult.content || '';
    const newContent = existingContent + content;

    return safeWriteFile(filePath, newContent, { createBackup: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`Failed to append to file ${filePath}: ${errorMessage}`, 'error');
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Check if content already exists in file (duplicate detection)
 */
export function contentExistsInFile(filePath: string, searchContent: string): boolean {
  try {
    if (!existsSync(filePath)) {
      return false;
    }

    const content = readFileSync(filePath, 'utf-8');
    return content.includes(searchContent);
  } catch (error) {
    log(`Error checking file content: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    return false;
  }
}

/**
 * Create a default file from template if it doesn't exist
 */
export function createDefaultFile(filePath: string, defaultContent: string): FileWriteResult {
  if (existsSync(filePath)) {
    return {
      success: true,
      filePath
    };
  }

  return safeWriteFile(filePath, defaultContent, { ensureDirectory: true });
}

/**
 * Get common project directories based on project root
 */
export function getProjectDirectories(projectRoot: string) {
  return {
    routes: join(projectRoot, 'src', 'routes'),
    services: join(projectRoot, 'src', 'services'),
    models: join(projectRoot, 'src', 'models'),
    types: join(projectRoot, 'src', 'types'),
    utils: join(projectRoot, 'src', 'utils'),
    interfaces: join(projectRoot, 'src', 'interfaces'),
    helpers: join(projectRoot, 'src', 'helpers'),
    controllers: join(projectRoot, 'src', 'controllers')
  };
}

/**
 * Get common frontend directories based on project root
 */
export function getFrontendDirectories(projectRoot: string) {
  return {
    services: join(projectRoot, 'src', 'services'),
    components: join(projectRoot, 'src', 'components'),
    pages: join(projectRoot, 'src', 'pages'),
    store: join(projectRoot, 'src', 'store'),
    slices: join(projectRoot, 'src', 'store', 'slices'),
    thunks: join(projectRoot, 'src', 'store', 'thunks'),
    types: join(projectRoot, 'src', 'types'),
    utils: join(projectRoot, 'src', 'utils')
  };
}
