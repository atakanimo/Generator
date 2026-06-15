import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { log } from './logger.js';

/**
 * Inject a new route into routes.ts file
 * @param projectPath - Root path of the target project
 * @param entityName - Entity name (e.g., "Customer")
 * @param camelEntityName - Camel case entity name (e.g., "customer")
 * @returns Success status and message
 */
export function injectRoute(projectPath: string, entityName: string, camelEntityName: string): { success: boolean; message: string } {
  try {
    const routesFilePath = join(projectPath, 'src', 'routes', 'routes.ts');

    if (!existsSync(routesFilePath)) {
      log(`Routes file not found: ${routesFilePath}`, 'error');
      return {
        success: false,
        message: `Routes file not found: ${routesFilePath}`
      };
    }

    let content = readFileSync(routesFilePath, 'utf-8');

    // Step 1: Add import for the entity page if not exists (module-centric UI output)
    const entityImport = `import ${entityName} from '@/modules/${camelEntityName}/pages/${entityName}Page';`;
    const circleImport = `import { Circle } from '@mui/icons-material';`;

    // Check if entity import already exists
    if (!content.includes(entityImport)) {
      // Find the last import statement and add after it
      const importRegex = /(import\s+.*?from\s+['"].*?['"];?\s*\n)/g;
      const imports = content.match(importRegex);

      if (imports && imports.length > 0) {
        const lastImport = imports[imports.length - 1];
        const lastImportIndex = content.lastIndexOf(lastImport);
        const insertPosition = lastImportIndex + lastImport.length;

        // Add entity import
        content = content.slice(0, insertPosition) + entityImport + '\n' + content.slice(insertPosition);
      } else {
        // No imports found, add at the beginning
        content = entityImport + '\n' + content;
      }
    }

    // Check if Circle import exists, if not add it
    const hasCircleImport = /import\s+\{[^}]*\bCircle\b[^}]*\}\s+from\s+['"]@mui\/icons-material['"];?/.test(content);

    if (!hasCircleImport) {
      // Check if there's an existing MUI icons import
      const muiIconImport = content.match(/import\s+\{([^}]*)\}\s+from\s+['"]@mui\/icons-material['"];?/);

      if (muiIconImport) {
        // Add Circle to existing import
        const iconList = muiIconImport[1].trim();
        const newIconList = iconList ? `${iconList}, Circle` : 'Circle';
        content = content.replace(muiIconImport[0], `import { ${newIconList} } from '@mui/icons-material';`);
      } else {
        // Add new Circle import
        const importRegex = /(import\s+.*?from\s+['"].*?['"];?\s*\n)/g;
        const imports = content.match(importRegex);

        if (imports && imports.length > 0) {
          const lastImport = imports[imports.length - 1];
          const lastImportIndex = content.lastIndexOf(lastImport);
          const insertPosition = lastImportIndex + lastImport.length;
          content = content.slice(0, insertPosition) + circleImport + '\n' + content.slice(insertPosition);
        }
      }
    }

    // Step 2: Find ProtectedRoutes array and inject new route
    // Try multiple patterns to find the routes array (using generic type matcher)
    let protectedRoutesMatch = content.match(/(export\s+const\s+ProtectedRoutes\s*:\s*\w+\[\]\s*=\s*\[)([\s\S]*?)(\];)/);

    if (!protectedRoutesMatch) {
      // Try without export
      protectedRoutesMatch = content.match(/(const\s+ProtectedRoutes\s*:\s*\w+\[\]\s*=\s*\[)([\s\S]*?)(\];)/);
    }

    if (!protectedRoutesMatch) {
      // Try without type annotation
      protectedRoutesMatch = content.match(/(export\s+const\s+ProtectedRoutes\s*=\s*\[)([\s\S]*?)(\];)/);
    }

    if (!protectedRoutesMatch) {
      // Try const without export or type
      protectedRoutesMatch = content.match(/(const\s+ProtectedRoutes\s*=\s*\[)([\s\S]*?)(\];)/);
    }

    if (!protectedRoutesMatch) {
      log('ProtectedRoutes array not found in routes.ts. Please check the file format.', 'error');
      return {
        success: false,
        message: 'ProtectedRoutes array not found in routes.ts. Please check the file format.'
      };
    }

    // Check if route already exists
    const routeExists = new RegExp(`path:\\s*['"]/${camelEntityName}['"]`, 'g').test(content);
    if (routeExists) {
      return {
        success: false,
        message: `Route for ${camelEntityName} already exists`
      };
    }

    // Find the last id in the array
    const idRegex = /id:\s*(\d+)/g;
    const idMatches = Array.from(content.matchAll(idRegex));
    let nextId = 1;

    if (idMatches.length > 0) {
      const lastIdMatch = idMatches[idMatches.length - 1];
      nextId = parseInt(lastIdMatch[1], 10) + 1;
    }

    // Get the routes array content
    const arrayStartIndex = protectedRoutesMatch.index! + protectedRoutesMatch[1].length;
    let routesContent = protectedRoutesMatch[2];

    // Check if the last route has a trailing comma
    const trimmedContent = routesContent.trimEnd();
    const needsComma = trimmedContent.length > 0 && !trimmedContent.endsWith(',');

    if (needsComma) {
      // Add comma to the last route
      routesContent = trimmedContent + ',\n';
    }

    // Create new route object (no trailing comma, will be added by next insertion)
    const newRoute = `  {\n    id: ${nextId},\n    text: '${camelEntityName}',\n    path: '/${camelEntityName}',\n    element: ${entityName},\n    icon: Circle,\n    isProtected: true\n  }\n`;

    // Update content with modified routes
    const arrayEndIndex = arrayStartIndex + protectedRoutesMatch[2].length;
    content = content.slice(0, arrayStartIndex) + routesContent + newRoute + content.slice(arrayEndIndex);

    // Write back to file
    writeFileSync(routesFilePath, content, 'utf-8');
    log(`Route injected successfully for: ${entityName} with id: ${nextId}`);

    return {
      success: true,
      message: `Route injected successfully with id: ${nextId}`
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error during route injection'
    };
  }
}

/**
 * Inject a new reducer into store/index.ts file
 * @param projectPath - Root path of the target project
 * @param entityName - Entity name (e.g., "Customer")
 * @param camelEntityName - Camel case entity name (e.g., "customer")
 * @returns Success status and message
 */
export function injectReducer(projectPath: string, _entityName: string, camelEntityName: string): { success: boolean; message: string } {
  try {
    const storeIndexPath = join(projectPath, 'src', 'store', 'index.ts');

    if (!existsSync(storeIndexPath)) {
      return {
        success: false,
        message: `Store index file not found: ${storeIndexPath}`
      };
    }

    let content = readFileSync(storeIndexPath, 'utf-8');

    // Step 1: Add import for the slice if not exists
    const sliceImport = `import ${camelEntityName}Reducer from './slices/${camelEntityName}.slice';`;

    // Check if import already exists
    if (!content.includes(sliceImport)) {
      // Find the last import statement and add after it
      const importRegex = /(import\s+.*?from\s+['"].*?['"];?\s*\n)/g;
      const imports = content.match(importRegex);

      if (imports && imports.length > 0) {
        const lastImport = imports[imports.length - 1];
        const lastImportIndex = content.lastIndexOf(lastImport);
        const insertPosition = lastImportIndex + lastImport.length;

        content = content.slice(0, insertPosition) + sliceImport + '\n' + content.slice(insertPosition);
      } else {
        // No imports found, add at the beginning
        content = sliceImport + '\n' + content;
      }
    }

    // Check if reducer already exists
    const reducerExists = new RegExp(`${camelEntityName}:\\s*${camelEntityName}Reducer`, 'g').test(content);
    if (reducerExists) {
      return {
        success: false,
        message: `Reducer for ${camelEntityName} already exists`
      };
    }

    // Step 2: Find reducer object and inject new reducer
    // Try pattern 1: combineReducers({ ... })
    const combineReducersRegex = /(combineReducers\s*\(\s*\{)([\s\S]*?)(\}\s*\))/;
    const combineMatch = content.match(combineReducersRegex);

    if (combineMatch) {
      let reducerContent = combineMatch[2];

      // Check if the last non-empty line has a comma, if not add one
      const lines = reducerContent.split('\n');
      const nonEmptyLines = lines.filter(line => line.trim().length > 0);
      if (nonEmptyLines.length > 0) {
        const lastLine = nonEmptyLines[nonEmptyLines.length - 1];
        const trimmedLastLine = lastLine.trim();
        if (!trimmedLastLine.endsWith(',')) {
          // Find the last occurrence of this line and add comma
          const lastLineIndex = reducerContent.lastIndexOf(lastLine);
          if (lastLineIndex !== -1) {
            reducerContent = reducerContent.slice(0, lastLineIndex) + lastLine + ',' + reducerContent.slice(lastLineIndex + lastLine.length);
          }
        }
      }

      const newReducer = `    ${camelEntityName}: ${camelEntityName}Reducer,\n`;

      // Insert before the closing }
      const insertPosition = combineMatch.index! + combineMatch[1].length + reducerContent.length;
      content = content.slice(0, insertPosition) + newReducer + content.slice(insertPosition);
    } else {
      // Try pattern 2: rootReducer = { ... } or similar exported const
      const rootReducerRegex = /(export\s+const\s+\w+Reducer\s*=\s*\{)([\s\S]*?)(\}\s*;)/;
      const rootReducerMatch = content.match(rootReducerRegex);

      if (rootReducerMatch) {
        let reducerContent = rootReducerMatch[2];
        const reducerStartIndex = rootReducerMatch.index! + rootReducerMatch[1].length;
        const reducerEndIndex = rootReducerMatch.index! + rootReducerMatch[0].length - rootReducerMatch[3].length;

        // Check if the last non-empty line has a comma, if not add one
        const lines = reducerContent.split('\n');
        const nonEmptyLines = lines.filter(line => line.trim().length > 0);
        if (nonEmptyLines.length > 0) {
          const lastLine = nonEmptyLines[nonEmptyLines.length - 1];
          const trimmedLastLine = lastLine.trim();
          if (!trimmedLastLine.endsWith(',')) {
            // Find the last occurrence of this line and add comma after trimmed content
            const lastLineIndex = reducerContent.lastIndexOf(lastLine);
            if (lastLineIndex !== -1) {
              // Get indentation from the line
              const indentMatch = lastLine.match(/^(\s*)/);
              const indent = indentMatch ? indentMatch[1] : '';
              // Replace with trimmed line + comma + newline
              const updatedLine = indent + trimmedLastLine + ',\n';
              reducerContent = reducerContent.slice(0, lastLineIndex) + updatedLine + reducerContent.slice(lastLineIndex + lastLine.length);
              // Update content with the modified reducerContent
              content = content.slice(0, reducerStartIndex) + reducerContent + content.slice(reducerEndIndex);
            }
          }
        }

        // Determine indentation from the last line (use updated reducerContent)
        const updatedLines = reducerContent.split('\n');
        const updatedNonEmptyLines = updatedLines.filter(line => line.trim().length > 0);
        const lastLineWithIndent = updatedNonEmptyLines[updatedNonEmptyLines.length - 1];
        const indentMatch = lastLineWithIndent.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] : '  ';

        const newReducer = `\n${indent}${camelEntityName}: ${camelEntityName}Reducer,`;

        // Insert before the closing } - find the position in updated content
        const updatedReducerEndIndex = content.indexOf('};', reducerStartIndex);
        if (updatedReducerEndIndex !== -1) {
          content = content.slice(0, updatedReducerEndIndex) + newReducer + content.slice(updatedReducerEndIndex);
        }
      } else {
        // Try pattern 3: reducer: { ... } with proper brace matching (configureStore inline)
        const reducerStartMatch = content.match(/(reducer\s*:\s*\{)/);

        if (reducerStartMatch) {
          // Find the matching closing brace by counting braces
          const startIndex = reducerStartMatch.index! + reducerStartMatch[0].length;
          let braceCount = 1;
          let endIndex = startIndex;

          for (let i = startIndex; i < content.length && braceCount > 0; i++) {
            if (content[i] === '{') braceCount++;
            if (content[i] === '}') braceCount--;
            if (braceCount === 0) {
              endIndex = i;
              break;
            }
          }

          let reducerContent = content.slice(startIndex, endIndex);

          // Check if the last non-empty line has a comma, if not add one
          const lines = reducerContent.split('\n');
          const nonEmptyLines = lines.filter(line => line.trim().length > 0);
          if (nonEmptyLines.length > 0) {
            const lastLine = nonEmptyLines[nonEmptyLines.length - 1];
            const trimmedLastLine = lastLine.trim();
            if (!trimmedLastLine.endsWith(',')) {
              // Find the last occurrence of this line in reducerContent and add comma
              const lastLineIndex = reducerContent.lastIndexOf(lastLine);
              if (lastLineIndex !== -1) {
                reducerContent = reducerContent.slice(0, lastLineIndex) + lastLine + ',' + reducerContent.slice(lastLineIndex + lastLine.length);
                // Update content with the modified reducerContent
                content = content.slice(0, startIndex) + reducerContent + content.slice(endIndex);
              }
            }
          }

          // Determine indentation from the last line (which already has proper indent)
          const lastLineWithIndent = nonEmptyLines[nonEmptyLines.length - 1];
          const indentMatch = lastLineWithIndent.match(/^(\s*)/);
          const indent = indentMatch ? indentMatch[1] : '    ';

          const newReducer = `\n${indent}${camelEntityName}: ${camelEntityName}Reducer,`;

          // Insert before the closing } - find the position of closing brace after removing trailing whitespace
          const trimmedReducerContent = reducerContent.trimEnd();
          const insertPosition = startIndex + trimmedReducerContent.length;
          content = content.slice(0, insertPosition) + newReducer + content.slice(insertPosition);
        } else {
          return {
            success: false,
            message: 'Could not find combineReducers, rootReducer object, or reducer object in store/index.ts'
          };
        }
      }
    }

    // Write back to file
    writeFileSync(storeIndexPath, content, 'utf-8');

    return {
      success: true,
      message: 'Reducer injected successfully'
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error during reducer injection'
    };
  }
}
