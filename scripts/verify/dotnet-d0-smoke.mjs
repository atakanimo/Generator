#!/usr/bin/env node
/**
 * .NET D0 sözleşme smoke testi (docs/api-contract.md): çalışan bir .NET host'a karşı tek modülün
 * (varsayılan event-types) normal + admin uçlarını dener.
 *
 *   API_BASE=http://localhost:5080 JWT_SECRET=… [JWT_ISSUER=…] [JWT_AUDIENCE=…] node scripts/verify/dotnet-d0-smoke.mjs [endpoint]
 *
 * Admin token'ı JWT_SECRET ile burada imzalanır (HS256, role=Admin). Çıkış kodu: kalan hata sayısı.
 */
import { createHmac } from 'node:crypto';

const base = process.env.API_BASE ?? 'http://localhost:5080';
const endpoint = process.argv[2] ?? '/api/event-types';
const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error('JWT_SECRET gerekli');
  process.exit(1);
}

const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
function sign(payload) {
  const head = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
  return `${head}.${createHmac('sha256', secret).update(head).digest('base64url')}`;
}
const now = Math.floor(Date.now() / 1000);
const claims = { sub: '0199f000-0000-7000-8000-000000000001', iat: now, exp: now + 600 };
if (process.env.JWT_ISSUER) claims.iss = process.env.JWT_ISSUER;
if (process.env.JWT_AUDIENCE) claims.aud = process.env.JWT_AUDIENCE;
const adminToken = sign({ ...claims, role: 'Admin' });
const userToken = sign(claims);

async function call(method, path, body, token) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* gövde JSON değil: zarf kontrolü düşer */
  }
  return { status: res.status, json };
}

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  → ${JSON.stringify(detail)}`}`);
}

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ENVELOPE_KEYS = ['data', 'errorData', 'isSuccess', 'uiMessage'];

function isEnvelope(r) {
  if (!r.json || (r.json.traceId !== undefined && typeof r.json.traceId !== 'string')) return false;
  const keys = Object.keys(r.json).filter((key) => key !== 'traceId').sort();
  return JSON.stringify(keys) === JSON.stringify(ENVELOPE_KEYS);
}
function okEnvelope(r) {
  return r.status === 200 && isEnvelope(r) && r.json.isSuccess === true && r.json.errorData === null && typeof r.json.uiMessage === 'string';
}
function errEnvelope(r, code) {
  return (
    r.status === code &&
    isEnvelope(r) &&
    r.json.isSuccess === false &&
    r.json.data === null &&
    r.json.uiMessage === null &&
    r.json.errorData?.code === code &&
    typeof r.json.errorData.message === 'string' &&
    typeof r.json.errorData.header === 'string'
  );
}
const PAGE_KEYS = ['currentLimit', 'currentPage', 'hasMore', 'items', 'total'];
function isPage(d) {
  return d && JSON.stringify(Object.keys(d).sort()) === JSON.stringify(PAGE_KEYS) && Array.isArray(d.items);
}

const admin = `${endpoint}/admin`;
const tag = `smoke-${Date.now()}`;

// --- auth
check('admin get-all token yok → 401 zarf', errEnvelope(await call('POST', `${admin}/get-all`, {}), 401));
check('admin get-all Admin rolü yok → 403 zarf', errEnvelope(await call('POST', `${admin}/get-all`, {}, userToken), 403));

// --- create
const c1 = await call('POST', `${admin}/create`, { name: `${tag}-Düğün`, description: 'Alpha 100%_x' }, adminToken);
check('create → 200 zarf', okEnvelope(c1), c1);
const row = c1.json?.data ?? {};
check('create Row: id uuid v7, _id yok', UUID_V7.test(row.id ?? '') && !('_id' in row), row);
check('create Row: createdAt/updatedAt ISO UTC', ISO_UTC.test(row.createdAt ?? '') && ISO_UTC.test(row.updatedAt ?? ''), row);
check('create Row: varsayılan isActive=true', row.isActive === true, row);
const c2 = await call('POST', `${admin}/create`, { name: `${tag}-Nişan`, isActive: false }, adminToken);
check('create 2 → 200', okEnvelope(c2), c2);

check('create body\'de id → 400', errEnvelope(await call('POST', `${admin}/create`, { id: row.id, name: `${tag}-x` }, adminToken), 400));
check('create body\'de _id → 400', errEnvelope(await call('POST', `${admin}/create`, { _id: 'x', name: `${tag}-y` }, adminToken), 400));
check('create bilinmeyen anahtar → 400', errEnvelope(await call('POST', `${admin}/create`, { name: `${tag}-z`, foo: 1 }, adminToken), 400));
check('create name eksik → 400', errEnvelope(await call('POST', `${admin}/create`, { description: 'x' }, adminToken), 400));
check('create name boş → 400', errEnvelope(await call('POST', `${admin}/create`, { name: '' }, adminToken), 400));
check('create aynı name → 409', errEnvelope(await call('POST', `${admin}/create`, { name: `${tag}-Düğün` }, adminToken), 409));
check('create bozuk JSON → 400', errEnvelope(await (async () => {
  const res = await fetch(`${base}${admin}/create`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${adminToken}` }, body: '{"name":' });
  return { status: res.status, json: await res.json().catch(() => null) };
})(), 400));

// --- list (normal, anonim)
const l1 = await call('POST', `${endpoint}/get-all`, { filters: { name: tag } });
check('normal get-all anonim → 200 PaginatedList', okEnvelope(l1) && isPage(l1.json.data), l1);
check('get-all varsayılan sıralama createdAt desc', l1.json?.data?.items?.[0]?.name === `${tag}-Nişan`, l1.json?.data?.items);
check('get-all varsayılan page=1 limit=50', l1.json?.data?.currentPage === 1 && l1.json?.data?.currentLimit === 50, l1.json?.data);
const lEmpty = await call('POST', `${endpoint}/get-all`);
check('get-all gövdesiz → 200', okEnvelope(lEmpty) && isPage(lEmpty.json.data), lEmpty);
const lc = await call('POST', `${endpoint}/get-all`, { filters: { name: tag.toUpperCase() } });
check('filters.regex büyük/küçük harf duyarsız', lc.json?.data?.total === 2, lc.json?.data);
const lr = await call('POST', `${endpoint}/get-all`, { filters: { description: '100%_' } });
check('filters.regex % ve _ desen değil, düz metin', lr.json?.data?.items?.some((x) => x.id === row.id) && lr.json?.data?.items?.every((x) => x.description?.includes('100%_')), lr.json?.data);
const lb = await call('POST', `${endpoint}/get-all`, { filters: { name: tag, isActive: false } });
check('filters.boolean', lb.json?.data?.total === 1 && lb.json.data.items[0].isActive === false, lb.json?.data);
const lid = await call('POST', `${endpoint}/get-all`, { filters: { id: row.id } });
check('filters.id', lid.json?.data?.total === 1 && lid.json.data.items[0].id === row.id, lid.json?.data);
const today = new Date().toISOString().slice(0, 10);
const ld = await call('POST', `${endpoint}/get-all`, { filters: { name: tag, createdAt: { from: today, to: today } } });
check('filters.date-range (bugün)', ld.json?.data?.total === 2, ld.json?.data);
const ld2 = await call('POST', `${endpoint}/get-all`, { filters: { name: tag, createdAt: '2000-01-01' } });
check('filters.date-range tek gün', ld2.json?.data?.total === 0, ld2.json?.data);
check('kökte filtre alanı → 400', errEnvelope(await call('POST', `${endpoint}/get-all`, { name: tag }), 400));
check('filters içinde bilinmeyen anahtar → 400', errEnvelope(await call('POST', `${endpoint}/get-all`, { filters: { foo: 1 } }), 400));
check('filters._id → 400', errEnvelope(await call('POST', `${endpoint}/get-all`, { filters: { _id: row.id } }), 400));
const lp = await call('POST', `${endpoint}/get-all`, { filters: { name: tag }, limit: 1, page: 1, sortBy: 'name', sortOrder: 'asc' });
check('page/limit/hasMore + sortBy asc', lp.json?.data?.items?.length === 1 && lp.json.data.hasMore === true && lp.json.data.total === 2 && lp.json.data.items[0].name === `${tag}-Düğün`, lp.json?.data);
const lp2 = await call('POST', `${endpoint}/get-all`, { filters: { name: tag }, limit: 1, page: 2, sortBy: 'name', sortOrder: 'asc' });
check('page 2 hasMore=false', lp2.json?.data?.hasMore === false && lp2.json.data.currentPage === 2, lp2.json?.data);
check('sortBy: id geçerli', okEnvelope(await call('POST', `${endpoint}/get-all`, { sortBy: 'id' })));
const lmax = await call('POST', `${endpoint}/get-all`, { limit: 500 });
check('limit > 100 → 100\'e sıkıştırılır', lmax.json?.data?.currentLimit === 100, lmax.json?.data);
check('sortBy beyaz liste dışı → 400', errEnvelope(await call('POST', `${endpoint}/get-all`, { sortBy: 'password' }), 400));
check('sortOrder geçersiz → 400', errEnvelope(await call('POST', `${endpoint}/get-all`, { sortOrder: 'up' }), 400));
check('page 0 → 400', errEnvelope(await call('POST', `${endpoint}/get-all`, { page: 0 }), 400));

// --- getOne
const g = await call('GET', `${endpoint}/${row.id}`);
check('normal getOne → 200 Row', okEnvelope(g) && g.json.data.id === row.id, g);
check('getOne olmayan id → 404 zarf', errEnvelope(await call('GET', `${endpoint}/0199f000-0000-7000-8000-00000000dead`), 404));
check('bilinmeyen yol → 404 zarf', errEnvelope(await call('GET', `${endpoint}/not-a-guid`), 404));
check('normal create ucu yok (normalOperations) → 404/405', [404, 405].includes((await call('POST', `${endpoint}/create`, { name: 'x' })).status));

// --- update
const u = await call('POST', `${admin}/update/${row.id}`, { description: 'güncel' }, adminToken);
check('update kısmi → 200 güncel Row', okEnvelope(u) && u.json.data.description === 'güncel' && u.json.data.name === row.name, u);
check('update updatedAt ilerler', (u.json?.data?.updatedAt ?? '') >= row.updatedAt, u.json?.data);
check('update body\'de id → 400', errEnvelope(await call('POST', `${admin}/update/${row.id}`, { id: row.id }, adminToken), 400));
check('update aynı name → 409', errEnvelope(await call('POST', `${admin}/update/${row.id}`, { name: `${tag}-Nişan` }, adminToken), 409));
check('update olmayan id → 404', errEnvelope(await call('POST', `${admin}/update/0199f000-0000-7000-8000-00000000dead`, {}, adminToken), 404));

// --- delete
for (const id of [row.id, c2.json?.data?.id]) {
  const d = await call('DELETE', `${admin}/${id}`, undefined, adminToken);
  check('delete → 200, data null', okEnvelope(d) && d.json.data === null, d);
}
check('silinen kayıt → 404', errEnvelope(await call('GET', `${admin}/${row.id}`, undefined, adminToken), 404));

console.log(`\n${failures === 0 ? 'OK' : `${failures} FAIL`}`);
process.exit(failures);
