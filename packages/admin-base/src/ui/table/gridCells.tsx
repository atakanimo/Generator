import { Box } from '@mui/material';
import type { ReactNode } from 'react';
import { RowActionIcon, rowActionsWidth } from '../actions/actions.js';

export interface GridRowButton {
  /** React key; verilmezse `title`. */
  key?: string;
  /** Tooltip ve aria-label. */
  title: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  hidden?: boolean;
}

export interface GridRowButtonsProps {
  buttons: GridRowButton[];
}

/**
 * `RecordTable` `renderActions` içeriği: resource sayfasındaki `RowActions` ile aynı ikon butonlar.
 * Tıklama satıra yayılmaz (`onRowClick` tetiklenmez).
 */
export function GridRowButtons({ buttons }: GridRowButtonsProps) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-start', width: '100%' }}>
      {buttons
        .filter(button => !button.hidden)
        .map(button => (
          <RowActionIcon
            key={button.key ?? button.title}
            title={button.title}
            icon={button.icon}
            onClick={button.onClick}
            disabled={button.disabled}
          />
        ))}
    </Box>
  );
}

export { rowActionsWidth };
