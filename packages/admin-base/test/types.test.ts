import { describe, expectTypeOf, it } from 'vitest';
import {
  extendResource,
  type AnyResource,
  type Id,
  type InferResourceFilters,
  type InferRow,
  type PopulatedRef
} from '../src/index.js';
import { usersSchema, userSubscriptionsSchema } from './fixtures.js';

type Row = InferRow<typeof userSubscriptionsSchema>;

describe('tip çıkarımı (tsc tarafından doğrulanır)', () => {
  it('InferRow alan tiplerini çıkarır', () => {
    expectTypeOf<Row['id']>().toEqualTypeOf<Id>();
    expectTypeOf<Row['status']>().toEqualTypeOf<'active' | 'canceled' | 'expired' | 'grace_period' | 'billing_retry'>();
    expectTypeOf<Row['userId']>().toEqualTypeOf<Id | PopulatedRef<'email'>>();
    expectTypeOf<Row['currentPeriodEnd']>().toEqualTypeOf<string | null | undefined>();
    expectTypeOf<Row['deepDiveDailyUsed']>().toEqualTypeOf<number>();
  });

  it('filtre tipleri yalnızca filter tanımlı alanları içerir', () => {
    type Filters = InferResourceFilters<typeof userSubscriptionsSchema>;
    expectTypeOf<Filters['status']>().toEqualTypeOf<Row['status'] | Row['status'][] | undefined>();
    expectTypeOf<Filters>().not.toHaveProperty('deepDiveDailyUsed');
  });

  it('extendResource satırı tipli verir ve registry\'ye girer', () => {
    const resource = extendResource(userSubscriptionsSchema, {
      actions: [
        {
          id: 'grant-premium',
          label: 'Premium yap',
          placement: 'row',
          visible: row => row.status !== 'active',
          input: [{ name: 'days', kind: 'number', required: true }]
        }
      ]
    });
    const registry: AnyResource[] = [usersSchema, resource];
    expectTypeOf(registry).toEqualTypeOf<AnyResource[]>();
  });
});
