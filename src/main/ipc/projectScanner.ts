import { readdir, readFile, stat } from 'fs/promises';
import { join, extname } from 'path';
import { log } from '../utils/logger.js';
import { findDotnetHost, listDotnetEntityFiles } from '../parsers/dotnet/dotnetHost.js';
import { getWorkspacePreferences } from '../utils/manifestSnapshot.js';
import { findPythonHost, listPythonModels } from './pythonBackend.js';
import type { ScannedModel } from '../../shared/ipcTypes.js';
import { DATABASE_LABELS, type BackendDatabase } from '../../shared/backendDatabase.js';

export type SourceType = 'nodejs-mongoose' | 'dotnet-ef' | 'nodejs-typeorm' | 'python-fastapi';
export type { ScannedModel };

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

    const workspace = getWorkspacePreferences(projectPath);
    const savedStack = workspace?.backendStack;
    if (!sourceType && savedStack) {
      sourceType = savedStack;
      log(`[Generator] Stack from manifest: ${savedStack}`, 'info');
    }
    if (sourceType) {
      finalSourceType = sourceType;
      detectedTechnologies = technologiesFromSourceType(sourceType, workspace?.database);
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
    } else if (finalSourceType === 'python-fastapi') {
      // Python host (plan backend-python-fastapi PY7): manifest modules + hand-written `modules/<m>/model.py` to import.
      models = listPythonModels(projectPath);
      log(`[Generator] Python host: ${models.filter(m => m.kind === 'generated').length} generated, ${models.filter(m => m.kind === 'importable').length} importable`, 'info');
    } else if (finalSourceType === 'dotnet-ef' && findDotnetHost(projectPath)) {
      // Generator host (plan backend-dotnet-efcore §3): Domain entity files.
      const host = findDotnetHost(projectPath)!;
      models = listDotnetEntityFiles(host).map(f => ({ fileName: f.fileName, path: f.path }));
      log(`[Generator] .NET host ${host.app}: src/${host.app}.Domain/**`, 'info');
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
          : finalSourceType === 'python-fastapi'
            ? "Python + FastAPI: manifest'teki modüller (model_generated.py) ve içe aktarılabilir elle yazılmış modules/<m>/model.py."
            : findDotnetHost(projectPath)
            ? `.NET 10 + EF Core: src/${findDotnetHost(projectPath)!.app}.Domain/<Modül>/<Entity>.cs (elle yazılmış entity'ler yalnızca ilişki hedefi).`
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

export async function detectProjectStack(projectPath: string): Promise<DetectStackResult> {
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

  // Python + FastAPI host (pyproject.toml + src/<pkg>/core).
  if (findPythonHost(projectPath)) {
    detectedTechnologies.push('Python 3.12', 'FastAPI', 'Pydantic v2', 'MongoDB');
    return { success: true, sourceType: 'python-fastapi', detectedTechnologies };
  }

  // .NET checks: Generator host (solution + src/<App>.Domain) first.
  const host = findDotnetHost(projectPath);
  if (host) {
    detectedTechnologies.push('.NET 10', 'ASP.NET Core', 'EF Core');
    if (host.database) detectedTechnologies.push(DATABASE_LABELS[host.database]);
    return { success: true, sourceType: 'dotnet-ef', detectedTechnologies };
  }
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

/** Stack known in advance (manifest / client); the database comes from the manifest (`workspace.database`). */
function technologiesFromSourceType(sourceType: SourceType, database?: BackendDatabase): string[] {
  const db = database ? [DATABASE_LABELS[database]] : [];
  if (sourceType === 'nodejs-mongoose') {
    return ['Node.js', 'Express', 'Mongoose', ...db];
  }
  if (sourceType === 'nodejs-typeorm') {
    return ['Node.js', 'TypeORM'];
  }
  if (sourceType === 'python-fastapi') {
    return ['Python 3.12', 'FastAPI', 'Pydantic v2', ...db];
  }
  return ['.NET', 'ASP.NET Core', 'EF Core', ...db];
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

