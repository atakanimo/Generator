/**
 * Asset sync: core asset'ler host'a yalnız bir kez yazılır (create-only), Generator'daki sonraki
 * düzeltmeler var olan host'a gitmez. Bu modül host'un asset'lerini Generator'daki güncel hâliyle karşılaştırır ve
 * yalnız seçilen dosyaları yazar. Skeleton (Program.cs, appsettings, pyproject …) kapsam dışı: kullanıcı onları değiştirir.
 *
 * BE stack'leri: Express (`EXPRESS_CORE_BOOTSTRAP_FILES` → `src/core`), Python (`core/` → `<pkg>/core`), .NET (ortak +
 * sağlayıcı + id katmanı → `<Layer>/…`, bootstrap ile aynı katman sırası). İstemci (admin / web / mobil): ortak HTTP
 * katmanı (`client-http`, docs/frontend/http-layer.md); `api/auth.ts` ve `api/hooks.ts` projeye ait, yalnız yoksa yazılır.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { findDotnetHost } from '../parsers/dotnet/dotnetHost.js';
import { resolveDotnetHostDatabase } from '../ipc/dotnetBackend.js';
import { findPythonHost } from '../ipc/pythonBackend.js';
import { getGeneratorAssetsDir } from '../utils/templateHelpers.js';
import { applyAppTokens, dotnetAssetsDir, listFiles } from './dotnet-efcore/dotnetFiles.js';
import { DOTNET_LAYERS, dotnetLayout } from './dotnet-efcore/dotnetLayout.js';
import { dotnetDbProvider } from './dotnet-efcore/providers/index.js';
import { EXPRESS_CORE_BOOTSTRAP_FILES } from './express-mongoose/expressCoreAssets.js';
import { pythonAssetsDir } from './python-fastapi/pythonFiles.js';
import { pythonLayout } from './python-fastapi/pythonLayout.js';
import { resolveClientPlatformAt } from '../utils/clientPlatform.js';
import { CLIENT_HTTP_ADAPTER, type ClientPlatform } from '../../shared/clientPlatform.js';

export type AssetStack = 'express-mongoose' | 'python-fastapi' | 'dotnet-efcore' | 'client-http';
/** `owned`: projeye ait dosya (create-only) zaten var; içeriğine bakılmaz, yazılmaz. */
export type AssetStatus = 'missing' | 'same' | 'differs' | 'owned';

export interface AssetEntry {
  /** Host köküne göre yol (rapor ve seçim anahtarı). */
  rel: string;
  target: string;
  /** Generator'daki güncel içerik (token'lar uygulanmış). */
  content: string;
  /** Projeye ait başlangıç dosyası: yalnız yoksa yazılır, sonra proje değiştirir. */
  createOnly?: boolean;
}

export interface AssetDiff extends AssetEntry {
  status: AssetStatus;
  /** Host'taki içerik (`missing` değilse). */
  current?: string;
}

export interface AssetPlan {
  stack: AssetStack;
  root: string;
  entries: AssetEntry[];
  /** İstemci platformu (`client-http`). */
  platform?: ClientPlatform;
  /** Elle bakılması gerekenler (eski düz dosyalar, köprü seçilemedi …). */
  notes?: string[];
}

const BUILD_OUTPUT = /(^|\/)(bin|obj|__pycache__)\/|\.pyc$|\.DS_Store$/;

function treeEntries(root: string, sourceDir: string, targetDir: string, render: (text: string) => string): Map<string, AssetEntry> {
  const out = new Map<string, AssetEntry>();
  if (!existsSync(sourceDir)) return out;
  for (const file of listFiles(sourceDir)) {
    const relSource = relative(sourceDir, file).replace(/\\/g, '/');
    if (BUILD_OUTPUT.test(relSource)) continue;
    const target = join(targetDir, render(relSource));
    out.set(target, { rel: relative(root, target).replace(/\\/g, '/'), target, content: render(readFileSync(file, 'utf8')) });
  }
  return out;
}

function dotnetPlan(root: string): AssetPlan | null {
  const host = findDotnetHost(root);
  if (!host) return null;
  // Manifest + proje (R10): eski host'larda (EntityId alias'ı yok) veritabanı / id oradan çözülür, çelişkide açık hata.
  const db = resolveDotnetHostDatabase(host);
  const provider = dotnetDbProvider(db);
  const assets = dotnetAssetsDir();
  const layout = dotnetLayout(root, host.app);
  const render = (text: string) => applyAppTokens(text, host.app);
  const entries = new Map<string, AssetEntry>();
  for (const layer of DOTNET_LAYERS) {
    // Bootstrap'taki sıra: ortak < sağlayıcı < id; sonraki katman aynı yoldaki dosyayı değiştirir.
    for (const dir of [join(assets, layer), join(assets, 'providers', provider.assetDir, layer), join(assets, 'ids', db.idType, layer)]) {
      for (const [target, entry] of treeEntries(root, dir, layout.projectDir(layer), render)) entries.set(target, entry);
    }
  }
  return { stack: 'dotnet-efcore', root, entries: [...entries.values()].sort((a, b) => a.rel.localeCompare(b.rel)) };
}

function pythonPlan(root: string): AssetPlan | null {
  const host = findPythonHost(root);
  if (!host) return null;
  const entries = treeEntries(root, join(pythonAssetsDir(), 'core'), pythonLayout(root, host.pkg).coreDir, (text) => text);
  return { stack: 'python-fastapi', root, entries: [...entries.values()].sort((a, b) => a.rel.localeCompare(b.rel)) };
}

function expressPlan(root: string): AssetPlan | null {
  if (!existsSync(join(root, 'package.json')) || !existsSync(join(root, 'src', 'core'))) return null;
  const assets = getGeneratorAssetsDir('express-mongoose');
  const entries = EXPRESS_CORE_BOOTSTRAP_FILES.map((file) => {
    const source = join(assets, relative('src/generator-assets/express-mongoose', file.sourceRelativePath));
    const target = join(root, file.targetRelativePath);
    return { rel: file.targetRelativePath, target, content: readFileSync(source, 'utf8') };
  });
  return { stack: 'express-mongoose', root, entries };
}

/**
 * Oturum köprüsü (`api/auth.ts`) başlangıcı: üretilen auth varsa `generated`, yoksa platformun geçiş dönemi köprüsü.
 * Elle refresh'i olan admin (`admin-refresh`) seçilmez: o, dosyası zaten olan projelerde kalır.
 */
function authBridgeFor(root: string, platform: ClientPlatform): string | null {
  if (existsSync(join(root, 'src/services/authRefresh.generated.ts'))) return 'generated';
  if (platform === 'admin') return 'legacy-admin';
  if (platform === 'mobile') return 'legacy-mobile';
  return null;
}

/** Ortak HTTP katmanı: admin, web ya da mobil uygulama klasörü (`package.json` + `src/`). */
function clientHttpPlan(root: string): AssetPlan | null {
  if (!existsSync(join(root, 'package.json')) || !existsSync(join(root, 'src'))) return null;
  const { platform } = resolveClientPlatformAt(root);
  if (!platform) return null;
  const assets = getGeneratorAssetsDir('client-http');
  const notes: string[] = [];
  const entry = (source: string, target: string, createOnly = false): AssetEntry => ({
    rel: target,
    target: join(root, target),
    content: readFileSync(join(assets, source), 'utf8'),
    ...(createOnly && { createOnly })
  });
  const entries = [
    entry('shared/services/api/index.ts', 'src/services/api/index.ts'),
    entry(`platform/${CLIENT_HTTP_ADAPTER[platform]}/services/api/platform.ts`, 'src/services/api/platform.ts'),
    entry('shared/types/API/response.ts', 'src/types/API/response.ts'),
    entry('shared/services/api/hooks.ts', 'src/services/api/hooks.ts', true)
  ];
  const bridge = authBridgeFor(root, platform);
  if (bridge) entries.push(entry(`auth-bridge/${bridge}/services/api/auth.ts`, 'src/services/api/auth.ts', true));
  else if (!existsSync(join(root, 'src/services/api/auth.ts'))) {
    notes.push('src/services/api/auth.ts yok ve üretilen auth bulunamadı: köprüyü elle yazın (docs/frontend/http-layer.md "apiAuth").');
  }
  // Eski düz dosyalar: `services/api.ts` kalırsa `@/services/api` klasör yerine onu çözer.
  for (const old of ['api', 'apiAuth', 'apiHooks', 'apiPlatform']) {
    if (existsSync(join(root, `src/services/${old}.ts`))) notes.push(`src/services/${old}.ts eski yer: içeriği services/api/ altına taşınıp silinmeli.`);
  }
  return { stack: 'client-http', root, platform, entries, notes };
}

/**
 * Host'un stack'ini bulur ve Generator'daki asset listesini çıkarır; host tanınmazsa null. İstemci Express'ten önce:
 * ikisi de `package.json`'lı; istemci React bağımlılığından tanınır, Express host'unda yoktur.
 */
export function planHostAssets(root: string): AssetPlan | null {
  return dotnetPlan(root) ?? pythonPlan(root) ?? clientHttpPlan(root) ?? expressPlan(root);
}

export function diffAssets(plan: AssetPlan): AssetDiff[] {
  return plan.entries.map((entry) => {
    if (!existsSync(entry.target)) return { ...entry, status: 'missing' };
    if (entry.createOnly) return { ...entry, status: 'owned' };
    const current = readFileSync(entry.target, 'utf8');
    return { ...entry, current, status: current === entry.content ? 'same' : 'differs' };
  });
}

/** Yalnız `rels` içindeki (ve `same` olmayan) dosyaları yazar; yazılanların `rel` listesini döner. */
export function applyAssets(diffs: AssetDiff[], rels: Iterable<string>): string[] {
  const wanted = new Set(rels);
  const written: string[] = [];
  for (const diff of diffs) {
    if (!wanted.has(diff.rel) || diff.status === 'same' || diff.status === 'owned') continue;
    mkdirSync(dirname(diff.target), { recursive: true });
    writeFileSync(diff.target, diff.content, 'utf8');
    written.push(diff.rel);
  }
  return written;
}
