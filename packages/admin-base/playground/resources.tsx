import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import PermMediaOutlinedIcon from '@mui/icons-material/PermMediaOutlined';
import SyncOutlinedIcon from '@mui/icons-material/SyncOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import { Box, Chip } from '@mui/material';
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
    { name: 'deepDiveDailyUsed', kind: 'number', readonly: true, list: true, sortable: false }
  ]
});

export const mediaSchema = defineResourceSchema({
  schemaVersion: 1,
  name: 'media',
  endpoint: '/api/media/admin',
  menu: { order: 4 },
  operations: ['delete'],
  fields: [
    { name: 'fileName', kind: 'string', readonly: true, list: true, filter: 'regex' },
    { name: 'mediaType', kind: 'enum', options: ['photo', 'video'], readonly: true, list: true, filter: 'enum' },
    { name: 'comment', kind: 'string', nullable: true, list: true },
    { name: 'createdAt', kind: 'datetime', readonly: true, list: true }
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
    },
    {
      id: 'expire-filtered',
      label: 'Filtrelenenleri sonlandır',
      placement: 'toolbar',
      // Yalnızca durum filtresi uygulanmışken görünür.
      visible: ({ listBody }) => Boolean(listBody.filters?.status),
      confirm: { title: 'Filtrelenen abonelikler sonlandırılsın mı?' },
      run: ({ listBody }) => console.info('[playground] sonlandır', listBody.filters)
    },
    {
      id: 'resync',
      label: 'Sağlayıcıyla eşitle',
      icon: <SyncOutlinedIcon fontSize='small' />,
      placement: 'detail',
      run: ({ row }) => console.info('[playground] eşitle', row.id)
    }
  ],
  fields: {
    status: { cell: ({ row }) => <Chip size='small' label={row.status} color={statusColor[row.status]} /> },
    // Seçenekler "BE'den" gelir (gecikmeli).
    provider: {
      loadOptions: () => new Promise(resolve => setTimeout(() => resolve(['none', 'revenuecat', 'manual']), 300))
    }
  },
  detail: {
    component: ({ row }) => (
      <Box sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1, fontSize: '0.8125rem' }}>
        Ek içerik (detail.component): {String(row.id)}
      </Box>
    )
  }
});

export const usersResource = extendResource(usersSchema, {
  icon: PeopleOutlineIcon,
  // Detayda kullanıcının abonelikleri; `grant-premium` satır aksiyonu orada da çalışır.
  detail: {
    related: [{ resource: 'user-subscriptions', filters: row => ({ userId: row.id }), fields: ['subscriptionId', 'status', 'currentPeriodEnd'], pageSize: 5 }]
  }
});

/** Dosya yükleme (toolbar action, `kind: 'file'` → multipart) ve imzalı adresle önizleme (`fields.<ad>.file`). */
export const mediaResource = extendResource(mediaSchema, {
  icon: PermMediaOutlinedIcon,
  actions: [
    {
      id: 'upload',
      label: 'Medya yükle',
      icon: <CloudUploadOutlinedIcon fontSize='small' />,
      placement: 'toolbar',
      input: [
        { name: 'file', kind: 'file', label: 'Dosya', accept: 'image/*,video/*', required: true },
        { name: 'comment', kind: 'string', label: 'Yorum' }
      ]
    }
  ],
  fields: {
    fileName: { file: { thumbnailVariant: 'thumb', openVariant: 'original', hasThumbnail: row => row.mediaType === 'photo' } }
  },
  detail: true
});

export const resources: AnyResource[] = [usersResource, subscriptionsSchema, userSubscriptionsResource, mediaResource];

/** Host'un i18n'i; bulunmayan anahtarlar paketin varsayılanına düşer. */
export const translations: Record<string, string> = {
  'admin.users.title': 'Kullanıcılar',
  'admin.subscriptions.title': 'Abonelik paketleri',
  'admin.media.title': 'Medya',
  'admin.user-subscriptions.title': 'Kullanıcı abonelikleri',
  'admin.user-subscriptions.fields.userId': 'Kullanıcı',
  'admin.user-subscriptions.fields.subscriptionId': 'Paket',
  'admin.user-subscriptions.fields.status': 'Durum',
  'admin.user-subscriptions.fields.willRenew': 'Otomatik yenileme',
  'admin.user-subscriptions.fields.currentPeriodEnd': 'Dönem sonu',
  'admin.user-subscriptions.enums.status.grace_period': 'Ek süre'
};
