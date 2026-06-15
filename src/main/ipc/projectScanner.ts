import { readdir, readFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import { log } from '../utils/logger.js';

export type SourceType = 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm';

export interface ScannedModel {
  fileName: string;
  path: string;
}

export interface ScanResult {
  success: boolean;
  models: ScannedModel[];
  detectedType?: SourceType;
  detectedTechnologies?: string[];
  discoveryInfo?: string;
  error?: string;
}

export async function scanProject(
  projectPath: string,
  sourceType?: SourceType | null
): Promise<ScanResult> {
  try {
    log('[Generator] Project root selected', 'info');

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
    let finalSourceType: SourceType;
    let detectedTechnologies: string[] = [];

    if (sourceType) {
      finalSourceType = sourceType;
      detectedTechnologies = technologiesFromSourceType(sourceType);
      log(`[Generator] Stack provided by client: ${sourceType}`, 'info');
    } else {
      const detected = await detectProjectStack(projectPath);
      if (!detected.success || !detected.sourceType) {
        return {
          success: false,
          models: [],
          error: detected.error || 'Failed to auto detect stack'
        };
      }
      finalSourceType = detected.sourceType;
      detectedTechnologies = detected.detectedTechnologies;
      log(`[Generator] Stack detected: ${finalSourceType}`, 'info');
    }

    log('[Generator] Model discovery started', 'info');
    if (finalSourceType === 'nodejs-mongoose' || finalSourceType === 'nodejs-typeorm') {
      const srcModulesPath = join(projectPath, 'src', 'modules');
      models = await scanModulesDirectory(srcModulesPath, ['.js', '.ts']);
      log('[Generator] Node discovery path: src/modules/**', 'info');
    } else if (finalSourceType === 'dotnet-ef') {
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

    log(`[Generator] ${models.length} models found`, 'info');
    return {
      success: true,
      models,
      detectedType: finalSourceType,
      detectedTechnologies,
      discoveryInfo:
        finalSourceType === 'nodejs-mongoose' || finalSourceType === 'nodejs-typeorm'
          ? 'Node.js: src/** altında *.model.ts|*.model.js (özyinelemeli tarama).'
          : '.NET: Entities/Models klasörleri ve .cs entity dosyaları taranır.'
    };
  } catch (error) {
    log(
      `[Generator][Failed] step: auto-detect reason: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'error'
    );
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

async function scanModulesDirectory(
  modulesRootPath: string,
  extensions: string[]
): Promise<ScannedModel[]> {
  const models: ScannedModel[] = [];

  try {
    const modulesStats = await stat(modulesRootPath);
    if (!modulesStats.isDirectory()) {
      return models;
    }
  } catch {
    return models;
  }

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.isFile() || entry.name.startsWith('.')) continue;

      const ext = extname(entry.name).toLowerCase();
      const lowerFileName = entry.name.toLowerCase();
      if (!extensions.includes(ext)) continue;
      if (!lowerFileName.endsWith('.model.ts') && !lowerFileName.endsWith('.model.js')) continue;

      models.push({
        fileName: entry.name,
        path: full
      });
    }
  }

  await walk(modulesRootPath);
  return models;
}

interface DetectStackResult {
  success: boolean;
  sourceType?: SourceType;
  detectedTechnologies: string[];
  error?: string;
}

async function detectProjectStack(projectPath: string): Promise<DetectStackResult> {
  const detectedTechnologies: string[] = [];

  // Node.js checks
  const packageJsonPath = join(projectPath, 'package.json');
  try {
    const packageJsonContent = await readFile(packageJsonPath, 'utf-8');
    log('[Generator] package.json found', 'info');
    detectedTechnologies.push('Node.js');
    const pkg = JSON.parse(packageJsonContent) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

    if ('express' in deps) {
      detectedTechnologies.push('Express');
    }
    if ('mongoose' in deps) {
      detectedTechnologies.push('Mongoose');
      log('[Generator] Mongoose detected', 'info');
      return { success: true, sourceType: 'nodejs-mongoose', detectedTechnologies };
    }
    if ('typeorm' in deps) {
      detectedTechnologies.push('TypeORM');
      return { success: true, sourceType: 'nodejs-typeorm', detectedTechnologies };
    }
  } catch {
    // continue to .NET checks
  }

  // .NET checks
  let hasCsproj = false;
  try {
    const entries = await readdir(projectPath, { withFileTypes: true });
    hasCsproj = entries.some(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.csproj'));
    if (hasCsproj) {
      detectedTechnologies.push('C#');
      detectedTechnologies.push('ASP.NET Core');
    }
  } catch {
    // ignore
  }

  let hasProgramCs = false;
  try {
    const programCsStats = await stat(join(projectPath, 'Program.cs'));
    hasProgramCs = programCsStats.isFile();
  } catch {
    // ignore
  }

  if (hasCsproj || hasProgramCs) {
    detectedTechnologies.push('Entity Framework');
    return { success: true, sourceType: 'dotnet-ef', detectedTechnologies };
  }

  return {
    success: false,
    detectedTechnologies,
    error: 'Unable to detect backend stack from project root'
  };
}

function technologiesFromSourceType(sourceType: SourceType): string[] {
  if (sourceType === 'nodejs-mongoose') {
    return ['Node.js', 'Express', 'Mongoose'];
  }
  if (sourceType === 'nodejs-typeorm') {
    return ['Node.js', 'TypeORM'];
  }
  return ['C#', 'ASP.NET Core', 'Entity Framework'];
}

/**
 * Lists `*.model.ts` / `*.model.js` anywhere under `src/**` (recursive).
 * Covers `src/modules`, `src/models`, and other layouts (e.g. `src/auth/user.model.ts`)
 * so `ref: 'User'` can resolve when the file is not under `src/modules/**` only.
 */
export async function listMongooseModelFiles(projectPath: string): Promise<ScannedModel[]> {
  const srcRoot = join(projectPath, 'src');
  return scanModulesDirectory(srcRoot, ['.ts', '.js']);
}

