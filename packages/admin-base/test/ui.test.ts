import { describe, expect, it } from 'vitest';
import {
  buildListFilters,
  createAdminRoutes,
  formValuesToBody,
  humanize,
  initialFormValues,
  isFieldVisible,
  validateField,
  type AnyResource,
  type FieldConfig
} from '../src/index.js';
import { usersSchema, userSubscriptionsSchema } from './fixtures.js';

describe('buildListFilters', () => {
  const fields: readonly FieldConfig[] = [
    { name: 'email', kind: 'string', filter: 'regex' },
    { name: 'status', kind: 'enum', options: ['active'], filter: 'enum' },
    { name: 'willRenew', kind: 'boolean', filter: 'boolean' },
    { name: 'sortOrder', kind: 'number', filter: 'range' },
    { name: 'currentPeriodEnd', kind: 'datetime', filter: 'date-range' },
    { name: 'userId', kind: 'relation', ref: 'users', filter: 'relation' }
  ];

  it('boşları düşürür, değerleri sözleşme şekline çevirir', () => {
    const draft = {
      id: '  ',
      email: '  ata ',
      status: '',
      willRenew: 'false',
      sortOrder: { min: '2', max: '' },
      currentPeriodEnd: { from: '2026-10-01T10:00:00Z' },
      userId: { id: 'u1', email: 'a@b.c' }
    };
    expect(buildListFilters(fields, draft)).toEqual({
      email: 'ata',
      willRenew: false,
      sortOrder: { min: 2 },
      currentPeriodEnd: { from: '2026-10-01' },
      userId: 'u1'
    });
  });

  it('id filtresi', () => {
    expect(buildListFilters(fields, { id: ' abc ' })).toEqual({ id: 'abc' });
  });
});

describe('form değerleri', () => {
  it('create: default değerleri kullanır, readonly / hideOnCreate gizlidir', () => {
    const values = initialFormValues(userSubscriptionsSchema.fields, 'create');
    expect(values).toMatchObject({ userId: null, status: '', currentPeriodEnd: null });
    const readonly = userSubscriptionsSchema.fields.find(f => f.name === 'deepDiveDailyUsed')!;
    expect(isFieldVisible(readonly, 'create')).toBe(false);
    expect(isFieldVisible(readonly, 'edit')).toBe(true);
  });

  it('edit: tüm form gider; readonly ve şema dışı alanlar düşer, ilişki id\'ye iner', () => {
    const row = {
      id: 'sub1',
      createdAt: '2026-10-16T00:00:00Z',
      userId: { id: 'u1', email: 'a@b.c' },
      status: 'active',
      currentPeriodEnd: null,
      deepDiveDailyUsed: 3
    };
    const values = initialFormValues(userSubscriptionsSchema.fields, 'edit', row);
    expect(formValuesToBody(userSubscriptionsSchema.fields, values, 'edit')).toEqual({
      userId: 'u1',
      status: 'active',
      currentPeriodEnd: null
    });
  });

  it('decimal virgülü noktaya çevrilir, number string\'den sayıya, nested obje temizlenir', () => {
    const fields: readonly FieldConfig[] = [
      { name: 'price', kind: 'decimal', required: true },
      { name: 'sortOrder', kind: 'number' },
      { name: 'note', kind: 'string' },
      { name: 'limits', kind: 'object', fields: [{ name: 'watchList', kind: 'number' }] }
    ];
    const body = formValuesToBody(fields, { price: ' 12,5 ', sortOrder: '3', note: '', limits: { watchList: '100' } }, 'create');
    expect(body).toEqual({ price: '12.5', sortOrder: 3, limits: { watchList: 100 } });
  });
});

describe('validateField', () => {
  it('zorunlu, sayı, decimal ve tarih kuralları', () => {
    expect(validateField({ name: 'a', kind: 'string', required: true }, '')).toBe('required');
    expect(validateField({ name: 'a', kind: 'boolean', required: true }, false)).toBe(true);
    expect(validateField({ name: 'a', kind: 'number' }, 'x')).toBe('invalidNumber');
    expect(validateField({ name: 'a', kind: 'decimal' }, '12,50')).toBe(true);
    expect(validateField({ name: 'a', kind: 'decimal' }, '12.5.1')).toBe('invalidDecimal');
    expect(validateField({ name: 'a', kind: 'datetime' }, 'not-a-date')).toBe('invalidDate');
    expect(validateField({ name: 'a', kind: 'string', isArray: true, required: true }, [])).toBe('required');
  });
});

describe('createAdminRoutes', () => {
  it('menü sırasına göre dizer, path ve i18n anahtarı üretir', () => {
    const resources: AnyResource[] = [
      { ...userSubscriptionsSchema, menu: { order: 2 } },
      { ...usersSchema, menu: { order: 1 }, path: 'kullanicilar' }
    ];
    const routes = createAdminRoutes(resources, { basePath: '/admin/' });
    expect(routes.map(r => [r.id, r.path, r.text])).toEqual([
      ['admin:users', '/admin/kullanicilar', 'admin.users.title'],
      ['admin:user-subscriptions', '/admin/user-subscriptions', 'admin.user-subscriptions.title']
    ]);
  });
});

describe('humanize', () => {
  it('camelCase ve kebab-case', () => {
    expect(humanize('currentPeriodEnd')).toBe('Current period end');
    expect(humanize('user-subscriptions')).toBe('User subscriptions');
  });
});

describe('json alanı', () => {
  const fields: readonly FieldConfig[] = [{ name: 'meta', kind: 'json', nullable: true }];

  it('edit\'te satır değeri JSON metni olur, gönderirken parse edilir', () => {
    const values = initialFormValues(fields, 'edit', { meta: { a: 1, b: [true] } });
    expect(values.meta).toBe(JSON.stringify({ a: 1, b: [true] }, null, 2));
    expect(formValuesToBody(fields, values, 'edit')).toEqual({ meta: { a: 1, b: [true] } });
  });

  it('boş metin nullable alanda null gider; geçersiz JSON doğrulamada yakalanır', () => {
    expect(formValuesToBody(fields, { meta: '' }, 'create')).toEqual({ meta: null });
    expect(validateField(fields[0]!, '{ a: 1 }')).toBe('invalidJson');
    expect(validateField(fields[0]!, '{"a":1}')).toBe(true);
  });
});

describe('dinamik varsayılanlar', () => {
  const fields: readonly FieldConfig[] = [
    { name: 'startedAt', kind: 'datetime', default: { dynamic: 'now' } },
    { name: 'code', kind: 'string', default: { dynamic: 'uuid' } },
    { name: 'userId', kind: 'relation', ref: 'users', default: { dynamic: 'currentUserId' } },
    { name: 'status', kind: 'string', default: 'draft' }
  ];

  it('create formu açılırken hesaplanır; sabit varsayılan olduğu gibi kalır', () => {
    const before = Date.now();
    const values = initialFormValues(fields, 'create', undefined, { getCurrentUserId: () => 'u-42' });
    expect(Date.parse(String(values.startedAt))).toBeGreaterThanOrEqual(before - 1);
    expect(String(values.code)).toMatch(/^[0-9a-f-]{36}$/);
    expect(values.userId).toBe('u-42');
    expect(values.status).toBe('draft');
  });

  it('kullanıcı id kaynağı yoksa alan boş kalır; edit\'te satır verisi geçerlidir', () => {
    expect(initialFormValues(fields, 'create').userId).toBeNull();
    expect(initialFormValues(fields, 'edit', { code: 'abc' }).code).toBe('abc');
  });
});
