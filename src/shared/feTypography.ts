/** Locked typography variants for generated FE UI (Task 70). */
export const FE_TEXT_VARIANT = {
  pageTitle: 'headingMedium/semiBold',
  tableHeader: 'labelBase/semiBold',
  tableCell: 'bodySmall/regular',
  tableEmpty: 'bodyBase/regular',
  deleteDialogBody: 'bodyBase/regular',
  modalTitle: 'headingSmall/semiBold',
} as const;

export type FeTextVariant = (typeof FE_TEXT_VARIANT)[keyof typeof FE_TEXT_VARIANT];

export type FeCoreTextEmitOptions = {
  variant: FeTextVariant | string;
  children: string;
  component?: string;
  noWrap?: boolean;
  /** Raw object inside `sx={...}` e.g. `{ color: 'text.secondary' }` */
  sx?: string;
};

export function emitFeCoreTextJsx(options: FeCoreTextEmitOptions): string {
  const props: string[] = [`variant='${options.variant}'`];
  if (options.component) props.push(`component='${options.component}'`);
  if (options.noWrap) props.push('noWrap');
  if (options.sx) props.push(`sx={${options.sx}}`);
  return `<CoreText ${props.join(' ')}>\n  ${options.children}\n</CoreText>`;
}

export function emitFeCoreTextPlaceholder(): string {
  return emitFeCoreTextJsx({
    variant: FE_TEXT_VARIANT.tableCell,
    sx: "{ color: 'text.disabled' }",
    children: '-',
  });
}

/** Populated relation object vs id string — single expression for table cell `v`. */
export function emitFeRelationCellValueExpr(key: string, relationProperty: string): string {
  const prop = relationProperty.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `typeof ${key} === 'object' && ${key} !== null ? (${key} as any)?.['${prop}'] ?? ${key} : ${key}`;
}

/** Wrap a display expression for table/grid cells (ellipsis via CoreText noWrap). */
export function emitFeCoreTextCellDisplay(displayExpr: string): string {
  const placeholder = emitFeCoreTextPlaceholder();
  return `{(() => {\n  const v = ${displayExpr};\n  return v != null && v !== '' ? (\n    <CoreText variant='${FE_TEXT_VARIANT.tableCell}' noWrap>\n      {v}\n    </CoreText>\n  ) : (\n    ${placeholder}\n  );\n})()}`;
}

export function emitFeCoreTextCellDateExpr(key: string): string {
  const placeholder = emitFeCoreTextPlaceholder();
  return `{(() => {\n  const v = ${key};\n  return v != null ? (\n    <CoreText variant='${FE_TEXT_VARIANT.tableCell}' noWrap>\n      {new Date(v as string | Date).toLocaleString()}\n    </CoreText>\n  ) : (\n    ${placeholder}\n  );\n})()}`;
}

export function emitFeCoreTextCellArrayExpr(key: string): string {
  const placeholder = emitFeCoreTextPlaceholder();
  return `{(() => {\n  const v = ${key};\n  return Array.isArray(v) && v.length > 0 ? (\n    <CoreText variant='${FE_TEXT_VARIANT.tableCell}' noWrap>\n      {v.join(', ')}\n    </CoreText>\n  ) : (\n    ${placeholder}\n  );\n})()}`;
}

function emitObjectSubFieldPickExpr(subFieldNames?: string[]): string {
  return subFieldNames && subFieldNames.length > 0
    ? `[${subFieldNames.map(n => `o['${n.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}']`).join(', ')}]`
    : `Object.values(o)`;
}

/**
 * Scalar or embedded object → display string (e.g. `{ tr, en }` → `"Altın / Gold"`).
 * When `subFieldNames` is provided, values are picked in that order; otherwise `Object.values`.
 */
export function emitFeFormatScalarOrObjectStringExpr(valueExpr: string, subFieldNames?: string[]): string {
  const pick = emitObjectSubFieldPickExpr(subFieldNames);
  return `(() => {
  const v = ${valueExpr};
  if (v == null || v === '') return '';
  if (typeof v !== 'object' || Array.isArray(v)) return String(v);
  const o = v as Record<string, unknown>;
  const parts = ${pick}
    .filter((x) => x != null && x !== '')
    .map((x) => String(x));
  return parts.length > 0 ? parts.join(' / ') : '';
})()`;
}

/**
 * Embedded object cell (e.g. `displayText: { tr, en }`).
 * Rendering a raw object as a JSX child throws in React, so we join non-empty sub-values.
 */
export function emitFeCoreTextCellObjectExpr(key: string, subFieldNames?: string[]): string {
  const formatted = emitFeFormatScalarOrObjectStringExpr(key, subFieldNames);
  const placeholder = emitFeCoreTextPlaceholder();
  return `{(() => {\n  const text = ${formatted};\n  return text ? (\n    <CoreText variant='${FE_TEXT_VARIANT.tableCell}' noWrap title={text}>\n      {text}\n    </CoreText>\n  ) : (\n    ${placeholder}\n  );\n})()}`;
}
