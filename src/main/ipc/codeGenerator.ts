import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { app } from 'electron';
import Handlebars from 'handlebars';
import { SchemaDefinition } from './schemaParser';
import { logGenerate } from '../utils/logger.js';

/**
 * Get the Generator project root directory
 */
function getGeneratorRoot(): string {
  const isDev = process.env.NODE_ENV === 'development' || !app?.isPackaged;
  
  if (isDev) {
    // Start from the current file location (dist-electron/main/ipc/codeGenerator.js)
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
 * Get the templates directory path
 */
function getTemplatesDir(): string {
  const generatorRoot = getGeneratorRoot();
  const isDev = process.env.NODE_ENV === 'development' || !app?.isPackaged;
  
  if (isDev) {
    // In development, use src/main/templates/react
    return join(generatorRoot, 'src', 'main', 'templates', 'react');
  } else {
    // In production, use dist-electron/main/templates/react
    return join(generatorRoot, 'dist-electron', 'main', 'templates', 'react');
  }
}

/**
 * Register Handlebars helpers
 */
function registerHandlebarsHelpers(): void {
  // Register currentDate helper for Turkish locale
  Handlebars.registerHelper('currentDate', () => {
    return new Date().toLocaleString('tr-TR');
  });
}

export interface GenerateCodeResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

/**
 * Generate code from a template
 */
export function generateCode(
  templateName: string,
  schema: SchemaDefinition,
  outputPath: string,
  outputFileName: string
): GenerateCodeResult {
  try {
    // Register helpers
    registerHandlebarsHelpers();

    // Read template file
    const templatesDir = getTemplatesDir();
    const templatePath = join(templatesDir, `${templateName}.hbs`);

    if (!existsSync(templatePath)) {
      return {
        success: false,
        error: `Template file not found: ${templatePath}`,
      };
    }

    const templateContent = readFileSync(templatePath, 'utf-8');

    // Compile template
    const template = Handlebars.compile(templateContent);

    // Render with schema data
    let generatedCode = template(schema);

    // Replace placeholders with actual JSX object literal braces
    // Do this after Handlebars has processed the template
    generatedCode = generatedCode.replace(/OBJ_START/g, '{');
    generatedCode = generatedCode.replace(/OBJ_END/g, '}');

    // Ensure output directory exists
    if (!existsSync(outputPath)) {
      mkdirSync(outputPath, { recursive: true });
    }

    // Write generated file
    const outputFilePath = join(outputPath, outputFileName);
    writeFileSync(outputFilePath, generatedCode, 'utf-8');
    
    // Log successful generation
    logGenerate(outputFileName, outputFilePath);

    return {
      success: true,
      filePath: outputFilePath,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Log error
    logGenerate(outputFileName, outputPath, errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

