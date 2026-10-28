import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { Box, Button, Stack, TextField } from '@mui/material';
import {
  DataGrid,
  type GridColDef,
  type GridPaginationModel,
  type GridRowId,
  type GridValidRowModel
} from '@mui/x-data-grid';
import { trTR } from '@mui/x-data-grid/locales';
import { useState } from 'react';
import { useAdminTexts } from '../useAdminTexts.js';

const PAGE_SIZE_OPTIONS = [25, 50, 100];

export interface RecordTableSearch {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  actionLabel: string;
}

export interface RecordTableProps<T extends GridValidRowModel & { id: GridRowId }> {
  rows: T[];
  columns: GridColDef<T>[];
  search?: RecordTableSearch;
  loading?: boolean;
  /** İstemci sayfalama. Sunucu sayfalama `paginationModel` ile açılır. */
  pageSize?: number;
  rowCount?: number;
  paginationModel?: GridPaginationModel;
  onPaginationModelChange?: (model: GridPaginationModel) => void;
}

/**
 * Resource sayfasındaki ızgara: arama satırı, kenarlık, başlık ve sayfalama metinleri.
 * Satır ve kolonlar çağırandan gelir; resource listesine bağlı değildir.
 */
export function RecordTable<T extends GridValidRowModel & { id: GridRowId }>({
  rows,
  columns,
  search,
  loading = false,
  pageSize = 25,
  rowCount,
  paginationModel,
  onPaginationModelChange
}: RecordTableProps<T>) {
  const { text } = useAdminTexts();
  const server = paginationModel != null && onPaginationModelChange != null;
  const [clientPage, setClientPage] = useState<GridPaginationModel>({ page: 0, pageSize });
  const model = server ? paginationModel : clientPage;
  const onModelChange = server ? onPaginationModelChange : setClientPage;

  return (
    <Stack spacing={2} sx={{ minWidth: 0 }}>
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
      <Box sx={{ height: 460, width: '100%', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <DataGrid<T>
          rows={rows}
          columns={columns}
          getRowId={row => row.id}
          loading={loading}
          rowCount={server ? rowCount ?? 0 : undefined}
          paginationMode={server ? 'server' : 'client'}
          paginationModel={model}
          onPaginationModelChange={onModelChange}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          disableRowSelectionOnClick
          disableColumnFilter
          localeText={{
            ...trTR.components.MuiDataGrid.defaultProps.localeText,
            noRowsLabel: loading ? '' : text('noRows'),
            paginationRowsPerPage: text('rowsPerPage'),
            paginationDisplayedRows: ({ from, to, count }) =>
              text('displayedRows', { from, to, count: count === -1 ? '?' : count })
          }}
          sx={{
            flex: 1,
            minHeight: 320,
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            bgcolor: 'background.paper',
            '& .MuiDataGrid-columnHeader, & .MuiDataGrid-filler, & .MuiDataGrid-scrollbarFiller--header': {
              bgcolor: 'background.default'
            },
            '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 600, fontSize: '0.8125rem' },
            '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center', fontSize: '0.875rem' }
          }}
        />
      </Box>
    </Stack>
  );
}
