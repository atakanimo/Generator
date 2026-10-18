import { describe, expect, it } from 'vitest';
import { valueSummary } from '../src/ui/format.js';

const items = (count: number) => `${count} öğe`;

describe('valueSummary', () => {
  it('obje: ilk alanlar, boşları atlar, iç içe kısaltılır', () => {
    expect(valueSummary({ tr: 'Altın', en: '', meta: { a: 1 }, tags: [1, 2], x: 1 }, items)).toBe('tr: Altın, meta: {…}, tags: [2], …');
  });
  it('dizi: öğe sayısı + ilk öğe özeti', () => {
    expect(valueSummary([{ symbol: 'XAU', amount: 2, cost: 3 }, {}], items)).toBe('2 öğe · symbol: XAU, amount: 2, …');
    expect(valueSummary(['a', 'b'], items)).toBe('2 öğe · a');
  });
});
