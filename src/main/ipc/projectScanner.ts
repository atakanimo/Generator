import { readdir, stat } from 'fs/promises';
import { join, extname } from 'path';

export type SourceType = 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm';

export interface ScannedModel {
  fileName: string;
  path: string;
}

export interface ScanResult {
  success: boolean;
  models: ScannedModel[];
  error?: string;
}

export async function scanProject(
  projectPath: string,
  sourceType: SourceType
): Promise<ScanResult> {
  try {
    // Verify path exists
    const stats = await stat(projectPath);
    if (!stats.isDirectory()) {
      return {
        success: false,
        models: [],
        error: 'Path is not a directory',
      };
    }

    let models: ScannedModel[] = [];

    if (sourceType === 'nodejs-mongoose' || sourceType === 'nodejs-typeorm') {
      // Look for 'src/models' folder first (most common structure)
      const srcModelsPath = join(projectPath, 'src', 'models');
      try {
        const srcModelsStats = await stat(srcModelsPath);
        if (srcModelsStats.isDirectory()) {
          models = await scanDirectory(srcModelsPath, ['.js', '.ts']);
        }
      } catch {
        // src/models folder doesn't exist, try models folder
      }

      // Fallback: Look for 'models' folder at root
      if (models.length === 0) {
        const modelsPath = join(projectPath, 'models');
        try {
          const modelsStats = await stat(modelsPath);
          if (modelsStats.isDirectory()) {
            models = await scanDirectory(modelsPath, ['.js', '.ts']);
          }
        } catch {
          // models folder doesn't exist, fallback to root
        }
      }

      // Final fallback: search root for .js or .ts files
      if (models.length === 0) {
        models = await scanDirectory(projectPath, ['.js', '.ts']);
      }
    } else if (sourceType === 'dotnet-ef') {
      // Look for 'Entities' or 'Models' folder
      const entitiesPath = join(projectPath, 'Entities');
      const modelsPath = join(projectPath, 'Models');

      try {
        const entitiesStats = await stat(entitiesPath);
        if (entitiesStats.isDirectory()) {
          models = await scanDirectory(entitiesPath, ['.cs']);
        }
      } catch {
        // Entities folder doesn't exist
      }

      if (models.length === 0) {
        try {
          const modelsStats = await stat(modelsPath);
          if (modelsStats.isDirectory()) {
            models = await scanDirectory(modelsPath, ['.cs']);
          }
        } catch {
          // Models folder doesn't exist
        }
      }

      // Fallback: search root for .cs files
      if (models.length === 0) {
        models = await scanDirectory(projectPath, ['.cs']);
      }
    }

    return {
      success: true,
      models,
    };
  } catch (error) {
    return {
      success: false,
      models: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function scanDirectory(
  dirPath: string,
  extensions: string[]
): Promise<ScannedModel[]> {
  const models: ScannedModel[] = [];

  // Files to exclude
  const excludedFiles = ['index.ts', 'index.js', 'index.d.ts'];
  
  // Check if a file should be excluded
  const shouldExclude = (fileName: string): boolean => {
    const lowerFileName = fileName.toLowerCase();
    
    // Exclude files starting with a dot
    if (fileName.startsWith('.')) {
      return true;
    }
    // Exclude index files
    if (excludedFiles.includes(lowerFileName)) {
      return true;
    }
    // Only include files that contain "model" in the name
    if (!lowerFileName.includes('model')) {
      return true;
    }
    return false;
  };

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile()) {
        // Skip excluded files
        if (shouldExclude(entry.name)) {
          continue;
        }
        
        const ext = extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          models.push({
            fileName: entry.name,
            path: join(dirPath, entry.name),
          });
        }
      }
    }
  } catch (error) {
    // Error is handled by the caller
  }

  return models;
}

