import { describe, expect, it } from 'vitest';
import { ATA_GRID_CELL_FILL, ataGridSx, rowActionsWidth } from '../src/index.js';

describe('ataGridSx', () => {
  it('resource sayfasıyla aynı kenarlık/zemin ve hücre doldurma sınıfı', () => {
    expect(ataGridSx).toMatchObject({ border: 1, borderColor: 'divider', bgcolor: 'background.paper' });
    expect(Object.keys(ataGridSx)).toContain(`& .${ATA_GRID_CELL_FILL}`);
    expect(ATA_GRID_CELL_FILL).toBe('ata-grid-cell-fill');
  });
});

describe('rowActionsWidth', () => {
  it('ikon başına 36px, en az 88px', () => {
    expect(rowActionsWidth(1)).toBe(88);
    expect(rowActionsWidth(2)).toBe(92);
    expect(rowActionsWidth(3)).toBe(128);
  });
});
