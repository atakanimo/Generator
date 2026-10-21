#!/usr/bin/env node
/**
 * .NET D4 smoke testi (sözleşme §2, §5): üretilen `users` (ownership self, `password` hidden, `role` adminOnly) ve
 * `user-notes` (ownership field: `userId`, `pinned` adminOnly) modülleri (fixtures/dotnet/models.json).
 *
 *   API_BASE=http://localhost:5091 JWT_SECRET=… JWT_ISSUER=… JWT_AUDIENCE=… node scripts/verify/dotnet-d4-ownership-smoke.mjs
 */
import { createHmac, randomUUID } from 'node:crypto';

const base = process.env.API_BASE ?? 'http://localhost:5091';
const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error('JWT_SECRET gerekli');
  process.exit(1);
}
const b64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
function token(sub, role) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { sub, iat: now, exp: now + 600, iss: process.env.JWT_ISSUER, aud: process.env.JWT_AUDIENCE, ...(role ? { role } : {}) };
  const head = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}`;
  return `${head}.${createHmac('sha256', secret).update(head).digest('base64url')}`;
}
const call = async (tok, method, path, body) => {
  const headers = { 'content-type': 'application/json' };
  if (tok) headers.authorization = `Bearer ${tok}`;
  const res = await fetch(base + path, { method, headers, body: body && JSON.stringify(body) });
  return { s: res.status, j: await res.json().catch(() => null) };
};
let failures = 0;
const check = (name, ok, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  → ${JSON.stringify(detail)}`}`);
};
const admin = token(randomUUID(), 'Admin');
const tag = randomUUID().slice(0, 8);

// Users: admin creates two users.
let r = await call(admin, 'POST', '/api/users/admin/create', { email: `a-${tag}@x.io`, password: 'secret', name: 'A' });
const a = r.j?.data;
check('admin create user: password hidden, role default', r.s === 200 && !('password' in a) && a.role === 'user', r);
const b = (await call(admin, 'POST', '/api/users/admin/create', { email: `b-${tag}@x.io`, password: 'secret', name: 'B', role: 'admin' })).j?.data;
check('admin sets adminOnly role', b?.role === 'admin', b);
const ta = token(a.id);
const tb = token(b.id);

check('self: own record', (await call(ta, 'GET', `/api/users/${a.id}`)).s === 200);
check('self: other record → 404', (await call(ta, 'GET', `/api/users/${b.id}`)).s === 404);
check('self: anonymous → 401', (await call(null, 'GET', `/api/users/${a.id}`)).s === 401);
r = await call(ta, 'POST', `/api/users/update/${a.id}`, { name: 'A2' });
check('self: update own', r.s === 200 && r.j.data.name === 'A2', r);
check('self: update other → 404', (await call(ta, 'POST', `/api/users/update/${b.id}`, { name: 'x' })).s === 404);
check('self: adminOnly in body → 400', (await call(ta, 'POST', `/api/users/update/${a.id}`, { role: 'admin' })).s === 400);
check('self: no normal create', [404, 405].includes((await call(ta, 'POST', '/api/users/create', { email: 'z@x.io', password: 'p', name: 'z' })).s));
check('self: no normal list (not requested)', [404, 405].includes((await call(ta, 'POST', '/api/users/get-all', {})).s));
r = await call(admin, 'POST', '/api/users/admin/get-all', { filters: { email: tag } });
check('admin list: password never returned', r.j?.data?.total === 2 && r.j.data.items.every((u) => !('password' in u)), r);
check('hidden field not filterable', (await call(admin, 'POST', '/api/users/admin/get-all', { filters: { password: 'secret' } })).s === 400);
check('hidden field not sortable', (await call(admin, 'POST', '/api/users/admin/get-all', { sortBy: 'password' })).s === 400);

// UserNotes: ownership field.
r = await call(ta, 'POST', '/api/user-notes/create', { text: 'note A' });
const na = r.j?.data;
check('field: create takes userId from auth', r.s === 200 && na.userId === a.id && na.pinned === false, r);
r = await call(ta, 'GET', `/api/user-notes/${na.id}`);
check('populated owner without hidden field', r.j?.data?.userId?.id === a.id && r.j.data.userId.name === 'A2' && !('password' in r.j.data.userId), r);
check('field: userId in body → 400', (await call(ta, 'POST', '/api/user-notes/create', { text: 'x', userId: b.id })).s === 400);
check('field: adminOnly in body → 400', (await call(ta, 'POST', '/api/user-notes/create', { text: 'x', pinned: true })).s === 400);
check('field: anonymous → 401', (await call(null, 'POST', '/api/user-notes/get-all', {})).s === 401);
await call(tb, 'POST', '/api/user-notes/create', { text: 'note B' });
r = await call(ta, 'POST', '/api/user-notes/get-all', {});
check('field: list only own', r.j?.data?.total === 1 && r.j.data.items[0].id === na.id, r);
r = await call(ta, 'POST', '/api/user-notes/get-all', { filters: { userId: b.id } });
check('field: userId filter ignored on normal API', r.j?.data?.total === 1 && r.j.data.items[0].id === na.id, r);
check('field: other user getOne → 404', (await call(tb, 'GET', `/api/user-notes/${na.id}`)).s === 404);
check('field: other user update → 404', (await call(tb, 'POST', `/api/user-notes/update/${na.id}`, { text: 'hack' })).s === 404);
check('field: other user delete → 404', (await call(tb, 'DELETE', `/api/user-notes/${na.id}`)).s === 404);
r = await call(admin, 'POST', '/api/user-notes/admin/get-all', { filters: { userId: b.id } });
check('admin: userId filter applies', r.j?.data?.total === 1 && r.j.data.items[0].userId.id === b.id, r);
r = await call(admin, 'POST', `/api/user-notes/admin/update/${na.id}`, { pinned: true, userId: b.id });
check('admin: adminOnly + ownership field writable', r.s === 200 && r.j.data.pinned === true && r.j.data.userId === b.id, r);
check('field: moved note gone for A', (await call(ta, 'GET', `/api/user-notes/${na.id}`)).s === 404);
check('field: owner deletes', (await call(tb, 'DELETE', `/api/user-notes/${na.id}`)).s === 200);

console.log(failures ? `\n${failures} FAIL` : '\nall PASS');
process.exit(failures);
