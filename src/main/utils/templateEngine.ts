/**
 * Template Engine Wrapper
 * Centralized template compilation, caching, and rendering
 */

import Handlebars, { HelperOptions } from 'handlebars';
import { safeReadFile } from './fileUtils.js';
import { getTemplatesDir, registerHandlebarsHelpers, TemplateSet } from './templateHelpers.js';
import { log } from './logger.js';

// Template cache
const templateCache = new Map<string, HandlebarsTemplateDelegate>();

// Track if helpers are registered
let helpersRegistered = false;

/**
 * Initialize template engine (register helpers)
 */
export function initializeTemplateEngine(): void {
  if (!helpersRegistered) {
    registerHandlebarsHelpers();
    helpersRegistered = true;
    log('Handlebars helpers registered', 'info');
  }
}

/**
 * Get template cache key
 */
function getTemplateCacheKey(templateType: string, templateName: string): string {
  return `${templateType}:${templateName}`;
}

/**
 * Load and compile a template with caching
 */
export function compileTemplate(
  templateName: string,
  templateType: TemplateSet = 'backend-express-mongoose'
): { success: boolean; template?: HandlebarsTemplateDelegate; error?: string } {
  // Ensure helpers are registered
  initializeTemplateEngine();

  const cacheKey = getTemplateCacheKey(templateType, templateName);

  // Check cache first
  if (templateCache.has(cacheKey)) {
    log(`Template loaded from cache: ${cacheKey}`, 'debug');
    return {
      success: true,
      template: templateCache.get(cacheKey)
    };
  }

  try {
    // Get template directory
    const templatesDir = getTemplatesDir(templateType);
    const templatePath = `${templatesDir}/${templateName}.hbs`;

    // Read template file
    const readResult = safeReadFile(templatePath);
    if (!readResult.success) {
      return {
        success: false,
        error: `Template not found: ${templatePath}`
      };
    }

    // Compile template
    // Templates generate source code, not HTML: escaping would turn `Record<…>` into `Record&lt;…&gt;` (plan 5 R1).
    const template = Handlebars.compile(readResult.content!, { noEscape: true });

    // Cache compiled template
    templateCache.set(cacheKey, template);
    log(`Template compiled and cached: ${cacheKey}`, 'info');

    return {
      success: true,
      template
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`Failed to compile template ${templateName}: ${errorMessage}`, 'error');
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Render a template with data
 */
export function renderTemplate(
  templateName: string,
  data: any,
  templateType: TemplateSet = 'backend-express-mongoose'
): { success: boolean; content?: string; error?: string } {
  try {
    // Compile template (will use cache if available)
    const compileResult = compileTemplate(templateName, templateType);

    if (!compileResult.success || !compileResult.template) {
      return {
        success: false,
        error: compileResult.error
      };
    }

    // Render template with data
    let content = compileResult.template(data);

    // Post-processing: Replace placeholders
    content = postProcessTemplate(content);

    log(`Template rendered: ${templateName}`, 'info');
    return {
      success: true,
      content
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`Failed to render template ${templateName}: ${errorMessage}`, 'error');
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Post-process template content (replace special placeholders)
 */
function postProcessTemplate(content: string): string {
  // Replace OBJ_START and OBJ_END with actual braces
  // These are used to avoid Handlebars parsing conflicts in JSX
  return content
    .replace(/OBJ_START/g, '{')
    .replace(/OBJ_END/g, '}');
}

/**
 * Clear template cache (useful for development/hot reload)
 */
export function clearTemplateCache(): void {
  templateCache.clear();
  log('Template cache cleared', 'info');
}

/**
 * Get template cache size
 */
export function getTemplateCacheSize(): number {
  return templateCache.size;
}

/**
 * Register a custom Handlebars helper
 */
export function registerHelper(name: string, fn: Handlebars.HelperDelegate): void {
  Handlebars.registerHelper(name, fn);
  log(`Custom helper registered: ${name}`, 'info');
}

/**
 * Compile and render in one step (convenience method)
 */
export function compileAndRender(
  templateName: string,
  data: any,
  templateType: TemplateSet = 'backend-express-mongoose'
): { success: boolean; content?: string; error?: string } {
  return renderTemplate(templateName, data, templateType);
}

/**
 * Batch render multiple templates with same data
 */
export function batchRender(
  templates: Array<{ name: string; type: TemplateSet }>,
  data: any
): Array<{ name: string; success: boolean; content?: string; error?: string }> {
  return templates.map(({ name, type }) => {
    const result = renderTemplate(name, data, type);
    return {
      name,
      ...result
    };
  });
}

