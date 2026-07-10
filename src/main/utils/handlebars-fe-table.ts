import Handlebars from 'handlebars';
import { camelCase, pluralize as pluralizeName } from './namingUtils.js';
import {
  fieldsHaveSearchable,
  hasSearchableRelationFields,
  uppercaseFirstStr,
} from './handlebars-schema-predicates.js';
import { resolvePrimaryKeyMemberAccess } from '../../shared/schemaFieldTypes.js';
import { emitFeFormatScalarOrObjectStringExpr } from '../../shared/feTypography.js';
import {
  emitFeTableGridColumnSizingProps,
  emitFeTableRowCellJsx,
  feTableHasIdCopyCellFields,
  isFeTableIdFieldName,
} from '../../shared/feTableCell.js';

type FeFieldLite = { type?: string };

function relationPropertySubFieldNames(f: {
  relationPropertyObjectFields?: Array<{ name?: string }>;
}): string[] | undefined {
  const subs = f.relationPropertyObjectFields;
  if (!Array.isArray(subs)) return undefined;
  const names = subs.map(s => String(s?.name || '').trim()).filter(Boolean);
  return names.length > 0 ? names : undefined;
}

/** Same output as `feTableFilterFieldAttrs` Handlebars helper (without SafeString). */
export function emitFeTableFilterFieldAttrs(field: unknown): string {
  const t = String((field as FeFieldLite)?.type || '').toLowerCase();
  if (t === 'number') return 'type="number"';
  if (t === 'date') {
    return 'type="date"\n              InputLabelProps={{\n                shrink: true,\n              }}';
  }
  return '';
}

export function feTableNeedsAvatarFields(fields: unknown): boolean {
  if (!Array.isArray(fields)) return false;
  return (fields as { showInTable?: boolean; uiComponent?: string }[]).some(
    f => f && f.showInTable !== false && String(f.uiComponent || '') === 'ImageField'
  );
}

export function feTableNeedsCopyIconFields(fields: unknown): boolean {
  return feTableHasIdCopyCellFields(fields);
}

/** Search row uses Select for boolean filters — extra MUI imports in `table.hbs`. */
export function feTableNeedsBooleanFilterImports(fields: unknown): boolean {
  if (!Array.isArray(fields)) return false;
  return (fields as { isSearchable?: boolean; filterType?: string; type?: string }[]).some(f => {
    if (!f || f.isSearchable !== true) return false;
    const ft = String(f.filterType || '').trim().toLowerCase();
    const t = String(f.type || '').trim().toLowerCase();
    return ft === 'boolean' || t === 'boolean';
  });
}

/** Same generated source as `feTableFilterNormalizeFunction` helper body. */
export function emitFeTableFilterNormalizeFunction(fields: unknown): string {
  if (!Array.isArray(fields)) return '';

  const searchable = (fields as { isSearchable?: boolean; name?: string }[]).filter(
    f => f && f.isSearchable === true
  );
  if (searchable.length === 0) return '';

  const mongoIdRegex = `/^[a-f\\d]{24}$/i`;

  const cases = searchable
    .map(f => {
      const name = String(f.name || '').trim();
      if (!name) return '';
      const filterType = String((f as { filterType?: string }).filterType || '').trim().toLowerCase();
      const t = String((f as { type?: string }).type || '').trim().toLowerCase();

      const ft =
        filterType ||
        (t === 'number' ? 'exact' : t === 'date' ? 'exact' : t === 'boolean' ? 'boolean' : 'regex');

      const isObjectId = ft === 'objectid' || ft === 'object_id' || ft === 'mongoid' || ft === 'mongodbobjectid';
      const isRegexLike = ft === 'regex' || ft === 'contains' || ft === 'startswith' || ft === 'endswith';
      const isMinMax = ft === 'minmax' || ft === 'range';

      if (t === 'boolean' || ft === 'boolean') {
        return `    case '${name}': {\n      if (value === undefined || value === null || value === '') return undefined;\n      if (typeof value === 'boolean') return value;\n      return undefined;\n    }\n`;
      }

      if (isMinMax) {
        return `    case '${name}': {\n      const s = typeof value === 'string' ? value.trim() : value;\n      if (s === '' || s === undefined || s === null) return undefined;\n      return s as any;\n    }\n`;
      }

      if (isObjectId) {
        return `    case '${name}': {\n      const s = typeof value === 'string' ? value.trim() : '';\n      if (!s) return undefined;\n      return ${mongoIdRegex}.test(s) ? s : undefined;\n    }\n`;
      }

      if (t === 'number') {
        return `    case '${name}': {\n      if (value === '' || value === undefined || value === null) return undefined;\n      const n = typeof value === 'number' ? value : Number(String(value));\n      return Number.isFinite(n) ? n : undefined;\n    }\n`;
      }

      if (filterType === 'date-range') {
        return `    case '${name}': {\n      if (value === undefined || value === null) return undefined;\n      if (typeof value === 'object' && !Array.isArray(value)) {\n        const o = value as { from?: unknown; to?: unknown };\n        let fromStr = '';\n        let toStr = '';\n        if (o.from instanceof Date && !Number.isNaN(o.from.getTime())) {\n          fromStr = o.from.toISOString().slice(0, 10);\n        } else if (typeof o.from === 'string') {\n          fromStr = o.from.trim();\n        }\n        if (o.to instanceof Date && !Number.isNaN(o.to.getTime())) {\n          toStr = o.to.toISOString().slice(0, 10);\n        } else if (typeof o.to === 'string') {\n          toStr = o.to.trim();\n        }\n        if (!fromStr && !toStr) return undefined;\n        const out: { from?: string; to?: string } = {};\n        if (fromStr) out.from = fromStr;\n        if (toStr) out.to = toStr;\n        return out;\n      }\n      const s = typeof value === 'string' ? value.trim() : value;\n      if (s === '' || s === undefined || s === null) return undefined;\n      return s as any;\n    }\n`;
      }

      if (t === 'date') {
        return `    case '${name}': {\n      const s = typeof value === 'string' ? value.trim() : value;\n      if (s === '' || s === undefined || s === null) return undefined;\n      return s as any;\n    }\n`;
      }

      if (isRegexLike || ft === 'exact') {
        return `    case '${name}': {\n      const s = typeof value === 'string' ? value.trim() : value;\n      if (s === '' || s === undefined || s === null) return undefined;\n      return s as any;\n    }\n`;
      }

      return `    case '${name}': {\n      const s = typeof value === 'string' ? value.trim() : value;\n      if (s === '' || s === undefined || s === null) return undefined;\n      return s as any;\n    }\n`;
    })
    .filter(Boolean)
    .join('');

  return `  const normalizeFilterValue = (fieldName: string, value: any) => {\n    switch (fieldName) {\n${cases}      default: {\n        const s = typeof value === 'string' ? value.trim() : value;\n        if (s === '' || s === undefined || s === null) return undefined;\n        return s;\n      }\n    }\n  };\n`;
}

export function emitFeTableRelationOptionImports(fields: unknown, isAdminUser: unknown): string {
  if (!Array.isArray(fields)) return '';
  const adminSuffix = isAdminUser === true ? '.admin' : '';
  const seen = new Set<string>();

  const lines: string[] = [];
  for (const f of fields as {
    isSearchable?: boolean;
    includeRelation?: boolean;
    relationEntityName?: string;
  }[]) {
    if (!f || f.isSearchable !== true || f.includeRelation !== true || !f.relationEntityName) continue;
    const relPlural = pluralizeName(String(f.relationEntityName));
    const relCamelPlural = camelCase(relPlural);
    const pascalPlural = relPlural.charAt(0).toUpperCase() + relPlural.slice(1);
    const importKey = `${relCamelPlural}${adminSuffix}`;
    if (seen.has(importKey)) continue;
    seen.add(importKey);
    lines.push(`import { getAll as get${pascalPlural}All } from '@/services/${relCamelPlural}.service${adminSuffix}';`);
  }
  return lines.length ? `${lines.join('\n')}\n` : '';
}

export function emitFeTableRelationSupportCode(fields: unknown): string {
  if (!Array.isArray(fields)) return '';
  const relFields = (fields as any[]).filter(
    f => f && f.isSearchable === true && f.includeRelation === true && f.relationEntityName
  );
  if (relFields.length === 0) return '';

  const blocks: string[] = [];
  blocks.push(`  const getOptionId = (opt: any): string => String(opt?._id ?? opt?.id ?? '');\n`);

  for (const f of relFields) {
    const name = String(f.name || '').trim();
    if (!name) continue;
    const relPlural = pluralizeName(String(f.relationEntityName));
    const pascalPlural = relPlural.charAt(0).toUpperCase() + relPlural.slice(1);
    const labelProp = String(f.relationProperty || '').trim();
    const labelValueExpr = labelProp ? `opt?.${labelProp}` : `(opt as any)?._id ?? ''`;
    const subNames = relationPropertySubFieldNames(f);
    const formattedLabelExpr = emitFeFormatScalarOrObjectStringExpr(labelValueExpr, subNames);
    const optionLabelReturn = labelProp
      ? `((${formattedLabelExpr}) || getOptionId(opt) || '')`
      : `(String(getOptionId(opt) || ''))`;
    const capName = name.charAt(0).toUpperCase() + name.slice(1);

    blocks.push(
      `  const [${name}Options, set${capName}Options] = React.useState<any[]>([]);\n` +
        `  const [${name}Loading, set${capName}Loading] = React.useState(false);\n` +
        `  const [${name}Input, set${capName}Input] = React.useState('');\n` +
        `  const [${name}Query, set${capName}Query] = React.useState('');\n` +
        `  React.useEffect(() => {\n` +
        `    const handle = setTimeout(() => set${capName}Query(${name}Input.trim().toLowerCase()), 300);\n` +
        `    return () => clearTimeout(handle);\n` +
        `  }, [${name}Input]);\n` +
        `\n` +
        `  const fetch${capName}Options = async () => {\n` +
        `    try {\n` +
        `      set${capName}Loading(true);\n` +
        `      const res: any = await get${pascalPlural}All();\n` +
        `      const items = res?.data?.items ?? res?.data ?? [];\n` +
        `      set${capName}Options(Array.isArray(items) ? items : []);\n` +
        `    } finally {\n` +
        `      set${capName}Loading(false);\n` +
        `    }\n` +
        `  };\n\n` +
        `  const get${capName}OptionLabel = (opt: any): string => {\n` +
        `    return String(${optionLabelReturn});\n` +
        `  };\n` +
        `\n` +
        `  const ${name}FilteredOptions = React.useMemo(() => {\n` +
        `    if (!${name}Query) return ${name}Options;\n` +
        `    return ${name}Options.filter((opt) => get${capName}OptionLabel(opt).toLowerCase().includes(${name}Query));\n` +
        `  }, [${name}Options, ${name}Query]);\n`
    );
  }

  return `\n${blocks.join('\n')}\n`;
}

/** Filter toolbar child `sx` — width 100% of grid cell; column size from parent grid. */
export function emitFeTableFilterFieldSx(f: Record<string, unknown>): string {
  const filterType = String(f.filterType || '').trim().toLowerCase();
  const fieldDbType = String(f.type || '').trim().toLowerCase();
  const fieldName = String(f.name || '').trim();
  const includeRelation = f.includeRelation === true && f.relationEntityName;

  const isObjectId =
    filterType === 'objectid' ||
    filterType === 'object_id' ||
    filterType === 'mongoid' ||
    filterType === 'mongodbobjectid';

  // Id arama: tek grid hücresi, gereksiz genişlemesin (eski span 2 kaldırıldı)
  if (isObjectId || isFeTableIdFieldName(fieldName)) {
    return `{ width: '100%', minWidth: 0, maxWidth: { xs: '100%', md: 200 } }`;
  }

  if (includeRelation) {
    return `{ width: '100%', minWidth: 0 }`;
  }
  if (filterType === 'boolean' || fieldDbType === 'boolean') {
    return `{ width: '100%', minWidth: 0 }`;
  }
  if (filterType === 'date-range' || fieldDbType === 'date') {
    return `{ width: '100%', minWidth: 0, maxWidth: { xs: '100%', md: 220 } }`;
  }
  if (fieldDbType === 'number') {
    return `{ width: '100%', minWidth: 0 }`;
  }
  return `{ width: '100%', minWidth: 0 }`;
}

/** DataGrid column def for one schema field. */
export function emitFeTableGridColumnDef(field: Record<string, unknown>): string {
  const name = String(field.name || '').trim();
  if (!name) return '';
  const label = String(field.label ?? name).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const sizing = emitFeTableGridColumnSizingProps(field);
  const cellJsx = emitFeTableRowCellJsx(field, 'item');

  return `      {
        field: '${name}',
        headerName: '${label}',
        ${sizing},
        sortable: false,
        renderCell: (params) => {
          const item = params.row;
          return (
            <Box className='admin-grid-cell-fill'>
              ${cellJsx}
            </Box>
          );
        },
      }`;
}

const actionsColumnDef = `      {
        field: '__actions',
        headerName: 'Actions',
        width: 112,
        minWidth: 112,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        align: 'right',
        headerAlign: 'right',
        renderCell: (params) => (
          <Box
            className='admin-grid-cell-fill'
            sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}
          >
            {onEdit && (
              <IconButton size='small' onClick={() => onEdit(params.row)} color='primary'>
                <EditIcon />
              </IconButton>
            )}
            {onDelete && (
              <IconButton size='small' onClick={() => onDelete(params.row)} color='error'>
                <DeleteIcon />
              </IconButton>
            )}
          </Box>
        ),
      }`;

/** `useMemo` block: DataGrid column definitions from schema fields. */
export function emitFeTableGridColumnsUseMemo(entityName: unknown, fields: unknown): string {
  const en = String(entityName ?? '');
  if (!Array.isArray(fields)) {
    return `  const columns = React.useMemo<GridColDef<I${en}>[]>(() => [${actionsColumnDef}], [onEdit, onDelete]);\n`;
  }
  const visible = (fields as { showInTable?: boolean }[]).filter(f => f && f.showInTable !== false);
  const fieldCols = visible
    .map(f => emitFeTableGridColumnDef(f as Record<string, unknown>))
    .filter(Boolean)
    .join(',\n');
  const cols = fieldCols ? `${fieldCols},\n${actionsColumnDef}` : actionsColumnDef;
  return `  const columns = React.useMemo<GridColDef<I${en}>[]>(
    () => [
${cols}
    ],
    [onEdit, onDelete]
  );\n`;
}

/** DataGrid requires row.id — map document PK (_id / id) without mutating items from API. */
export function emitFeTableGridRowsUseMemo(entityName: unknown, sourceType: unknown): string {
  const en = String(entityName ?? '');
  const idMember = resolvePrimaryKeyMemberAccess(sourceType);
  return `  const gridRows = React.useMemo(
    () =>
      (items ?? []).map((row, index) => {
        const pk = (row as I${en})${idMember} ?? (row as any).id;
        return {
          ...row,
          id: pk != null && pk !== '' ? String(pk) : String(index),
        };
      }),
    [items]
  );\n`;
}

function emitSearchFilterField(f: Record<string, unknown>): string {
  const name = String(f.name || '').trim();
  if (!name) return '';
  const label = String(f.label ?? name);
  const filterType = String(f.filterType || '').trim().toLowerCase();
  const includeRelation = f.includeRelation === true;
  const relationEntityName = f.relationEntityName;

  const filterAttrs = emitFeTableFilterFieldAttrs(f);
  const fieldSx = emitFeTableFilterFieldSx(f);

  if (includeRelation && relationEntityName) {
    const cap = uppercaseFirstStr(name);
    return `            <Autocomplete
              options={ ${name}FilteredOptions }
              loading={ ${name}Loading }
              onInputChange={(_, newInputValue) => set${cap}Input(newInputValue || '')}
              sx={${fieldSx}}
              fullWidth
              onOpen={() => {
                if (${name}Options.length === 0) {
                  void fetch${cap}Options();
                }
              }}
              value={ ${name}Options.find((o) => getOptionId(o) === (filters?.${name} as any)) ?? null }
              onChange={(_, newValue) => handleFilterChange('${name}', newValue ? getOptionId(newValue) : undefined)}
              isOptionEqualToValue={(option, value) => getOptionId(option) === getOptionId(value)}
              getOptionLabel={get${cap}OptionLabel}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="${label.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
                  size='small'
                  fullWidth
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        { ${name}Loading ? <CircularProgress color='inherit' size={16} /> : null }
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />`;
  }

  const fieldDbType = String(f.type || '').trim().toLowerCase();
  const isBooleanFilter = filterType === 'boolean' || fieldDbType === 'boolean';

  if (isBooleanFilter) {
    const safeLabel = label.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `            <FormControl fullWidth size='small' sx={${fieldSx}}>
              <InputLabel id='${name}-bool-filter-label'>${safeLabel}</InputLabel>
              <Select
                labelId='${name}-bool-filter-label'
                label='${safeLabel}'
                value={
                  filters?.${name} === true ? 'true' : filters?.${name} === false ? 'false' : ''
                }
                onChange={(e) => {
                  const v = String(e.target.value);
                  let next: boolean | undefined;
                  if (v === '') next = undefined;
                  else if (v === 'true') next = true;
                  else if (v === 'false') next = false;
                  else next = undefined;
                  handleFilterChange('${name}', next);
                }}
              >
                <MenuItem value=''>
                  <em>All</em>
                </MenuItem>
                <MenuItem value='true'>Yes</MenuItem>
                <MenuItem value='false'>No</MenuItem>
              </Select>
            </FormControl>`;
  }

  if (filterType === 'date-range') {
    const safeLabel = label.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const dateSx = emitFeTableFilterFieldSx({ ...f, filterType: 'date-range', type: 'date' });
    return `            <TextField
              label="${safeLabel} (from)"
              value={
                typeof filters?.${name} === 'object' &&
                filters?.${name} !== null &&
                !Array.isArray(filters?.${name})
                  ? String((filters.${name} as { from?: string }).from ?? '')
                  : ''
              }
              onChange={(e) => handleDateRangeFilterChange('${name}', 'from', e.target.value)}
              fullWidth
              size='small'
              type='date'
              InputLabelProps={{ shrink: true, title: '${safeLabel} (from)' }}
              sx={${dateSx}}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && onSearch) {
                  onSearch();
                }
              }}
            />
            <TextField
              label="${safeLabel} (to)"
              value={
                typeof filters?.${name} === 'object' &&
                filters?.${name} !== null &&
                !Array.isArray(filters?.${name})
                  ? String((filters.${name} as { to?: string }).to ?? '')
                  : ''
              }
              onChange={(e) => handleDateRangeFilterChange('${name}', 'to', e.target.value)}
              fullWidth
              size='small'
              type='date'
              InputLabelProps={{ shrink: true, title: '${safeLabel} (to)' }}
              sx={${dateSx}}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && onSearch) {
                  onSearch();
                }
              }}
            />`;
  }

  return `            <TextField
              label="${label.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"
              value={filters?.${name} || ''}
              onChange={(e) => handleFilterChange('${name}', e.target.value)}
              fullWidth
              size='small'
              sx={${fieldSx}}
              ${filterAttrs ? filterAttrs + '\n              ' : ''}onKeyPress={(e) => {
                if (e.key === 'Enter' && onSearch) {
                  onSearch();
                }
              }}
            />`;
}

const searchResetButtons = `            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', alignSelf: 'end', flexWrap: 'wrap' }}>
              <Button variant='outlined' color='primary' onClick={onSearch}>
                Apply
              </Button>
              <Button variant='text' color='primary' onClick={onReset}>
                Reset
              </Button>
            </Box>`;

/**
 * `table.hbs`: saf emission (`emitFe*`) + template fragment helper kayıtları.
 * Handlebars helper kayıtları `registerFrontendHandlebarsHelpers` içinde bu fonksiyondan önce gelen
 * `feTableFilterFieldAttrs`, `feTableNeedsAvatar`, `feTableFilterNormalizeFunction`, `feTableRelation*` ile uyumludur.
 */
export function registerFeTableTemplateFragments(): void {
  Handlebars.registerHelper('feTableMuiAvatarImportLine', (fields: unknown) => {
    const needs = feTableNeedsAvatarFields(fields);
    return needs ? new Handlebars.SafeString('  Avatar,\n') : new Handlebars.SafeString('');
  });

  Handlebars.registerHelper('feTableMuiCopyIconImportLine', (fields: unknown) => {
    return feTableNeedsCopyIconFields(fields)
      ? new Handlebars.SafeString("import { ContentCopy as ContentCopyIcon } from '@mui/icons-material';\n")
      : new Handlebars.SafeString('');
  });

  Handlebars.registerHelper('feTableMuiBooleanFilterImportsLine', (fields: unknown) => {
    return feTableNeedsBooleanFilterImports(fields)
      ? new Handlebars.SafeString('  FormControl,\n  InputLabel,\n  Select,\n  MenuItem,\n')
      : new Handlebars.SafeString('');
  });

  Handlebars.registerHelper(
    'feTableTypesImportLine',
    (entityName: unknown, camelEntityName: unknown, fields: unknown, isAdminUser: unknown) => {
      const en = String(entityName ?? '');
      const camel = String(camelEntityName ?? '');
      const q = fieldsHaveSearchable(fields) ? `, Get${en}Query` : '';
      const sfx = isAdminUser === true ? '.admin' : '';
      return new Handlebars.SafeString(`import { I${en}${q} } from '@/services/${camel}.service${sfx}';`);
    }
  );

  Handlebars.registerHelper('feTablePropsSearchableOptionalLines', (entityName: unknown, fields: unknown) => {
    if (!fieldsHaveSearchable(fields)) return '';
    const en = String(entityName ?? '');
    return new Handlebars.SafeString(
      `  filters?: Get${en}Query;\n  onFilterChange?: (filters: Get${en}Query) => void;\n  onSearch?: () => void;\n  onReset?: () => void;\n  tableKey?: string;\n`
    );
  });

  Handlebars.registerHelper('feTableDestructuringSearchableParams', (fields: unknown) => {
    if (!fieldsHaveSearchable(fields)) return '';
    return new Handlebars.SafeString(
      `  filters = {},\n  onFilterChange,\n  onSearch,\n  onReset,\n  tableKey,\n`
    );
  });

  Handlebars.registerHelper('feTableSearchableLogicBlock', (fields: unknown) => {
    if (!fieldsHaveSearchable(fields)) return '';
    const norm = emitFeTableFilterNormalizeFunction(fields);
    let rel = '';
    if (hasSearchableRelationFields(fields)) {
      rel = emitFeTableRelationSupportCode(fields);
    }
    const handlers = `  const handleFilterChange = (fieldName: string, value: any) => {
    if (onFilterChange) {
      const normalizedValue = normalizeFilterValue(fieldName, value);
      onFilterChange({
        ...filters,
        [fieldName]: normalizedValue,
      });
    }
  };

  const handleDateRangeFilterChange = (fieldName: string, part: 'from' | 'to', value: string) => {
    if (!onFilterChange) return;
    const raw = (filters as Record<string, unknown>)?.[fieldName];
    const base =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? { ...(raw as Record<string, unknown>) }
        : {};
    const next = { ...base, [part]: value };
    const normalized = normalizeFilterValue(fieldName, next);
    onFilterChange({
      ...filters,
      [fieldName]: normalized,
    });
  };
`;
    return new Handlebars.SafeString(norm + rel + handlers);
  });

  Handlebars.registerHelper('feTablePropsPaginationLines', () =>
    new Handlebars.SafeString(
      `  paginationModel: GridPaginationModel;\n  onPaginationModelChange: (model: GridPaginationModel) => void;\n`
    )
  );

  Handlebars.registerHelper('feTableDestructuringPaginationParams', () =>
    new Handlebars.SafeString(`  paginationModel,\n  onPaginationModelChange,\n`)
  );

  Handlebars.registerHelper('feTableGridRowsUseMemo', (entityName: unknown, sourceType: unknown) =>
    new Handlebars.SafeString(emitFeTableGridRowsUseMemo(entityName, sourceType))
  );

  Handlebars.registerHelper('feTableGridColumnsUseMemo', (entityName: unknown, fields: unknown) =>
    new Handlebars.SafeString(emitFeTableGridColumnsUseMemo(entityName, fields))
  );

  Handlebars.registerHelper('feTableAdminTableFiltersProp', (fields: unknown) => {
    const block = emitFeTableAdminTableFiltersProp(fields);
    return block ? new Handlebars.SafeString(block) : '';
  });
}

/** Search filter grid markup (inside Fragment). */
export function emitFeTableSearchFiltersInner(fields: unknown): string {
  if (!fieldsHaveSearchable(fields)) return '';
  const searchable = (fields as { isSearchable?: boolean }[]).filter(f => f?.isSearchable === true);
  const fieldChunks = searchable.map(f => emitSearchFilterField(f as Record<string, unknown>)).join('\n');
  return `          {/* Search Filters */}
          <Box
            sx={{
              mb: 2,
              flexShrink: 0,
              width: '100%',
              minWidth: 0,
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                md: 'repeat(auto-fill, minmax(180px, 1fr))',
              },
              gap: 2,
              alignItems: 'center',
              pt: 0.5,
            }}
          >
${fieldChunks}
${searchResetButtons}
          </Box>
`;
}

/** `AdminTable` `filters={` prop with Fragment wrapper, or empty when no searchable fields. */
export function emitFeTableAdminTableFiltersProp(fields: unknown): string {
  const inner = emitFeTableSearchFiltersInner(fields);
  if (!inner) return '';
  return `      filters={
        <>
${inner}
        </>
      }
`;
}
