#!/usr/bin/env node
/**
 * PY1 smoke testi (.NET; Express için `express-py1-e2e.mjs` aynı betiği koşar): üretilen `reminders` modülünün admin uçları (fixtures/dotnet/models.json) — sayısal enum (açık değer,
 * JSON'da sayı, filtre), sadece tarih (`YYYY-MM-DD` giriş / çıkış, aralık filtresi), tam sayı, kısıtlar (400), e-posta, traceId.
 * Boş `reminders` tablosu bekler: migration sonrası koşun.
 *
 *   API_BASE=http://localhost:5091 JWT_SECRET=… JWT_ISSUER=… JWT_AUDIENCE=… node scripts/verify/dotnet-py1-formats-smoke.mjs
 *   (Express: `TOKEN_USER_ID` = ADMIN_USER_IDS'teki id; token'a `userId` claim'i eklenir, .NET `sub` + `role` okur.)
 */
import { createHmac } from 'node:crypto';
import { SUBJECT } from './_smoke-ids.mjs';
const base=process.env.API_BASE??'http://localhost:5091', secret=process.env.JWT_SECRET;
if(!secret){console.error('JWT_SECRET gerekli');process.exit(1);}
const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const now=Math.floor(Date.now()/1000);
const h=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:SUBJECT,role:'admin',...(process.env.TOKEN_USER_ID?{userId:process.env.TOKEN_USER_ID}:{}),iat:now,exp:now+600,iss:process.env.JWT_ISSUER,aud:process.env.JWT_AUDIENCE})}`;
// ACCESS_TOKEN: a real login's token (hosts with the shared auth layer read the user from the DB).
const tok=process.env.ACCESS_TOKEN??`${h}.${createHmac('sha256',secret).update(h).digest('base64url')}`;
const call=async(m,p,b,headers={})=>{const r=await fetch(base+p,{method:m,headers:{'content-type':'application/json',authorization:`Bearer ${tok}`,...headers},body:b&&JSON.stringify(b)});return {s:r.status,j:await r.json().catch(()=>null),h:r.headers}};
let f=0;const ck=(n,ok,d)=>{if(!ok)f++;console.log(ok?'PASS':'FAIL',n,ok?'':JSON.stringify(d))};
const api='/api/reminders/admin';

const a=await call('POST',`${api}/create`,{title:'Pay rent',priority:20,attempts:3,dueOn:'2026-11-01',contactEmail:'a@b.co',code:'ABC'});
ck('create: numeric enum + date-only + int',a.s===200&&a.j.data.priority===20&&a.j.data.dueOn==='2026-11-01'&&a.j.data.attempts===3,a);
const b=await call('POST',`${api}/create`,{title:'Call bank',priority:10,dueOn:'2026-12-15'});
ck('create 2',b.s===200&&b.j.data.priority===10,b);

ck('enum: undefined number → 400',(await call('POST',`${api}/create`,{title:'X1',priority:15})).s===400);
ck('enum: label string → 400',(await call('POST',`${api}/create`,{title:'X2',priority:'high'})).s===400);
ck('minLength → 400',(await call('POST',`${api}/create`,{title:'X',priority:10})).s===400);
ck('maxLength → 400',(await call('POST',`${api}/create`,{title:'X'.repeat(121),priority:10})).s===400);
ck('pattern → 400',(await call('POST',`${api}/create`,{title:'XY',priority:10,code:'abc'})).s===400);
ck('email → 400',(await call('POST',`${api}/create`,{title:'XY',priority:10,contactEmail:'nope'})).s===400);
ck('int: fraction → 400',(await call('POST',`${api}/create`,{title:'XY',priority:10,attempts:1.5})).s===400);
ck('max → 400',(await call('POST',`${api}/create`,{title:'XY',priority:10,attempts:11})).s===400);
ck('date-only: datetime → 400',(await call('POST',`${api}/create`,{title:'XY',priority:10,dueOn:'2026-11-01T10:00:00Z'})).s===400);
ck('array: no length rule (empty ok)',(await call('POST',`${api}/create`,{title:'Tags',priority:10,tags:[]})).s===200);

let r=await call('POST',`${api}/get-all`,{filters:{priority:20}});
ck('enum filter by number',r.s===200&&r.j.data.total===1&&r.j.data.items[0].title==='Pay rent',r);
r=await call('POST',`${api}/get-all`,{filters:{dueOn:{from:'2026-12-01',to:'2026-12-31'}}});
ck('date-only range filter',r.s===200&&r.j.data.total===1&&r.j.data.items[0].title==='Call bank',r);
r=await call('POST',`${api}/get-all`,{},{ 'x-request-id':'py1-smoke-1' });
ck('traceId echoes X-Request-Id',r.j?.traceId==='py1-smoke-1'&&r.h.get('x-request-id')==='py1-smoke-1',{traceId:r.j?.traceId,header:r.h.get('x-request-id')});
r=await call('POST',`${api}/get-all`,{},{ 'x-request-id':'x'.repeat(200) });
ck('traceId: too long header replaced',typeof r.j?.traceId==='string'&&r.j.traceId.length<=128,{len:r.j?.traceId?.length});
ck('delete',(await call('DELETE',`${api}/${b.j.data.id}`)).s===200);
console.log(f?`${f} FAIL`:'all PASS');
process.exit(f);
