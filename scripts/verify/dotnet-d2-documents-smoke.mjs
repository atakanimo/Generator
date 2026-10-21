#!/usr/bin/env node
/**
 * .NET D2 smoke testi: üretilen `documents` modülünün admin uçları (fixtures/dotnet/models.json) — enum, trim, default, unique (409),
 * enum IN / eq, range, nullable date-range filtreleri, sayı sıralama, kısmi update, delete.
 * Boş `documents` tablosu bekler (sayımlar sabit): migration sonrası ilk iş olarak koşun.
 *
 *   API_BASE=http://localhost:5091 JWT_SECRET=… JWT_ISSUER=… JWT_AUDIENCE=… node scripts/verify/dotnet-d2-documents-smoke.mjs
 */
import { createHmac } from 'node:crypto';
const base=process.env.API_BASE??'http://localhost:5091', secret=process.env.JWT_SECRET;
if(!secret){console.error('JWT_SECRET gerekli');process.exit(1);}
const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const now=Math.floor(Date.now()/1000);
const h=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:'0199f000-0000-7000-8000-000000000001',role:'Admin',iat:now,exp:now+600,iss:process.env.JWT_ISSUER,aud:process.env.JWT_AUDIENCE})}`;
const tok=`${h}.${createHmac('sha256',secret).update(h).digest('base64url')}`;
const call=async(m,p,b)=>{const r=await fetch(base+p,{method:m,headers:{'content-type':'application/json',authorization:`Bearer ${tok}`},body:b&&JSON.stringify(b)});return {s:r.status,j:await r.json().catch(()=>null)}};
let f=0;const ck=(n,ok,d)=>{if(!ok)f++;console.log(ok?'PASS':'FAIL',n,ok?'':JSON.stringify(d))};
const a=await call('POST','/api/documents/admin/create',{type:'kvkk',title:'  KVKK  ',content:'x',status:'in-review',publishedAt:'2026-10-19'});
ck('create enum + trim + default',a.s===200&&a.j.data.type==='kvkk'&&a.j.data.status==='in-review'&&a.j.data.title==='KVKK'&&a.j.data.version===1&&a.j.data.isActive===true&&a.j.data.publishedAt==='2026-10-19T00:00:00.000Z',a);
const b=await call('POST','/api/documents/admin/create',{type:'gizlilik',title:'G',content:'y',version:3});
ck('create 2',b.s===200,b);
ck('duplicate enum unique → 409',(await call('POST','/api/documents/admin/create',{type:'kvkk',title:'Z',content:'z'})).s===409);
ck('bad enum → 400',(await call('POST','/api/documents/admin/create',{type:'nope',title:'Z',content:'z'})).s===400);
ck('missing required → 400',(await call('POST','/api/documents/admin/create',{title:'Z',content:'z'})).s===400);
let r=await call('POST','/api/documents/admin/get-all',{filters:{type:['kvkk','kullanici']}});
ck('enum IN filter',r.s===200&&r.j.data.total===1&&r.j.data.items[0].type==='kvkk',r);
r=await call('POST','/api/documents/admin/get-all',{filters:{type:'gizlilik'}});
ck('enum single filter',r.j?.data?.total===1,r);
r=await call('POST','/api/documents/admin/get-all',{filters:{version:{min:2}}});
ck('range filter',r.j?.data?.total===1&&r.j.data.items[0].version===3,r);
r=await call('POST','/api/documents/admin/get-all',{filters:{status:'in-review'}});
ck('enum eq filter (nullable)',r.j?.data?.total===1,r);
r=await call('POST','/api/documents/admin/get-all',{filters:{publishedAt:{from:'2026-10-19',to:'2026-10-19'}}});
ck('nullable date-range',r.j?.data?.total===1,r);
r=await call('POST','/api/documents/admin/get-all',{sortBy:'version',sortOrder:'asc'});
ck('sort by number',r.j?.data?.items?.[0]?.version===1,r);
ck('content not filterable → 400',(await call('POST','/api/documents/admin/get-all',{filters:{content:'x'}})).s===400);
r=await call('POST',`/api/documents/admin/update/${b.j.data.id}`,{type:'kvkk'});
ck('update to duplicate → 409',r.s===409,r);
r=await call('POST',`/api/documents/admin/update/${b.j.data.id}`,{status:'published',version:4});
ck('partial update',r.s===200&&r.j.data.status==='published'&&r.j.data.version===4&&r.j.data.title==='G',r);
ck('delete',(await call('DELETE',`/api/documents/admin/${b.j.data.id}`)).s===200);
ck('normal create closed (no ownership)',[404,405].includes((await call('POST','/api/documents/create',{type:'kvkk',title:'x',content:'x'})).s));
console.log(f?`${f} FAIL`:'all PASS');
process.exit(f);
