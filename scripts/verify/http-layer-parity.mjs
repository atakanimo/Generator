#!/usr/bin/env node
/**
 * Ortak HTTP katmanı eşliği (docs/frontend/http-layer.md). Kaynak `src/generator-assets/client-http/`. Verilen her
 * uygulamada:
 *  - `src/services/api/index.ts` ve `src/types/API/response.ts` ortak kaynakla birebir aynı (admin, web, mobil fark etmez);
 *  - `src/services/api/platform.ts` platformunun adaptörüyle aynı (admin + web → `browser`, mobil → `mobile`);
 *  - `src/services/api/auth.ts` ve `src/services/api/hooks.ts` var (içerikleri projeye özel);
 *  - eski düz dosyalar (`services/api.ts`, `apiAuth.ts`, `apiHooks.ts`, `apiPlatform.ts`) yok: `services/api.ts` kalırsa
 *    `@/services/api` klasör yerine onu çözer.
 *
 * Platform `package.json`'dan anlaşılır (`src/shared/clientPlatform.ts`); `<platform>=<klasör>` ile elle verilebilir.
 *
 *   node scripts/verify/http-layer-parity.mjs --app ../CeyizDefterim/apps/admin --app ../SharedFrame/apps/web
 *   node scripts/verify/http-layer-parity.mjs --app mobile=../CeyizDefterim/apps/mobile
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIENT_HTTP_ADAPTER as ADAPTER, detectClientPlatform, isClientPlatform } from '../../src/shared/clientPlatform.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = join(root, 'src/generator-assets/client-http');

const read = path => (existsSync(path) ? readFileSync(path, 'utf8').replace(/\r\n/g, '\n') : null);
const failures = [];
let apps = 0;

function same(label, expectedPath, actualPath) {
  const actual = read(actualPath);
  if (actual === null) return failures.push(`${label}: yok`);
  if (actual !== read(expectedPath)) failures.push(`${label}: kaynaktan farklı`);
}

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] !== '--app') continue;
  const value = args[++i] ?? '';
  const eq = value.indexOf('=');
  const given = eq > 0 ? value.slice(0, eq) : null;
  const dir = eq > 0 ? value.slice(eq + 1) : value;
  const pkg = read(join(resolve(dir), 'package.json'));
  const platform = given ?? detectClientPlatform(pkg ? JSON.parse(pkg) : null);
  if (!dir || !isClientPlatform(platform)) {
    console.error(`--app [admin|web|mobile=]<uygulama klasörü>: platform anlaşılamadı (${value})`);
    process.exit(2);
  }
  console.log(`${dir}: ${platform}${given ? ' (elle)' : ' (package.json)'}`);
  const src = join(resolve(dir), 'src');
  apps++;
  same(`${dir} services/api/index.ts`, join(source, 'shared/services/api/index.ts'), join(src, 'services/api/index.ts'));
  same(`${dir} types/API/response.ts`, join(source, 'shared/types/API/response.ts'), join(src, 'types/API/response.ts'));
  same(`${dir} services/api/platform.ts`, join(source, `platform/${ADAPTER[platform]}/services/api/platform.ts`), join(src, 'services/api/platform.ts'));
  for (const own of ['hooks', 'auth']) {
    if (!existsSync(join(src, `services/api/${own}.ts`))) failures.push(`${dir} services/api/${own}.ts: yok`);
  }
  for (const old of ['api', 'apiAuth', 'apiHooks', 'apiPlatform']) {
    if (existsSync(join(src, `services/${old}.ts`))) failures.push(`${dir} services/${old}.ts: eski yer, services/api/ altına taşınmalı`);
  }
}

if (!apps) {
  console.error('En az bir --app gerekli.');
  process.exit(2);
}
if (failures.length) {
  console.error(`HTTP katmanı eşliği: ${failures.length} fark\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log(`HTTP katmanı eşliği: ${apps} uygulama tamam`);
