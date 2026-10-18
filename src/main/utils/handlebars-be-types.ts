import Handlebars from 'handlebars';
import {
  emitBackendEntitySyntheticPrimaryKeyLine,
  emitBackendFilterPropLines,
  emitBackendInputPropLines,
  emitBackendInterfacePropLine,
  needsMongooseImportForTypes,
  type TemplateField,
} from '../../shared/schemaFieldTypes.js';

/** BE `types.hbs` Handlebars kayıtları — mantık `shared/schemaFieldTypes.ts`. */
export function registerBeTypesHelpers(): void {
  Handlebars.registerHelper('beTypesMongooseImportLine', (sourceType: unknown, fields: unknown) => {
    if (!needsMongooseImportForTypes(sourceType, fields)) return '';
    return new Handlebars.SafeString(`import mongoose from 'mongoose';\n`);
  });

  Handlebars.registerHelper('beTypesEntityPropLine', (field: unknown) => {
    const line = emitBackendInterfacePropLine(field as TemplateField);
    return line ? new Handlebars.SafeString(line) : '';
  });

  Handlebars.registerHelper('beTypesEntitySyntheticPrimaryKeyLine', (sourceType: unknown, fields: unknown) => {
    const line = emitBackendEntitySyntheticPrimaryKeyLine(sourceType, fields);
    return line ? new Handlebars.SafeString(line) : '';
  });

  Handlebars.registerHelper('beTypesFilterPropLines', (fields: unknown) => {
    const lines = emitBackendFilterPropLines(fields);
    return lines ? new Handlebars.SafeString(lines) : '';
  });

  Handlebars.registerHelper(
    'beTypesInputPropLines',
    (fields: unknown, sourceType: unknown, isProtectedRoute: unknown) => {
      const lines = emitBackendInputPropLines(fields, sourceType, isProtectedRoute);
      return lines ? new Handlebars.SafeString(lines) : '';
    }
  );
}

// Re-export for tests / callers that imported from here previously.
export {
  emitBackendEntitySyntheticPrimaryKeyLine as emitBeTypesEntitySyntheticPrimaryKeyLine,
  emitBackendInputPropLines as emitBeTypesInputPropLines,
  fieldsIncludePrimaryKey,
  needsMongooseImportForTypes as beTypesNeedsMongooseImport,
  resolvePrimaryKeyFieldName,
} from '../../shared/schemaFieldTypes.js';
