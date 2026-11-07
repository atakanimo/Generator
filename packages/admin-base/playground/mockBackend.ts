/**
 * Playground için bellek içi BE: sözleşmedeki endpoint setini (§2) axios adapter'ı olarak uygular
 * ve host interceptor'ının (Varlik360 `api.ts`) davranışını taklit eder.
 */
import axios, { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import dayjs from 'dayjs';

type Doc = { id: string; createdAt: string; updatedAt: string } & Record<string, unknown>;

const now = dayjs('2026-10-16T09:00:00Z');
let seq = 1000;
const newId = () => (seq++).toString(16).padStart(24, '0');
const avatar = (color: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><circle cx='32' cy='32' r='32' fill='${color}'/></svg>`)}`;

const users: Doc[] = ['ayse@varlik.app', 'mehmet@varlik.app', 'zeynep@varlik.app', 'can@varlik.app', 'elif@varlik.app'].map(
  (email, i) => ({ id: newId(), email, name: email.split('@')[0], role: i === 0 ? 'admin' : 'user',
    avatarUrl: avatar(['#4f46e5', '#059669', '#d97706', '#dc2626', '#0891b2'][i]!),
    settings: i % 2 === 0 ? { theme: i === 0 ? 'dark' : 'light', notifications: { email: true, push: i > 1 } } : null,
    createdAt: now.subtract(i, 'day').toISOString(), updatedAt: now.toISOString() })
);

/** Playground'da oturum açmış kullanıcı (`getCurrentUserId`). */
export const currentUserId = String(users[0]!.id);

const subscriptions: Doc[] = [
  { name: 'Free', price: '0.00', sortOrder: 1, features: ['portfolio'], limits: { dailyDeepDive: 1, watchList: 10 } },
  { name: 'Premium', price: '149.90', sortOrder: 2, features: ['portfolio', 'deep-dive', 'alerts'], limits: { dailyDeepDive: 50, watchList: 500 } }
].map((s, i) => ({ id: newId(), ...s, createdAt: now.subtract(30 + i, 'day').toISOString(), updatedAt: now.toISOString() }));

const statuses = ['active', 'canceled', 'expired', 'grace_period', 'billing_retry'];
const userSubscriptions: Doc[] = Array.from({ length: 37 }, (_, i) => ({
  id: newId(),
  userId: users[i % users.length].id,
  subscriptionId: subscriptions[i % 2].id,
  status: statuses[i % statuses.length],
  provider: i % 3 === 0 ? 'manual' : 'revenuecat',
  willRenew: i % 2 === 0,
  currentPeriodEnd: now.add(i - 10, 'day').toISOString(),
  deepDiveDailyUsed: i % 4,
  createdAt: now.subtract(i, 'hour').toISOString(),
  updatedAt: now.toISOString()
}));

const photo = (color: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='120' height='80'><rect width='120' height='80' fill='${color}'/></svg>`)}`;
/** Dosyalar "depoda": `file-url` süreli adres yerine data URL döner. `brokenThumb` → küçük resim yüklenemez, orijinale düşülür. */
const media: Doc[] = [
  { fileName: 'gelin-masasi.jpg', mediaType: 'photo', color: '#f472b6' },
  { fileName: 'pasta.jpg', mediaType: 'photo', color: '#a78bfa', brokenThumb: true },
  { fileName: 'ilk-dans.mp4', mediaType: 'video', color: '#60a5fa' }
].map((m, i) => ({ id: newId(), ...m, createdAt: now.subtract(i, 'hour').toISOString(), updatedAt: now.toISOString() }));

const tables: Record<string, Doc[]> = { users, subscriptions, userSubscriptions, media };
/** Populate: `{ alan: [koleksiyon, select alanları] }`. */
const populate: Record<string, Record<string, [string, string[]]>> = {
  userSubscriptions: { userId: ['users', ['email']], subscriptionId: ['subscriptions', ['name']] }
};

function populated(table: string, doc: Doc): Doc {
  const out: Doc = { ...doc };
  for (const [field, [target, select]] of Object.entries(populate[table] ?? {})) {
    const ref = tables[target].find(d => d.id === doc[field]);
    if (ref) out[field] = { id: ref.id, ...Object.fromEntries(select.map(s => [s, ref[s]])) };
  }
  return out;
}

function matches(doc: Doc, filters: Record<string, unknown>): boolean {
  return Object.entries(filters).every(([key, cond]) => {
    const value = doc[key];
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      const c = cond as Record<string, string | number>;
      if ('from' in c || 'to' in c) {
        const d = dayjs(value as string);
        return (!c.from || !d.isBefore(dayjs(c.from).startOf('day'))) && (!c.to || d.isBefore(dayjs(c.to).add(1, 'day').startOf('day')));
      }
      return (c.min === undefined || Number(value) >= Number(c.min)) && (c.max === undefined || Number(value) <= Number(c.max));
    }
    if (Array.isArray(cond)) return cond.includes(value);
    if (typeof cond === 'string' && typeof value === 'string' && key !== 'id' && !key.endsWith('Id')) {
      return value.toLowerCase().includes(cond.toLowerCase());
    }
    return value === cond;
  });
}

const ok = (data: unknown, uiMessage = 'İşlem başarılı') => ({ status: 200, body: { isSuccess: true, data, uiMessage, errorData: null } });
const fail = (status: number, message: string) => ({ status, body: { isSuccess: false, data: null, uiMessage: null, errorData: { header: 'Hata', message, code: status } } });

function handle(method: string, url: string, body: Record<string, unknown>) {
  const [, table, ...rest] = url.split('?')[0].split('/').filter(Boolean); // /api/<table>/admin/...
  const docs = tables[table];
  if (!docs) return fail(404, `Bilinmeyen kaynak: ${table}`);
  const path = rest.slice(1); // 'admin' sonrası
  const find = (id: string) => docs.find(d => d.id === id);

  if (method === 'post' && path[0] === 'get-all') {
    const { filters = {}, page = 1, limit = 50, sortBy, sortOrder } = body as {
      filters?: Record<string, unknown>; page?: number; limit?: number; sortBy?: string; sortOrder?: 'asc' | 'desc';
    };
    const sorted = docs.filter(d => matches(d, filters)).sort((a, b) => {
      const key = sortBy ?? 'createdAt';
      const dir = (sortBy ? sortOrder : 'desc') === 'asc' ? 1 : -1;
      return String(a[key]).localeCompare(String(b[key]), 'tr', { numeric: true }) * dir;
    });
    const items = sorted.slice((page - 1) * limit, page * limit).map(d => populated(table, d));
    return ok({ items, total: sorted.length, hasMore: page * limit < sorted.length, currentPage: page, currentLimit: limit });
  }
  if (method === 'post' && path[0] === 'create') {
    const doc = { ...body, id: newId(), createdAt: dayjs().toISOString(), updatedAt: dayjs().toISOString() } as Doc;
    docs.unshift(doc);
    return ok(populated(table, doc), 'Kayıt oluşturuldu');
  }
  if (method === 'post' && path[0] === 'update') {
    const doc = find(path[1]);
    if (!doc) return fail(404, 'Kayıt bulunamadı');
    Object.assign(doc, body, { updatedAt: dayjs().toISOString() });
    return ok(populated(table, doc), 'Kayıt güncellendi');
  }
  if (method === 'post' && path[1] === 'actions' && path[2] === 'grant-premium') {
    const doc = find(path[0]);
    if (!doc) return fail(404, 'Kayıt bulunamadı');
    const days = Number(body.days);
    if (!Number.isFinite(days) || days <= 0) return fail(422, 'Gün sayısı pozitif olmalı');
    Object.assign(doc, { status: 'active', provider: 'manual', subscriptionId: subscriptions[1].id,
      currentPeriodEnd: dayjs().add(days, 'day').toISOString(), updatedAt: dayjs().toISOString() });
    return ok(populated(table, doc), `Kullanıcı ${days} gün premium yapıldı`);
  }
  if (method === 'post' && path[0] === 'actions' && path[1] === 'upload') {
    const file = body.file;
    if (!(file instanceof File)) return fail(422, 'Dosya gerekli');
    const doc = { id: newId(), fileName: file.name, mediaType: file.type.startsWith('image/') ? 'photo' : 'video',
      color: '#34d399', comment: body.comment ?? null, createdAt: dayjs().toISOString(), updatedAt: dayjs().toISOString() } as Doc;
    docs.unshift(doc);
    return ok(doc, `${file.name} yüklendi`);
  }
  if (method === 'get' && path[1] === 'file-url') {
    const doc = find(path[0]);
    if (!doc) return fail(404, 'Kayıt bulunamadı');
    const variant = new URLSearchParams(url.split('?')[1] ?? '').get('variant');
    return ok({ url: variant === 'thumb' && doc.brokenThumb ? 'data:image/png;base64,bozuk' : photo(String(doc.color)) });
  }
  if (method === 'get' && path.length === 1) {
    const doc = find(path[0]);
    return doc ? ok(populated(table, doc)) : fail(404, 'Kayıt bulunamadı');
  }
  if (method === 'delete' && path.length === 1) {
    const index = docs.findIndex(d => d.id === path[0]);
    if (index === -1) return fail(404, 'Kayıt bulunamadı');
    docs.splice(index, 1);
    return ok(null, 'Kayıt silindi');
  }
  return fail(404, `Endpoint yok: ${method.toUpperCase()} ${url}`);
}

const adapter: AxiosAdapter = async config => {
  await new Promise(resolve => setTimeout(resolve, 250));
  if (config.signal?.aborted) throw new axios.Cancel('canceled');
  const body =
    config.data instanceof FormData
      ? Object.fromEntries(config.data.entries())
      : typeof config.data === 'string' ? JSON.parse(config.data || '{}') : (config.data ?? {});
  const query = config.params ? `?${new URLSearchParams(config.params as Record<string, string>)}` : '';
  const { status, body: data } = handle(String(config.method), `${config.url}${query}`, body);
  const response: AxiosResponse = { data, status, statusText: String(status), headers: {}, config };
  if (status >= 400) throw new AxiosError(data.errorData?.message ?? 'error', String(status), config, null, response);
  return response;
};

export interface HostHooks {
  onLoading: (active: boolean) => void;
  onToast: (message: string, severity: 'success' | 'error') => void;
}

/** Host `api.ts`'inin sözleşme §7'ye göre düzeltilmiş hali. */
export function createHostApi({ onLoading, onToast }: HostHooks) {
  const api = axios.create({ baseURL: '', adapter, headers: { 'Content-Type': 'application/json' } });
  let active = 0;
  const done = (config?: InternalAxiosRequestConfig) => {
    if (config?.skipLoading) return;
    active = Math.max(0, active - 1);
    if (active === 0) onLoading(false);
  };

  api.interceptors.request.use(config => {
    console.info('[playground] →', config.method?.toUpperCase(), config.url, JSON.stringify(config.data ?? {}), {
      skipLoading: config.skipLoading, skipSuccessToast: config.skipSuccessToast
    });
    if (!config.skipLoading) {
      active++;
      onLoading(true);
    }
    return config;
  });

  api.interceptors.response.use(
    response => {
      done(response.config);
      const { data, uiMessage } = response.data;
      if (uiMessage && !response.config.skipSuccessToast && response.config.method !== 'get') onToast(uiMessage, 'success');
      return { isSuccess: true, uiMessage, data, errorData: null } as unknown as AxiosResponse;
    },
    (error: AxiosError<{ errorData?: { message?: string } }>) => {
      done(error.config);
      if (axios.isCancel(error)) return Promise.reject(error);
      const message = error.response?.data?.errorData?.message ?? 'ERR_NETWORK';
      onToast(message, 'error');
      return Promise.reject({ isSuccess: false, data: null, uiMessage: '', errorData: { header: '', message, code: error.response?.status } });
    }
  );
  return api;
}

/** Tablo örneği (`table.tsx`): userSubscriptions üzerinde sunucu sayfalama taklidi; populate yok. */
export function pageUserSubscriptions(page: number, pageSize: number): { items: Doc[]; total: number } {
  const start = page * pageSize;
  return { items: userSubscriptions.slice(start, start + pageSize).map(doc => ({ ...doc })), total: userSubscriptions.length };
}

/** Tablo örneği: tek alanı yerinde günceller (processRowUpdate). */
export function patchUserSubscription(id: string, patch: Record<string, unknown>): Doc {
  const doc = userSubscriptions.find(d => d.id === id);
  if (!doc) throw new Error(`userSubscription ${id} yok`);
  Object.assign(doc, patch, { updatedAt: dayjs().toISOString() });
  return { ...doc };
}
