import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { Box, Button, Stack, TextField, Typography, type BoxProps } from '@mui/material';
import {
  DataGrid,
  type DataGridProps,
  type GridColDef,
  type GridPaginationModel,
  type GridRowId,
  type GridValidRowModel
} from '@mui/x-data-grid';
import { useState, type ReactNode } from 'react';
import { ataGridSx, useAtaGridLocaleText } from './gridStyles.js';

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const DEFAULT_HEIGHT = 460;

export interface RecordTableSearch {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  actionLabel: string;
}

/** `number`: sabit kutu (varsayılan 460); `auto`: satır sayısı kadar; `fill`: flex ebeveynin kalanını doldurur. */
export type RecordTableHeight = 'auto' | 'fill' | number;

type GridPassThrough<T extends GridValidRowModel> = Pick<
  DataGridProps<T>,
  'onRowClick' | 'disableColumnSorting' | 'initialState' | 'editMode' | 'processRowUpdate' | 'onProcessRowUpdateError' | 'isCellEditable'
>;

export interface RecordTableProps<T extends GridValidRowModel = GridValidRowModel> extends GridPassThrough<T> {
  rows: T[];
  columns: GridColDef<T>[];
  /** Varsayılan `row.id`. */
  getRowId?: (row: T) => GridRowId;
  search?: RecordTableSearch;
  loading?: boolean;
  /** İstemci sayfalama. Sunucu sayfalama `paginationModel` ile açılır. */
  pageSize?: number;
  pageSizeOptions?: number[];
  rowCount?: number;
  paginationModel?: GridPaginationModel;
  onPaginationModelChange?: (model: GridPaginationModel) => void;
  height?: RecordTableHeight;
  /** Yalnız `height='auto'`: ızgara kutusunu sınırlar, taşan satırlar kutuda kayar. */
  maxHeight?: BoxProps['maxHeight'];
  /** DataGrid `key`: değişince ızgara sıfırdan mount edilir ve istemci sayfası başa döner. */
  gridKey?: string;
  /** Başlık bloğu: başlık, araç satırı (filtreler), ikincil küçük metinler — bu sırayla. */
  title?: ReactNode;
  toolbar?: ReactNode;
  hints?: ReactNode[];
}

const defaultRowId = (row: GridValidRowModel): GridRowId => row.id as GridRowId;

function clientModel(pageSize: number, initialState: DataGridProps['initialState']): GridPaginationModel {
  const initial = initialState?.pagination?.paginationModel;
  return { page: initial?.page ?? 0, pageSize: initial?.pageSize ?? pageSize };
}

/**
 * Resource sayfasındaki ızgara: başlık/araç/ipuçları, arama satırı, kenarlık, başlık ve sayfalama metinleri.
 * Satır ve kolonlar çağırandan gelir; resource listesine bağlı değildir.
 */
export function RecordTable<T extends GridValidRowModel = GridValidRowModel>({
  rows,
  columns,
  getRowId = defaultRowId,
  search,
  loading = false,
  pageSize = 25,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  rowCount,
  paginationModel,
  onPaginationModelChange,
  height = DEFAULT_HEIGHT,
  maxHeight,
  gridKey,
  title,
  toolbar,
  hints,
  initialState,
  ...gridProps
}: RecordTableProps<T>) {
  const localeText = useAtaGridLocaleText(loading);
  const server = paginationModel != null && onPaginationModelChange != null;
  const [client, setClient] = useState(() => ({ key: gridKey, model: clientModel(pageSize, initialState) }));
  // gridKey değişimi: remount edilen ızgara ilk sayfadan başlar (eski initialState davranışı).
  if (client.key !== gridKey) setClient({ key: gridKey, model: clientModel(pageSize, initialState) });
  const model = server ? paginationModel : client.model;
  const onModelChange = server ? onPaginationModelChange : (next: GridPaginationModel) => setClient({ key: gridKey, model: next });

  const auto = height === 'auto';
  const fill = height === 'fill';
  const visibleHints = (hints ?? []).filter(hint => hint != null && hint !== false && hint !== '');
  const hasHeader = title != null || toolbar != null || visibleHints.length > 0;

  return (
    <Stack spacing={2} sx={{ minWidth: 0, ...(fill ? { flex: 1, minHeight: { xs: 420, md: 0 } } : {}) }}>
      {hasHeader ? (
        <Stack spacing={1.5} sx={{ minWidth: 0, flexShrink: 0 }}>
          {typeof title === 'string' ? (
            <Typography variant='subtitle1' component='h2' sx={{ fontWeight: 600 }}>
              {title}
            </Typography>
          ) : (
            title
          )}
          {toolbar}
          {visibleHints.length > 0 ? (
            <Stack spacing={0.5}>
              {visibleHints.map((hint, index) => (
                <Typography key={index} variant='body2' component='div' sx={{ color: 'text.secondary', fontSize: '0.8125rem' }}>
                  {hint}
                </Typography>
              ))}
            </Stack>
          ) : null}
        </Stack>
      ) : null}
      {search ? (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField
            label={search.label}
            value={search.value}
            onChange={event => search.onChange(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') search.onSearch();
            }}
            size='small'
            sx={{ minWidth: 260 }}
          />
          <Button variant='outlined' startIcon={<SearchOutlinedIcon />} onClick={search.onSearch}>
            {search.actionLabel}
          </Button>
        </Stack>
      ) : null}
      <Box
        sx={{
          width: '100%',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          ...(auto ? { flexShrink: 0, ...(maxHeight != null ? { maxHeight, overflow: 'auto' } : {}) } : {}),
          ...(fill ? { flex: 1, minHeight: 0 } : {}),
          ...(typeof height === 'number' ? { height } : {})
        }}
      >
        <DataGrid<T>
          key={gridKey}
          {...gridProps}
          rows={rows}
          columns={columns}
          getRowId={getRowId}
          loading={loading}
          autoHeight={auto}
          initialState={initialState}
          rowCount={server ? rowCount ?? 0 : undefined}
          paginationMode={server ? 'server' : 'client'}
          paginationModel={model}
          onPaginationModelChange={onModelChange}
          pageSizeOptions={pageSizeOptions}
          disableRowSelectionOnClick
          disableColumnFilter
          localeText={localeText}
          sx={{
            ...ataGridSx,
            flex: auto ? 'none' : 1,
            minHeight: height === DEFAULT_HEIGHT ? 320 : 0
          }}
        />
      </Box>
    </Stack>
  );
}
