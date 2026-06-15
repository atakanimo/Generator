import Handlebars from 'handlebars';
import { emitFeCoreTextJsx, FE_TEXT_VARIANT } from '../../shared/feTypography.js';
import { fieldsHaveSearchable } from './handlebars-schema-predicates.js';

export { fieldsHaveSearchable };

/** @deprecated Use `fieldsHaveSearchable` from `handlebars-schema-predicates.ts`. */
export const fieldsHaveSearchableFrontend = fieldsHaveSearchable;
export function registerFeSharedTemplateHelpers(): void {
  Handlebars.registerHelper('feServiceImportSuffix', (isAdminUser: unknown) =>
    new Handlebars.SafeString(isAdminUser === true ? '.admin' : '')
  );
}

/**
 * Entity list page (`page.hbs`): import line, filter state, table props, capability-gated UI.
 * Keeps `{{#if updatable}}` / `hasSearchableFields` out of the template.
 */
export function registerFeEntityPageHelpers(): void {
  Handlebars.registerHelper('fePageReactImport', () => {
    return new Handlebars.SafeString(`import React, { useEffect, useState, useMemo } from 'react';`);
  });

  Handlebars.registerHelper(
    'fePageEntityServiceImportLine',
    (entityName: unknown, camelEntityName: unknown, fields: unknown, isAdminUser: unknown) => {
      const en = String(entityName ?? '');
      const camel = String(camelEntityName ?? '');
      const queryFrag = fieldsHaveSearchable(fields) ? `, Get${en}Query` : '';
      const sfx = isAdminUser === true ? '.admin' : '';
      return new Handlebars.SafeString(
        `import { I${en}, I${en}Input, type Get${en}ListBody${queryFrag} } from '@/services/${camel}.service${sfx}';`
      );
    }
  );

  Handlebars.registerHelper('fePageSearchableFiltersStateBlock', (entityName: unknown, fields: unknown) => {
    if (!fieldsHaveSearchable(fields)) return '';
    const en = String(entityName ?? '');
    const lines = [
      ``,
      `  const [draftFilters, setDraftFilters] = useState<Get${en}Query>({});`,
      `  const [appliedFilters, setAppliedFilters] = useState<Get${en}Query>({});`,
      ``,
      `  const tableKey = useMemo(() => JSON.stringify(appliedFilters ?? {}), [appliedFilters]);`,
      ``,
      `  const handleSearch = async () => {`,
      `    resetPage();`,
      `    setAppliedFilters(draftFilters);`,
      `  };`,
      ``,
      `  const handleReset = async () => {`,
      `    resetPage();`,
      `    setDraftFilters({});`,
      `    setAppliedFilters({});`,
      `  };`,
      ``,
    ];
    return new Handlebars.SafeString(lines.join('\n'));
  });

  Handlebars.registerHelper('fePageLoadDataMergeAppliedFilters', (fields: unknown) => {
    if (!fieldsHaveSearchable(fields)) return '';
    return new Handlebars.SafeString(`      Object.assign(body, appliedFilters || {});\n`);
  });

  Handlebars.registerHelper('fePageUseEffectDepsAppliedFilters', (fields: unknown) => {
    if (!fieldsHaveSearchable(fields)) return '';
    return new Handlebars.SafeString(', appliedFilters');
  });

  Handlebars.registerHelper('fePageBuildListBodyMergeAppliedFilters', (fields: unknown) => {
    if (!fieldsHaveSearchable(fields)) return '';
    return new Handlebars.SafeString(`    Object.assign(body, appliedFilters || {});\n`);
  });

  Handlebars.registerHelper('fePageTableSearchFilterProps', (fields: unknown) => {
    if (!fieldsHaveSearchable(fields)) return '';
    return new Handlebars.SafeString(
      `          filters={draftFilters}\n          onFilterChange={setDraftFilters}\n          onSearch={handleSearch}\n          onReset={handleReset}\n          tableKey={tableKey}\n`
    );
  });

  Handlebars.registerHelper('fePageTableEditHandlerProp', (updatable: unknown) =>
    new Handlebars.SafeString(
      updatable === true ? `          onEdit={handleEdit}\n` : `          onEdit={undefined}\n`
    )
  );

  Handlebars.registerHelper('fePageTableDeleteHandlerProp', (deletable: unknown) =>
    new Handlebars.SafeString(
      deletable === true ? `          onDelete={handleDelete}\n` : `          onDelete={undefined}\n`
    )
  );

  Handlebars.registerHelper('fePageToolbarCreateButton', (updatable: unknown, entityName: unknown) => {
    if (updatable !== true) return '';
    const en = String(entityName ?? '');
    return new Handlebars.SafeString(
      `        <Button variant='contained' color='primary' onClick={handleCreate}>\n          Add New ${en}\n        </Button>\n`
    );
  });

  Handlebars.registerHelper('fePageEntityModalMount', (entityName: unknown, updatable: unknown) => {
    if (updatable !== true) return '';
    const en = String(entityName ?? '');
    const lines = [
      `      <${en}Modal`,
      `        open={modalOpen}`,
      `        onClose={() => setModalOpen(false)}`,
      `        onSave={handleSave}`,
      `        item={selectedItem}`,
      `        mode={modalMode}`,
      `      />`,
      ``,
    ];
    return new Handlebars.SafeString(lines.join('\n'));
  });

  Handlebars.registerHelper('fePageDeleteConfirmDialog', (entityName: unknown, deletable: unknown) => {
    if (deletable !== true) return '';
    const en = String(entityName ?? '');
    const lines = [
      `      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>`,
      `        <DialogTitle>Confirm Delete</DialogTitle>`,
      `        <DialogContent>`,
      `          ${emitFeCoreTextJsx({
        variant: FE_TEXT_VARIANT.deleteDialogBody,
        children: `Are you sure you want to delete this ${en}? This action cannot be undone.`,
      })}`,
      `        </DialogContent>`,
      `        <DialogActions>`,
      `          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>`,
      `          <Button onClick={handleConfirmDelete} color='error' variant='contained'>`,
      `            Delete`,
      `          </Button>`,
      `        </DialogActions>`,
      `      </Dialog>`,
      ``,
    ];
    return new Handlebars.SafeString(lines.join('\n'));
  });
}
