import { describe, expect, it } from 'vitest';
import { canSearchRelation, recordTitle, relationId, relationLabel, toWriteBody } from '../src/index.js';
import { usersSchema, userSubscriptionsSchema } from './fixtures.js';

describe('toWriteBody', () => {
  it('şema dışı anahtarları düşürür, ilişkiyi id\'ye indirir', () => {
    const row = {
      id: 'sub1',
      createdAt: '2026-10-16T00:00:00Z',
      userId: { id: 'u1', email: 'a@b.c' },
      status: 'active',
      deepDiveDailyUsed: 3
    };
    expect(toWriteBody(userSubscriptionsSchema.fields, row, 'update')).toEqual({
      userId: 'u1',
      status: 'active'
    });
  });

  it('nested obje içindeki ilişkiyi de indirir', () => {
    const fields = [
      {
        name: 'items',
        kind: 'object',
        isArray: true,
        fields: [{ name: 'symbolTypeId', kind: 'relation', ref: 'symbol-types' }]
      }
    ] as const;
    const data = { items: [{ symbolTypeId: { id: 's1' }, id: 'sub' }] };
    expect(toWriteBody(fields, data, 'create')).toEqual({ items: [{ symbolTypeId: 's1' }] });
  });
});

describe('relation helpers', () => {
  it('relationId', () => {
    expect(relationId('u1')).toBe('u1');
    expect(relationId({ id: 'u1', email: 'x' })).toBe('u1');
  });

  it('relationLabel', () => {
    expect(relationLabel({ id: 'u1', email: 'a@b.c' }, { display: 'email' })).toBe('a@b.c');
    expect(relationLabel({ id: 's1', name: { tr: 'Altın', en: 'Gold' } }, { display: 'name' })).toBe('Altın / Gold');
    expect(relationLabel('u1', { display: 'email' })).toBe('u1');
  });

  it('canSearchRelation: hedefte string + regex filtre gerekir', () => {
    const userField = userSubscriptionsSchema.fields[0];
    expect(canSearchRelation(userField, usersSchema)).toBe(true);
    expect(canSearchRelation({ ...userField, display: 'role' }, usersSchema)).toBe(false);
    expect(canSearchRelation(userField, undefined)).toBe(false);
  });
});

describe('recordTitle', () => {
  it('reads the titleField value for the delete confirmation', () => {
    expect(recordTitle({ titleField: 'ticker' }, { id: '1', ticker: ' AAPL ' })).toBe('AAPL');
    expect(recordTitle({ titleField: 'order' }, { id: '1', order: 3 })).toBe('3');
  });

  it('falls back when there is no usable title', () => {
    expect(recordTitle({}, { id: '1', name: 'x' })).toBeUndefined();
    expect(recordTitle({ titleField: 'name' }, { id: '1', name: '  ' })).toBeUndefined();
    expect(recordTitle({ titleField: 'meta' }, { id: '1', meta: { a: 1 } })).toBeUndefined();
  });
});
