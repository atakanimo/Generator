import type { GridLocaleText } from '@mui/x-data-grid';
import { trTR } from '@mui/x-data-grid/locales';
import { useMemo } from 'react';
import { useAdminTexts } from '../useAdminTexts.js';

/** Hücre içeriği hücreyi doldursun (Autocomplete, Select, buton grubu): kolonda `cellClassName`. */
export const ATA_GRID_CELL_FILL = 'ata-grid-cell-fill';

/**
 * Paket ızgaralarının ortak görünümü: kenarlık, kâğıt zemin, sayfa zemininde başlık,
 * yarı kalın 13px başlık, ortalanmış 14px hücre. Yerleşim (flex/height) çağırana aittir.
 */
export const ataGridSx = {
  border: 1,
  borderColor: 'divider',
  borderRadius: 1,
  bgcolor: 'background.paper',
  '& .MuiDataGrid-columnHeader, & .MuiDataGrid-filler, & .MuiDataGrid-scrollbarFiller--header': {
    bgcolor: 'background.default'
  },
  '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 600, fontSize: '0.8125rem' },
  '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center', fontSize: '0.875rem' },
  [`& .${ATA_GRID_CELL_FILL}`]: {
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    '& > *': { flex: 1, minWidth: 0, width: '100%' }
  }
} as const;

/** trTR + paket metinleri (boş tablo, sayfa başına satır, gösterilen aralık). */
export function useAtaGridLocaleText(loading = false): Partial<GridLocaleText> {
  const { text } = useAdminTexts();
  return useMemo(
    () => ({
      ...trTR.components.MuiDataGrid.defaultProps.localeText,
      noRowsLabel: loading ? '' : text('noRows'),
      paginationRowsPerPage: text('rowsPerPage'),
      paginationDisplayedRows: ({ from, to, count }) =>
        text('displayedRows', { from, to, count: count === -1 ? '?' : count })
    }),
    [loading, text]
  );
}
