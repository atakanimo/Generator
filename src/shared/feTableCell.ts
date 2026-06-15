import {
  emitFeCoreTextCellArrayExpr,
  emitFeCoreTextCellDateExpr,
  emitFeCoreTextCellDisplay,
  emitFeRelationCellValueExpr,
  FE_TEXT_VARIANT,
  emitFeCoreTextJsx,
} from './feTypography.js';

type FeTableField = {
  name?: string;
  type?: string;
  label?: string;
  uiComponent?: string;
  isArray?: boolean;
  includeRelation?: boolean;
  relationEntityName?: string;
  relationProperty?: string;
};

/** Field name looks like an identifier column (_id, id, userId, report_id, …). */
export function isFeTableIdFieldName(name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  if (n === '_id' || n === 'id') return true;
  if (/Id$/.test(n)) return true;
  if (/_id$/i.test(n)) return true;
  return false;
}

/** ID kolonu (relation dahil) — copy ikonu gösterilir. */
export function isFeTableIdCopyField(field: FeTableField): boolean {
  return isFeTableIdFieldName(String(field.name || ''));
}

export function isFeTableRelationIdCopyField(field: FeTableField): boolean {
  return field.includeRelation === true && isFeTableIdFieldName(String(field.name || ''));
}

export function feTableHasIdCopyCellFields(fields: unknown): boolean {
  if (!Array.isArray(fields)) return false;
  return (fields as FeTableField[]).some(
    f => f && (f as { showInTable?: boolean }).showInTable !== false && isFeTableIdCopyField(f)
  );
}

/** Extract raw id string from scalar or populated relation (TS-safe emitted code). */
export function emitFeTableIdValueExpr(key: string): string {
  return `(() => {
  const raw: unknown = ${key};
  if (raw == null) return '';
  if (typeof raw === 'string') return raw === '' ? '' : raw;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const id = o._id ?? o.id;
    return id != null && id !== '' ? String(id) : '';
  }
  return String(raw);
})()`;
}

/** ID cell: shortened display + copy button (relation olmayan id kolonları). */
export function emitFeTableIdCopyCellJsx(field: FeTableField, itemVar = 'item'): string {
  const name = String(field.name || '').trim();
  const key = `${itemVar}['${name}']`;
  const idExpr = emitFeTableIdValueExpr(key);
  const placeholder = emitFeCoreTextJsx({
    variant: FE_TEXT_VARIANT.tableCell,
    sx: "{ color: 'text.disabled' }",
    children: '-',
  });

  return `{(() => {
  const idStr = ${idExpr};
  if (!idStr) {
    return (
      ${placeholder}
    );
  }
  const display = idStr.length > 12 ? \`\${idStr.slice(0, 6)}…\${idStr.slice(-4)}\` : idStr;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, width: '100%' }}>
      <CoreText variant='${FE_TEXT_VARIANT.tableCell}' noWrap title={idStr}>
        {display}
      </CoreText>
      <IconButton
        size='small'
        aria-label='Copy id'
        onClick={(e) => {
          e.stopPropagation();
          void navigator.clipboard?.writeText(idStr);
        }}
      >
        <ContentCopyIcon fontSize='inherit' />
      </IconButton>
    </Box>
  );
})()}`;
}

/** Relation + ID: relation label göster, copy ile ham id kopyala. */
export function emitFeTableRelationIdCopyCellJsx(field: FeTableField, itemVar = 'item'): string {
  const name = String(field.name || '').trim();
  const key = `${itemVar}['${name}']`;
  const idExpr = emitFeTableIdValueExpr(key);
  const prop = String(field.relationProperty || '').trim();
  const labelExpr = prop
    ? `(() => {\n  const v: unknown = ${emitFeRelationCellValueExpr(key, prop)};\n  if (v == null || v === '') return '';\n  return String(v);\n})()`
    : idExpr;
  const placeholder = emitFeCoreTextJsx({
    variant: FE_TEXT_VARIANT.tableCell,
    sx: "{ color: 'text.disabled' }",
    children: '-',
  });

  return `{(() => {
  const idStr = ${idExpr};
  const label = ${labelExpr};
  if (!label && !idStr) {
    return (
      ${placeholder}
    );
  }
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, width: '100%' }}>
      <CoreText variant='${FE_TEXT_VARIANT.tableCell}' noWrap title={label || idStr}>
        {label || '-'}
      </CoreText>
      {idStr ? (
        <IconButton
          size='small'
          aria-label='Copy id'
          onClick={(e) => {
            e.stopPropagation();
            void navigator.clipboard?.writeText(idStr);
          }}
        >
          <ContentCopyIcon fontSize='inherit' />
        </IconButton>
      ) : null}
    </Box>
  );
})()}`;
}

/** JSX for one table/grid cell reading from `itemVar['fieldName']`. */
export function emitFeTableRowCellJsx(field: FeTableField, itemVar = 'item'): string {
  const name = String(field.name || '').trim();
  if (!name) return 'null';
  const key = `${itemVar}['${name}']`;

  if (field.isArray) {
    return emitFeCoreTextCellArrayExpr(key);
  }
  if (field.includeRelation) {
    if (isFeTableRelationIdCopyField(field)) {
      return emitFeTableRelationIdCopyCellJsx(field, itemVar);
    }
    if (field.relationEntityName) {
      const prop = String(field.relationProperty || '').trim();
      if (!prop) {
        return emitFeCoreTextCellDisplay(key);
      }
      return emitFeCoreTextCellDisplay(emitFeRelationCellValueExpr(key, prop));
    }
    return emitFeCoreTextCellDisplay(key);
  }
  if (isFeTableIdCopyField(field)) {
    return emitFeTableIdCopyCellJsx(field, itemVar);
  }
  if (String(field.uiComponent || '') === 'ImageField') {
    const label = String(field.label || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `{${key} ? (() => {\n  const imageValue = ${key};\n  const isBase64 = typeof imageValue === 'string' &&\n    (imageValue.startsWith('/9j/') ||\n     imageValue.startsWith('iVBORw0KGgo') ||\n     imageValue.startsWith('UklGR') ||\n     (imageValue.length > 100 && !imageValue.startsWith('http')));\n  const imageSrc = isBase64 && !imageValue.startsWith('data:image/')\n    ? \`data:image/jpeg;base64,\${imageValue}\`\n    : imageValue;\n  return (\n    <Avatar\n      src={imageSrc}\n      alt="${label}"\n      sx={{ width: 40, height: 40 }}\n      variant="rounded"\n    />\n  );\n})() : '-'}`;
  }
  const t = String(field.type || '').toLowerCase();
  if (t === 'boolean') {
    return `{typeof ${key} === 'boolean' ? (\n  <Chip\n    label={${key} ? 'Yes' : 'No'}\n    color={${key} ? 'success' : 'default'}\n    size="small"\n  />\n) : ${key}}`;
  }
  if (t === 'date' || t === 'datetime') {
    return emitFeCoreTextCellDateExpr(key);
  }
  return emitFeCoreTextCellDisplay(key);
}

const LONG_STRING_FIELD = /description|desc|comment|note|body|content|message|detail|summary|address/i;

/** DataGrid column sizing defaults from schema field (kullanıcı DataGrid'de yeniden boyutlandırabilir). */
export function emitFeTableGridColumnSizingProps(field: FeTableField): string {
  const t = String(field.type || '').trim().toLowerCase();
  const ui = String(field.uiComponent || '').trim();
  const name = String(field.name || '').trim();
  const includeRelation = field.includeRelation === true;

  if (t === 'boolean') return 'width: 80, minWidth: 80';
  if (t === 'number') return 'width: 100, minWidth: 88';
  if (t === 'date' || t === 'datetime') return 'width: 160, minWidth: 132';
  if (ui === 'ImageField') return 'width: 72, minWidth: 72';
  if (includeRelation) return 'flex: 1, minWidth: 120';
  if (isFeTableIdFieldName(name)) return 'width: 120, minWidth: 100';
  if (t === 'string') {
    if (LONG_STRING_FIELD.test(name)) return 'flex: 1, minWidth: 150';
    return 'flex: 1, minWidth: 110';
  }
  return 'flex: 1, minWidth: 110';
}
