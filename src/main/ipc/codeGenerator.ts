/**
 * Code Generator (Refactored)
 * Simple template-based code generation utility
 */

import { renderTemplate } from '../utils/templateEngine.js';
import { safeWriteFile } from '../utils/fileUtils.js';
import { handleError, ErrorCode } from '../utils/errorHandler.js';
import { logGenerate } from '../utils/logger.js';
import { SchemaDefinition } from './schemaParser.js';

export interface GenerateCodeResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

/**
 * Generate code from a template
 * Simplified wrapper around template engine and file utilities
 */
export function generateCode(templateName: string, schema: SchemaDefinition, outputPath: string, outputFileName: string): GenerateCodeResult {
  try {
    // Render template
    const renderResult = renderTemplate(templateName, schema, 'react');

    if (!renderResult.success || !renderResult.content) {
      return {
        success: false,
        error: renderResult.error || 'Template rendering failed'
      };
    }

    // Write file
    const outputFilePath = `${outputPath}/${outputFileName}`;
    const writeResult = safeWriteFile(outputFilePath, renderResult.content, {
      ensureDirectory: true,
      createBackup: false
    });

    if (!writeResult.success) {
      return {
        success: false,
        error: writeResult.error || 'File write failed'
      };
    }

    // Log success
    logGenerate(outputFileName, outputFilePath);

    return {
      success: true,
      filePath: outputFilePath
    };
  } catch (error) {
    const appError = handleError(error as Error, ErrorCode.GENERATION_FAILED, { templateName, outputFileName });

    logGenerate(outputFileName, outputPath, appError.message);

    return {
      success: false,
      error: appError.userMessage
    };
  }
}
