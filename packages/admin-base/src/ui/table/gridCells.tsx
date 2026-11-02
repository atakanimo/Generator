import { Button, Chip, Stack, Tooltip, type ButtonProps, type ChipProps } from '@mui/material';
import type { GridColDef, GridValidRowModel } from '@mui/x-data-grid';
import type { MouseEvent, ReactNode } from 'react';
import { formatDateTime, isEmptyValue } from '../format.js';

/** Boş hücre metni varsayılanı (paket hücreleriyle aynı). */
export const ATA_EMPTY_CELL = '–';

// ---------------------------------------------------------------------------
// Satır butonları
// ---------------------------------------------------------------------------

export interface GridRowButton {
  /** React key; verilmezse sıra. */
  key?: string;
  label: ReactNode;
  onClick: () => void;
  color?: ButtonProps['color'];
  variant?: ButtonProps['variant'];
  disabled?: boolean;
  /** Pasif butonda da görünür (span sarmalı). */
  tooltip?: ReactNode;
  startIcon?: ReactNode;
  sx?: ButtonProps['sx'];
  hidden?: boolean;
}

export interface GridRowButtonsProps {
  buttons: GridRowButton[];
  size?: ButtonProps['size'];
}

const stop = (event: MouseEvent) => event.stopPropagation();

/**
 * Aksiyon kolonu için buton grubu. Tıklama satıra yayılmaz (`onRowClick` tetiklenmez).
 * Resource sayfasındaki `RowActions`'tan bağımsızdır: yalnız verilen butonları çizer.
 */
export function GridRowButtons({ buttons, size = 'small' }: GridRowButtonsProps) {
  return (
    <Stack direction='row' spacing={1} alignItems='center' onClick={stop} onDoubleClick={stop} sx={{ minWidth: 0 }}>
      {buttons
        .filter(button => !button.hidden)
        .map((button, index) => {
          const node = (
            <Button
              size={size}
              color={button.color}
              variant={button.variant ?? 'text'}
              disabled={button.disabled}
              startIcon={button.startIcon}
              onClick={button.onClick}
              sx={button.sx}
            >
              {button.label}
            </Button>
          );
          const key = button.key ?? String(index);
          return button.tooltip ? (
            <Tooltip key={key} title={button.tooltip}>
              <span>{node}</span>
            </Tooltip>
          ) : (
            <span key={key}>{node}</span>
          );
        })}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Durum çipi
// ---------------------------------------------------------------------------

export interface StatusChipOption {
  label: ReactNode;
  color?: ChipProps['color'];
  variant?: ChipProps['variant'];
}

export type StatusChipMap = Record<string, StatusChipOption>;

/** Değer → seçenek; haritada yoksa `fallback`, o da yoksa değerin kendisi (boşsa null). */
export function resolveStatusChip(value: unknown, map: StatusChipMap, fallback?: StatusChipOption): StatusChipOption | null {
  if (!isEmptyValue(value)) {
    const hit = map[String(value)];
    if (hit) return hit;
  }
  if (fallback) return fallback;
  return isEmptyValue(value) ? null : { label: String(value), color: 'default' };
}

export interface StatusChipProps {
  value: unknown;
  map: StatusChipMap;
  fallback?: StatusChipOption;
  size?: ChipProps['size'];
}

export function StatusChip({ value, map, fallback, size = 'small' }: StatusChipProps) {
  const option = resolveStatusChip(value, map, fallback);
  if (!option) return null;
  return <Chip size={size} label={option.label} color={option.color ?? 'default'} variant={option.variant ?? 'outlined'} />;
}

// ---------------------------------------------------------------------------
// Kolon yardımcıları
// ---------------------------------------------------------------------------

function toFiniteNumber(value: unknown): number | null {
  if (isEmptyValue(value) || typeof value === 'boolean') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export interface NumberCellOptions {
  /** Ondalık basamak; verilmezse sayı olduğu gibi. */
  digits?: number;
  /** Özel biçim (ör. `toLocaleString`); `digits`'in önüne geçer. */
  format?: (value: number) => string;
  empty?: string;
}

export function formatNumberCell(value: unknown, { digits, format, empty = ATA_EMPTY_CELL }: NumberCellOptions = {}): string {
  const n = toFiniteNumber(value);
  if (n == null) return empty;
  if (format) return format(n);
  return digits != null ? n.toFixed(digits) : String(n);
}

export interface PercentCellOptions {
  /** Varsayılan 1. */
  digits?: number;
  /** `true` (varsayılan): değer oran (0.12 → %12); `false`: değer zaten yüzde. */
  ratio?: boolean;
  empty?: string;
}

export function formatPercentCell(value: unknown, { digits = 1, ratio = true, empty = ATA_EMPTY_CELL }: PercentCellOptions = {}): string {
  const n = toFiniteNumber(value);
  if (n == null) return empty;
  return `${(ratio ? n * 100 : n).toFixed(digits)}%`;
}

export function formatDateTimeCell(value: unknown, empty: string = ATA_EMPTY_CELL): string {
  return formatDateTime(value) || empty;
}

/** Kolon tanımının geri kalanı; `field` ilk argümandır. */
export type ColumnOverrides<T extends GridValidRowModel> = Omit<GridColDef<T>, 'field'>;

/** Sağa yaslı sayı kolonu (`type: 'number'`, düzenlemede sayı girişi). */
export function numberColumn<T extends GridValidRowModel = GridValidRowModel>(
  field: string,
  options: NumberCellOptions & ColumnOverrides<T> = {}
): GridColDef<T> {
  const { digits, format, empty, ...col } = options;
  return {
    type: 'number',
    width: 110,
    valueFormatter: (value: unknown) => formatNumberCell(value, { digits, format, empty }),
    ...col,
    field
  } as GridColDef<T>;
}

export function percentColumn<T extends GridValidRowModel = GridValidRowModel>(
  field: string,
  options: PercentCellOptions & ColumnOverrides<T> = {}
): GridColDef<T> {
  const { digits, ratio, empty, ...col } = options;
  return {
    type: 'number',
    width: 90,
    valueFormatter: (value: unknown) => formatPercentCell(value, { digits, ratio, empty }),
    ...col,
    field
  } as GridColDef<T>;
}

/** `DD.MM.YYYY HH:mm`; boş/geçersiz değer `empty`. */
export function dateTimeColumn<T extends GridValidRowModel = GridValidRowModel>(
  field: string,
  options: { empty?: string } & ColumnOverrides<T> = {}
): GridColDef<T> {
  const { empty, ...col } = options;
  return {
    width: 160,
    valueFormatter: (value: unknown) => formatDateTimeCell(value, empty),
    ...col,
    field
  } as GridColDef<T>;
}
