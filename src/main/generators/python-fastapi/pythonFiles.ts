/**
 * File writing for the Python + FastAPI generator (K7): G files (header-owned, rewritten), K files and assets (created
 * once, never overwritten). Shares the create-only / listing helpers with the .NET generator.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { getGeneratorAssetsDir } from '../../utils/templateHelpers.js';
import { WrittenFile, listFiles, writeOnce } from '../dotnet-efcore/dotnetFiles.js';
import { PYTHON_GENERATED_HEADER, PY_APP_TOKEN, PY_DIST_TOKEN, pythonDistName } from './pythonLayout.js';

export type { WrittenFile } from '../dotnet-efcore/dotnetFiles.js';

export function pythonAssetsDir(): string {
  return getGeneratorAssetsDir('python-fastapi');
}

/** Asset / skeleton files, without interpreter caches. */
function sourceFiles(dir: string): string[] {
  return listFiles(dir).filter((file) => !/[\\/]__pycache__[\\/]|\.pyc$/.test(file));
}

export function applyPythonTokens(text: string, pkg: string): string {
  return text.split(PY_DIST_TOKEN).join(pythonDistName(pkg)).split(PY_APP_TOKEN).join(pkg);
}

/** Skeleton (K): token-bearing paths and contents, create-only. */
export function copySkeletonTree(sourceDir: string, targetDir: string, pkg: string): WrittenFile[] {
  return sourceFiles(sourceDir).map((file) =>
    writeOnce(join(targetDir, applyPythonTokens(relative(sourceDir, file), pkg)), applyPythonTokens(readFileSync(file, 'utf8'), pkg))
  );
}

/** Assets: copied byte for byte (package-agnostic, relative imports), create-only. */
export function copyVerbatimTree(sourceDir: string, targetDir: string): WrittenFile[] {
  return sourceFiles(sourceDir).map((file) => writeOnce(join(targetDir, relative(sourceDir, file)), readFileSync(file, 'utf8')));
}

/** G file: rewritten when content changes; a file without the header is user-owned and left alone. */
export function writePythonGenerated(path: string, content: string): WrittenFile {
  if (!content.startsWith(PYTHON_GENERATED_HEADER)) {
    throw new Error(`Generated Python file must start with the Generator header: ${path}`);
  }
  if (existsSync(path)) {
    const current = readFileSync(path, 'utf8');
    if (!current.startsWith(PYTHON_GENERATED_HEADER)) return { path, action: 'skipped-user-owned' };
    if (current === content) return { path, action: 'unchanged' };
  }
  const existed = existsSync(path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
  return { path, action: existed ? 'updated' : 'created' };
}
