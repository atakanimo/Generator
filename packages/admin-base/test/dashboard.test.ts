import { describe, expect, it } from 'vitest';
import { groupDashboardGraphs } from '../src/ui/dashboard/layout.js';

describe('groupDashboardGraphs', () => {
  it('boş dizide bölüm çizmez', () => {
    expect(groupDashboardGraphs([])).toEqual([]);
  });

  it('fullWidth olmayanları aynı satırda eşit böler', () => {
    const rows = groupDashboardGraphs([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(rows).toEqual([[{ id: 'a' }, { id: 'b' }, { id: 'c' }]]);
  });

  it('fullWidth kendi satırını alır ve grubu böler', () => {
    const rows = groupDashboardGraphs([
      { id: 'wide', fullWidth: true },
      { id: 'a' },
      { id: 'b' },
      { id: 'wide2', fullWidth: true }
    ]);
    expect(rows).toEqual([[{ id: 'wide', fullWidth: true }], [{ id: 'a' }, { id: 'b' }], [{ id: 'wide2', fullWidth: true }]]);
  });
});
