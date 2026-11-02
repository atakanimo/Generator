import { describe, expect, it } from 'vitest';
import {
  ATA_EMPTY_CELL,
  ATA_GRID_CELL_FILL,
  ataGridSx,
  dateTimeColumn,
  formatDateTimeCell,
  formatNumberCell,
  formatPercentCell,
  numberColumn,
  percentColumn,
  resolveStatusChip
} from '../src/index.js';

type Fmt = (value: unknown, row?: unknown, col?: unknown, api?: unknown) => string;
const fmt = (col: { valueFormatter?: unknown }) => col.valueFormatter as Fmt;

describe('formatNumberCell', () => {
  it('boş, NaN ve sonsuz değerleri boş metne çevirir', () => {
    for (const v of [null, undefined, '', Number.NaN, Infinity, 'abc', true]) expect(formatNumberCell(v)).toBe(ATA_EMPTY_CELL);
    expect(formatNumberCell(null, { empty: '—' })).toBe('—');
  });
  it('digits ve özel format', () => {
    expect(formatNumberCell(12.3456, { digits: 2 })).toBe('12.35');
    expect(formatNumberCell('7.5')).toBe('7.5');
    expect(formatNumberCell(0)).toBe('0');
    expect(formatNumberCell(1234, { digits: 1, format: n => `#${n}` })).toBe('#1234');
  });
});

describe('formatPercentCell', () => {
  it('oran varsayılan, 1 basamak', () => {
    expect(formatPercentCell(0.1234)).toBe('12.3%');
    expect(formatPercentCell(-0.5, { digits: 0 })).toBe('-50%');
  });
  it('ratio=false değeri yüzde kabul eder; boş değer', () => {
    expect(formatPercentCell(12.34, { ratio: false, digits: 2 })).toBe('12.34%');
    expect(formatPercentCell(undefined, { empty: '—' })).toBe('—');
  });
});

describe('formatDateTimeCell', () => {
  it('tarih biçimi ve boş değer', () => {
    expect(formatDateTimeCell('2026-10-16T09:05:00')).toBe('16.10.2026 09:05');
    expect(formatDateTimeCell(null)).toBe(ATA_EMPTY_CELL);
    expect(formatDateTimeCell('', 'yok')).toBe('yok');
  });
});

describe('kolon yardımcıları', () => {
  it('numberColumn: number tipi, varsayılan genişlik, override ve formatter', () => {
    const col = numberColumn('close', { digits: 2, headerName: 'Close', editable: true, width: 90 });
    expect(col).toMatchObject({ field: 'close', type: 'number', headerName: 'Close', editable: true, width: 90 });
    expect(fmt(col)(3.14159)).toBe('3.14');
    expect(fmt(col)(null)).toBe(ATA_EMPTY_CELL);
    expect(numberColumn('v').width).toBe(110);
  });
  it('percentColumn ve dateTimeColumn', () => {
    expect(fmt(percentColumn('jump', { empty: '—' }))(0.05)).toBe('5.0%');
    expect(fmt(percentColumn('jump', { empty: '—' }))(null)).toBe('—');
    const dt = dateTimeColumn('at', { headerName: 'At' });
    expect(dt).toMatchObject({ field: 'at', width: 160, headerName: 'At' });
    expect(fmt(dt)('2026-01-02T03:04:00')).toBe('02.01.2026 03:04');
  });
  it('override valueFormatter yardımcının yerine geçer', () => {
    const col = numberColumn('x', { valueFormatter: () => 'custom' });
    expect(fmt(col)(1)).toBe('custom');
  });
});

describe('resolveStatusChip', () => {
  const map = { updated: { label: 'Güncel', color: 'success' as const } };
  it('haritadaki değer', () => {
    expect(resolveStatusChip('updated', map)).toEqual(map.updated);
  });
  it('haritada yoksa fallback, o da yoksa ham değer; boşsa null', () => {
    expect(resolveStatusChip('open', map, { label: 'Açık', color: 'warning' })).toEqual({ label: 'Açık', color: 'warning' });
    expect(resolveStatusChip('open', map)).toEqual({ label: 'open', color: 'default' });
    expect(resolveStatusChip(null, map)).toBeNull();
    expect(resolveStatusChip('', map, { label: '?' })).toEqual({ label: '?' });
  });
});

describe('ataGridSx', () => {
  it('ortak görünüm kuralları ve hücre doldurma sınıfı', () => {
    expect(ataGridSx).toMatchObject({ border: 1, borderColor: 'divider', bgcolor: 'background.paper' });
    expect(Object.keys(ataGridSx)).toContain(`& .${ATA_GRID_CELL_FILL}`);
    expect(ATA_GRID_CELL_FILL).toBe('ata-grid-cell-fill');
  });
});
