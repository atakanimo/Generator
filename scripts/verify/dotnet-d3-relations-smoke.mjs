#!/usr/bin/env node
/**
 * .NET D3 smoke testi: üretilen `membership-plans` (decimal, map, json, object, object[], string[]) ve `templates`
 * (reference + populate — list / getOne obje, create / update id —, opsiyonel reference, reference[] m-n + populate, hedefsiz reference[]) modülleri
 * (fixtures/dotnet/models.json). Admin uçlarını kullanır.
 *
 *   API_BASE=http://localhost:5091 JWT_SECRET=… JWT_ISSUER=… JWT_AUDIENCE=… node scripts/verify/dotnet-d3-relations-smoke.mjs
 */
import { createHmac, randomUUID } from 'node:crypto';

const base = process.env.API_BASE ?? 'http://localhost:5091';
const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error('JWT_SECRET gerekli');
  process.exit(1);
}
const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const head = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: '0199f000-0000-7000-8000-000000000001', role: 'Admin', iat: now, exp: now + 600, iss: process.env.JWT_ISSUER, aud: process.env.JWT_AUDIENCE })}`;
const token = `${head}.${createHmac('sha256', secret).update(head).digest('base64url')}`;
const call = async (method, path, body) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: body && JSON.stringify(body) });
  return { s: res.status, j: await res.json().catch(() => null) };
};
let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  → ${JSON.stringify(detail)}`}`);
};
const tag = randomUUID().slice(0, 8);

// MembershipPlans
let r = await call('POST', '/api/membership-plans/admin/create', {
  code: `p-${tag}`, price: '149.90', features: { qr: true, video: false }, meta: { color: 'red', n: [1, 2] },
  limits: { maxEvents: 5, watermark: false }, tiers: [{ name: 'a', price: '10.5' }], tags: ['x', 'y']
});
const plan = r.j?.data;
check('plan create: decimal string, map, json, object, object[], string[]', r.s === 200 && plan.price === '149.90' && plan.discount === '0'
  && plan.features.qr === true && plan.meta.n[1] === 2 && plan.limits.maxEvents === 5 && plan.limits.watermark === false
  && plan.tiers[0].price === '10.5' && plan.tags.join() === 'x,y', r);
check('decimal as number → 400', (await call('POST', '/api/membership-plans/admin/create', { code: `q-${tag}`, price: 1, limits: { watermark: true } })).s === 400);
check('unknown key in object → 400', (await call('POST', '/api/membership-plans/admin/create', { code: `q-${tag}`, price: '1', limits: { watermark: true, nope: 1 } })).s === 400);
r = await call('POST', '/api/membership-plans/admin/get-all', { filters: { price: { min: '100', max: '200' }, code: `p-${tag}` } });
check('decimal range filter', r.j?.data?.total === 1, r);
r = await call('POST', `/api/membership-plans/admin/update/${plan.id}`, { limits: { maxEvents: null, watermark: true }, tiers: [] });
check('update object + empty object[]', r.s === 200 && r.j.data.limits.maxEvents === null && r.j.data.limits.watermark === true && r.j.data.tiers.length === 0, r);

// Templates
const et = (await call('POST', '/api/event-types/admin/create', { name: `et-${tag}` })).j.data;
const d1 = (await call('POST', '/api/documents/admin/create', { type: 'kullanici', title: `D1-${tag}`, content: 'c' }));
const docs = (await call('POST', '/api/documents/admin/get-all', { filters: { type: 'kullanici' } })).j.data.items;
const doc = docs[0];
check('setup', !!et?.id && !!doc?.id, { et, d1 });
r = await call('POST', '/api/templates/admin/create', { name: `t-${tag}`, eventTypeId: et.id, planId: plan.id, documentIds: [doc.id, doc.id], externalIds: [randomUUID()] });
const tpl = r.j?.data;
check('template create: reference as id (create response)', r.s === 200 && tpl.eventTypeId === et.id, r);
check('optional reference (no populate) is id', tpl?.planId === plan.id, tpl);
check('m-n as ids (create response, duplicates dropped)', tpl?.documentIds?.length === 1 && tpl.documentIds[0] === doc.id, tpl);
check('reference[] without target = id list', tpl?.externalIds?.length === 1, tpl);
check('missing reference → 400', (await call('POST', '/api/templates/admin/create', { name: 'x', eventTypeId: randomUUID() })).s === 400);
check('missing m-n target → 400', (await call('POST', '/api/templates/admin/create', { name: 'x', eventTypeId: et.id, documentIds: [randomUUID()] })).s === 400);
r = await call('POST', '/api/templates/admin/get-all', { filters: { eventTypeId: et.id } });
check('filter by reference', r.j?.data?.total === 1 && r.j.data.items[0].eventTypeId.name === `et-${tag}`, r);
r = await call('POST', '/api/templates/admin/get-all', { filters: { documentIds: [doc.id] } });
check('filter by m-n (any)', r.j?.data?.items?.some((t) => t.id === tpl.id), r);
r = await call('GET', `/api/templates/admin/${tpl.id}`);
const one = r.j?.data;
check('getOne populated', one?.eventTypeId?.id === et.id && one.eventTypeId.name === `et-${tag}` && one.eventTypeId.isActive === true
  && Object.keys(one.eventTypeId).length === 3, r);
check('getOne m-n populated', one?.documentIds?.length === 1 && one.documentIds[0].id === doc.id && one.documentIds[0].type === 'kullanici'
  && one.documentIds[0].title === doc.title, r);
r = await call('POST', `/api/templates/admin/update/${tpl.id}`, { documentIds: [] });
check('update m-n replace (ids in response)', r.s === 200 && r.j.data.documentIds.length === 0 && r.j.data.eventTypeId === et.id, r);
r = await call('DELETE', `/api/event-types/admin/${et.id}`);
check('delete referenced → 409', r.s === 409 && r.j?.isSuccess === false, r);
check('delete template', (await call('DELETE', `/api/templates/admin/${tpl.id}`)).s === 200);
check('delete event type afterwards', (await call('DELETE', `/api/event-types/admin/${et.id}`)).s === 200);

console.log(failures ? `\n${failures} FAIL` : '\nall PASS');
process.exit(failures);
