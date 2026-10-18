import { defineResourceSchema } from '../src/index.js';

/** Varlik360 `users` modelinin sadeleştirilmiş hali. */
export const usersSchema = defineResourceSchema({
  schemaVersion: 1,
  name: 'users',
  endpoint: '/api/users/admin',
  fields: [
    { name: 'email', kind: 'string', required: true, list: true, filter: 'regex' },
    { name: 'role', kind: 'enum', options: ['admin', 'user'], filter: 'enum' }
  ]
});

/** Varlik360 `user-subscriptions` modelinin sadeleştirilmiş hali. */
export const userSubscriptionsSchema = defineResourceSchema({
  schemaVersion: 1,
  name: 'user-subscriptions',
  endpoint: '/api/userSubscriptions/admin',
  fields: [
    {
      name: 'userId',
      kind: 'relation',
      ref: 'users',
      display: 'email',
      populate: ['email'],
      required: true,
      list: true,
      filter: 'relation'
    },
    {
      name: 'status',
      kind: 'enum',
      options: ['active', 'canceled', 'expired', 'grace_period', 'billing_retry'],
      required: true,
      list: true,
      filter: 'enum'
    },
    { name: 'currentPeriodEnd', kind: 'datetime', nullable: true, list: true, filter: 'date-range' },
    { name: 'deepDiveDailyUsed', kind: 'number', required: true, readonly: true }
  ]
});
