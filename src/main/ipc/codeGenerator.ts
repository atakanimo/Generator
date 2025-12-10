import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import Handlebars from 'handlebars';
import { SchemaDefinition } from './schemaParser';
import { getTemplatesDir, registerHandlebarsHelpers } from '../utils/templateHelpers.js';
import { logGenerate } from '../utils/logger.js';

export interface GenerateCodeResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

/**
 * Generate code from a template
 */
export function generateCode(templateName: string, schema: SchemaDefinition, outputPath: string, outputFileName: string): GenerateCodeResult {
  try {
    // Register helpers
    registerHandlebarsHelpers();

    // Read template file
    const templatesDir = getTemplatesDir('react');
    const templatePath = join(templatesDir, `${templateName}.hbs`);

    if (!existsSync(templatePath)) {
      return {
        success: false,
        error: `Template file not found: ${templatePath}`
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
      filePath: outputFilePath
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Log error
    logGenerate(outputFileName, outputPath, errorMessage);
    return {
      success: false,
      error: errorMessage
    };
  }
}
