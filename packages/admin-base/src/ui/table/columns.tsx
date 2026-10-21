import type { GridColDef } from '@mui/x-data-grid';
import type { ReactNode } from 'react';
import type { AnyResource } from '../../schema/extend.js';
import type { FieldConfig } from '../../schema/fields.js';
import type { AdminTexts } from '../useAdminTexts.js';
import { fieldLabelKey } from '../useAdminTexts.js';
import { IdCell, ValueCell } from './cells.js';

type Row = { id: string } & Record<string, unknown>;

/** Genişlikler admin-ui kuralındaki tablodan (her kolonda minWidth var). */
function sizeFor(field: FieldConfig): Pick<GridColDef, 'width' | 'flex' | 'minWidth'> {
  if (field.isArray || field.kind === 'object' || field.kind === 'map' || field.kind === 'json') return { flex: 1, minWidth: 150 };
  if (field.component === 'image') return { width: 72, minWidth: 64 };
  switch (field.kind) {
    case 'boolean':
      return { width: 80, minWidth: 80 };
    case 'number':
    case 'decimal':
      return { width: 100, minWidth: 88 };
    case 'datetime':
      return { width: 160, minWidth: 132 };
    case 'enum':
      return { width: 140, minWidth: 110 };
    case 'relation':
      return { flex: 1, minWidth: 120 };
    case 'string':
      return { flex: 1, minWidth: 150 };
    default:
      return { flex: 1, minWidth: 110 };
  }
}

/** Sunucu sıralaması yalnızca skaler, dizi olmayan alanlarda. */
function isSortable(field: FieldConfig): boolean {
  return !field.isArray && field.kind !== 'relation' && field.kind !== 'object' && field.kind !== 'map' && field.kind !== 'json';
}

export interface BuildColumnsOptions {
  resource: AnyResource;
  texts: AdminTexts;
  onOpenJson: (title: string, value: unknown) => void;
  renderActions?: (row: Row) => ReactNode;
  actionsWidth?: number;
}

export function buildColumns({ resource, texts, onOpenJson, renderActions, actionsWidth = 112 }: BuildColumnsOptions): GridColDef<Row>[] {
  const overrides = resource.extensions?.fields ?? {};

  const columns: GridColDef<Row>[] = [
    {
      field: 'id',
      headerName: 'ID',
      width: 120,
      minWidth: 100,
      renderCell: params => <IdCell id={String(params.row.id ?? '')} />
    }
  ];

  for (const field of resource.fields) {
    if (!field.list || field.writeOnly) continue;
    const Cell = overrides[field.name]?.cell;
    columns.push({
      field: field.name,
      headerName: texts.fieldLabel(fieldLabelKey(resource, [field.name]), field),
      sortable: isSortable(field),
      ...sizeFor(field),
      renderCell: params =>
        Cell ? (
          <Cell row={params.row} value={params.row[field.name]} />
        ) : (
          <ValueCell resource={resource} field={field} value={params.row[field.name]} onOpenJson={onOpenJson} />
        )
    });
  }

  // First column: with many fields a trailing actions column is scrolled (and virtualized) out of view.
  if (renderActions) {
    columns.unshift({
      field: '__actions',
      headerName: texts.text('actions'),
      width: actionsWidth,
      minWidth: actionsWidth,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      renderCell: params => renderActions(params.row)
    });
  }

  return columns;
}
