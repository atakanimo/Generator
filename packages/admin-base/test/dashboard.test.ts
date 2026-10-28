import { describe, expect, it } from 'vitest';
import { groupDashboardGraphs } from '../src/ui/dashboard/layout.js';

describe('groupDashboardGraphs', () => {
  it('boş dizide bölüm çizmez', () => {
    expect(groupDashboardGraphs([])).toEqual([]);
  });

  it('fullWidth olmayanları aynı satırda eşit böler', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(groupDashboardGraphs(items)).toEqual([items]);
  });

  it('fullWidth kendi satırını alır ve grubu böler', () => {
    const wide = { id: 'wide', fullWidth: true };
    const a = { id: 'a' };
    const b = { id: 'b' };
    const wide2 = { id: 'wide2', fullWidth: true };
    expect(groupDashboardGraphs([wide, a, b, wide2])).toEqual([[wide], [a, b], [wide2]]);
  });
});
