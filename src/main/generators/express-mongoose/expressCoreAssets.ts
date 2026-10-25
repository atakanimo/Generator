/**
 * Express + Mongoose core assets (`src/generator-assets/express-mongoose/**` → host `src/core/**`): created when
 * missing, never overwritten. Called by every generate (`BackendGenerator`) and by the new-host bootstrap (PY9).
 */
import { join, relative } from 'path';
import { safePathExists, safeReadFile, safeWriteFile } from '../../utils/fileUtils.js';
import { log } from '../../utils/logger.js';
import { getGeneratorAssetsDir } from '../../utils/templateHelpers.js';
import { missingHostExports } from '../../utils/coreAssetImports.js';

interface CoreBootstrapFile {
  sourceRelativePath: string;
  targetRelativePath: string;
}

export interface ExpressCoreAssetWrite {
  path: string;
  action: 'created' | 'exists' | 'skipped-missing-exports';
}

/** `sourceRelativePath` is written from the Generator root; resolved via `getGeneratorAssetsDir`. */
const EXPRESS_ASSETS_REL = 'src/generator-assets/express-mongoose';

/** Bootstrap list (import-closed, plan 5 P2.1). New asset = add here, close its imports. */
export const EXPRESS_CORE_BOOTSTRAP_FILES: readonly CoreBootstrapFile[] = [
  {
    sourceRelativePath: 'src/generator-assets/express-mongoose/errors/error-codes.ts',
    targetRelativePath: 'src/core/errors/error-codes.ts'
  },
  {
    sourceRelativePath: 'src/generator-assets/express-mongoose/errors/error.helper.ts',
    targetRelativePath: 'src/core/errors/error.helper.ts'
  },
  {
    sourceRelativePath: 'src/generator-assets/express-mongoose/logging/logger.ts',
    targetRelativePath: 'src/core/logging/logger.ts'
  },
  // logger.ts imports (bootstrap must be import-closed, plan 5 P2.1)
  {
    sourceRelativePath: 'src/generator-assets/express-mongoose/logging/job-log-context.ts',
    targetRelativePath: 'src/core/logging/job-log-context.ts'
  },
  {
    sourceRelativePath: 'src/generator-assets/express-mongoose/logging/pino-stdout-file-tee.ts',
    targetRelativePath: 'src/core/logging/pino-stdout-file-tee.ts'
  },
  {
    sourceRelativePath: 'src/generator-assets/express-mongoose/logging/daily-log-file-path.ts',
    targetRelativePath: 'src/core/logging/daily-log-file-path.ts'
  },
  {
    sourceRelativePath: 'src/generator-assets/express-mongoose/pagination/pagination.helper.ts',
    targetRelativePath: 'src/core/pagination/pagination.helper.ts'
  },
  {
    sourceRelativePath: 'src/generator-assets/express-mongoose/filters/filter-query.helper.ts',
    targetRelativePath: 'src/core/filters/filter-query.helper.ts'
  },
  {
    sourceRelativePath: 'src/generator-assets/express-mongoose/response/response.helper.ts',
    targetRelativePath: 'src/core/response/response.helper.ts'
  },
  {
    sourceRelativePath: 'src/generator-assets/express-mongoose/response/wire.ts',
    targetRelativePath: 'src/core/response/wire.ts'
  },
  {
    sourceRelativePath: 'src/generator-assets/express-mongoose/schema/list-pagination.schema.ts',
    targetRelativePath: 'src/core/schema/list-pagination.schema.ts'
  },
  {
    sourceRelativePath: 'src/generator-assets/express-mongoose/types/api-contract.ts',
    targetRelativePath: 'src/core/types/api-contract.ts'
  },
  {
    sourceRelativePath: 'src/generator-assets/express-mongoose/services/service-hooks.ts',
    targetRelativePath: 'src/core/services/service-hooks.ts'
  },
  {
    sourceRelativePath: 'src/generator-assets/express-mongoose/services/base-crud.service.ts',
    targetRelativePath: 'src/core/services/base-crud.service.ts'
  },
  {
    sourceRelativePath: 'src/generator-assets/express-mongoose/services/crud-projection.ts',
    targetRelativePath: 'src/core/services/crud-projection.ts'
  },
  {
    sourceRelativePath: 'src/generator-assets/express-mongoose/services/crud-scope.ts',
    targetRelativePath: 'src/core/services/crud-scope.ts'
  },
  {
    sourceRelativePath: 'src/generator-assets/express-mongoose/services/merge-patch.ts',
    targetRelativePath: 'src/core/services/merge-patch.ts'
  }
];

function logWith(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void {
  log(`${message}${context ? ` | ${JSON.stringify(context)}` : ''}`, level);
}
const logInfo = (message: string, context?: Record<string, unknown>) => logWith('info', message, context);
const logWarn = (message: string, context?: Record<string, unknown>) => logWith('warn', message, context);
const logError = (message: string, context?: Record<string, unknown>) => logWith('error', message, context);

export function ensureExpressCoreAssets(projectRoot: string): ExpressCoreAssetWrite[] {
  const expressAssets = getGeneratorAssetsDir('express-mongoose');
  const coreBootstrapFiles = EXPRESS_CORE_BOOTSTRAP_FILES;
  const written: ExpressCoreAssetWrite[] = [];

  logInfo('Core bootstrap check started', {
    step: 'core-bootstrap-check',
    fileCount: coreBootstrapFiles.length
  });

  for (const bootstrapFile of coreBootstrapFiles) {
    const sourcePath = join(expressAssets, relative(EXPRESS_ASSETS_REL, bootstrapFile.sourceRelativePath));
    const targetPath = join(projectRoot, bootstrapFile.targetRelativePath);

    if (!safePathExists(sourcePath)) {
      logError('Core bootstrap source missing', {
        step: 'core-bootstrap-check',
        file: sourcePath,
        reason: 'source-not-found'
      });
      throw new Error(`Core bootstrap source missing: ${sourcePath}`);
    }

    if (safePathExists(targetPath)) {
      const canonicalRead = safeReadFile(sourcePath);
      const targetRead = safeReadFile(targetPath);
      if (
        canonicalRead.success &&
        targetRead.success &&
        canonicalRead.content !== undefined &&
        targetRead.content !== undefined &&
        canonicalRead.content !== targetRead.content
      ) {
        logWarn('Core helper differs from canonical asset (kept existing file)', {
          step: 'core-bootstrap-check',
          file: targetPath,
          reason: 'canonical-deviation-detected',
          action: 'skip-existing'
        });
      }

      logInfo('Core bootstrap file skipped (already exists)', {
        step: 'core-bootstrap-check',
        file: targetPath,
        action: 'skip'
      });
      written.push({ path: targetPath, action: 'exists' });
      continue;
    }

    const sourceRead = safeReadFile(sourcePath);
    if (!sourceRead.success || sourceRead.content === undefined) {
      logError('Core bootstrap read failed', {
        step: 'core-bootstrap-create',
        file: sourcePath,
        reason: sourceRead.error ?? 'read-failed'
      });
      throw new Error(`Failed to read core bootstrap source: ${sourcePath}`);
    }

    // An existing (kept) sibling may be an older copy without a name this asset imports: skip, do not break the host.
    const missing = missingHostExports(sourceRead.content, targetPath);
    if (missing.length > 0) {
      logWarn('Core bootstrap file skipped (host sibling lacks imported exports)', {
        step: 'core-bootstrap-create',
        file: targetPath,
        reason: 'missing-host-exports',
        missing
      });
      written.push({ path: targetPath, action: 'skipped-missing-exports' });
      continue;
    }

    const writeResult = safeWriteFile(targetPath, sourceRead.content, {
      ensureDirectory: true,
      createBackup: false
    });

    if (!writeResult.success) {
      logError('Core bootstrap file creation failed', {
        step: 'core-bootstrap-create',
        file: targetPath,
        reason: writeResult.error ?? 'write-failed'
      });
      throw new Error(`Failed to create core bootstrap file: ${targetPath}`);
    }

    logInfo('Core bootstrap file created', {
      step: 'core-bootstrap-create',
      file: targetPath,
      action: 'create'
    });
    written.push({ path: targetPath, action: 'created' });
  }
  return written;
}
