import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import { Chip } from '@mui/material';
import { defineResourceSchema, extendResource, type AnyResource } from '../src/index.js';

// --- <m>.generated.config.ts (Generator'ın yazacağı) -------------------------------------

export const usersSchema = defineResourceSchema({
  schemaVersion: 1,
  name: 'users',
  endpoint: '/api/users/admin',
  menu: { order: 1 },
  fields: [
    { name: 'email', kind: 'string', required: true, list: true, filter: 'regex' },
    { name: 'name', kind: 'string', list: true, filter: 'regex' },
    { name: 'role', kind: 'enum', options: ['admin', 'user'], required: true, list: true, filter: 'enum' },
    { name: 'avatarUrl', kind: 'string', component: 'image', list: true },
    { name: 'settings', kind: 'json', nullable: true, list: true },
    { name: 'inviteCode', kind: 'string', default: { dynamic: 'uuid' } },
    { name: 'invitedBy', kind: 'relation', ref: 'users', display: 'email', populate: ['email'], default: { dynamic: 'currentUserId' } },
    { name: 'createdAt', kind: 'datetime', list: true, readonly: true, filter: 'date-range' }
  ]
});

export const subscriptionsSchema = defineResourceSchema({
  schemaVersion: 1,
  name: 'subscriptions',
  endpoint: '/api/subscriptions/admin',
  menu: { order: 2 },
  defaultSort: { field: 'sortOrder', order: 'asc' },
  fields: [
    { name: 'name', kind: 'string', required: true, list: true, filter: 'regex' },
    { name: 'price', kind: 'decimal', required: true, list: true },
    { name: 'sortOrder', kind: 'number', required: true, list: true, filter: 'range' },
    { name: 'features', kind: 'string', isArray: true, list: true },
    {
      name: 'limits',
      kind: 'object',
      typeName: 'ISubscriptionLimits',
      list: true,
      fields: [
        { name: 'dailyDeepDive', kind: 'number', required: true },
        { name: 'watchList', kind: 'number', required: true }
      ]
    }
  ]
});

export const userSubscriptionsSchema = defineResourceSchema({
  schemaVersion: 1,
  name: 'user-subscriptions',
  endpoint: '/api/userSubscriptions/admin',
  menu: { order: 3 },
  fields: [
    { name: 'userId', kind: 'relation', ref: 'users', display: 'email', populate: ['email'], required: true, list: true, filter: 'relation' },
    { name: 'subscriptionId', kind: 'relation', ref: 'subscriptions', display: 'name', populate: ['name'], required: true, list: true },
    { name: 'status', kind: 'enum', options: ['active', 'canceled', 'expired', 'grace_period', 'billing_retry'], required: true, list: true, filter: 'enum' },
    { name: 'provider', kind: 'enum', options: ['none', 'revenuecat', 'manual'], required: true, list: true, filter: 'enum', default: 'none' },
    { name: 'willRenew', kind: 'boolean', list: true, filter: 'boolean' },
    { name: 'currentPeriodEnd', kind: 'datetime', list: true, filter: 'date-range' },
    { name: 'deepDiveDailyUsed', kind: 'number', readonly: true, list: true }
  ]
});

// --- <m>.generated.ts (elle genişletilen) -------------------------------------------------

const statusColor = { active: 'success', grace_period: 'warning', billing_retry: 'warning', canceled: 'default', expired: 'default' } as const;

export const userSubscriptionsResource = extendResource(userSubscriptionsSchema, {
  icon: WorkspacePremiumOutlinedIcon,
  actions: [
    {
      id: 'grant-premium',
      label: 'Premium yap',
      icon: <WorkspacePremiumOutlinedIcon fontSize='small' />,
      placement: 'row',
      visible: row => row.status !== 'active',
      input: [{ name: 'days', kind: 'number', label: 'Süre (gün)', required: true, default: 30 }],
      confirm: { title: 'Kullanıcı premium yapılsın mı?' }
    },
    {
      id: 'export-csv',
      label: 'CSV indir',
      icon: <FileDownloadOutlinedIcon />,
      placement: 'toolbar',
      run: async ({ api, listBody }) => {
        const page = await api.list({ ...listBody, page: 1, limit: 100 });
        console.info('[playground] CSV satırları', page.items.length);
      }
    }
  ],
  fields: {
    status: { cell: ({ row }) => <Chip size='small' label={row.status} color={statusColor[row.status]} /> }
  }
});

export const usersResource = extendResource(usersSchema, { icon: PeopleOutlineIcon });

export const resources: AnyResource[] = [usersResource, subscriptionsSchema, userSubscriptionsResource];

/** Host'un i18n'i; bulunmayan anahtarlar paketin varsayılanına düşer. */
export const translations: Record<string, string> = {
  'admin.users.title': 'Kullanıcılar',
  'admin.subscriptions.title': 'Abonelik paketleri',
  'admin.user-subscriptions.title': 'Kullanıcı abonelikleri',
  'admin.user-subscriptions.fields.userId': 'Kullanıcı',
  'admin.user-subscriptions.fields.subscriptionId': 'Paket',
  'admin.user-subscriptions.fields.status': 'Durum',
  'admin.user-subscriptions.fields.willRenew': 'Otomatik yenileme',
  'admin.user-subscriptions.fields.currentPeriodEnd': 'Dönem sonu',
  'admin.user-subscriptions.enums.status.grace_period': 'Ek süre'
};
