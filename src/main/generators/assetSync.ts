/**
 * Asset sync: core asset'ler host'a yalnız bir kez yazılır (create-only), Generator'daki sonraki
 * düzeltmeler var olan host'a gitmez. Bu modül host'un asset'lerini Generator'daki güncel hâliyle karşılaştırır ve
 * yalnız seçilen dosyaları yazar. Skeleton (Program.cs, appsettings, pyproject …) kapsam dışı: kullanıcı onları değiştirir.
 *
 * Üç stack: Express (`EXPRESS_CORE_BOOTSTRAP_FILES` → `src/core`), Python (`core/` → `<pkg>/core`), .NET (ortak +
 * sağlayıcı + id katmanı → `<Layer>/…`, bootstrap ile aynı katman sırası).
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

export type AssetStack = 'express-mongoose' | 'python-fastapi' | 'dotnet-efcore';
export type AssetStatus = 'missing' | 'same' | 'differs';

export interface AssetEntry {
  /** Host köküne göre yol (rapor ve seçim anahtarı). */
  rel: string;
  target: string;
  /** Generator'daki güncel içerik (token'lar uygulanmış). */
  content: string;
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

/** Host'un stack'ini bulur ve Generator'daki asset listesini çıkarır; host tanınmazsa null. */
export function planHostAssets(root: string): AssetPlan | null {
  return dotnetPlan(root) ?? pythonPlan(root) ?? expressPlan(root);
}

export function diffAssets(plan: AssetPlan): AssetDiff[] {
  return plan.entries.map((entry) => {
    if (!existsSync(entry.target)) return { ...entry, status: 'missing' };
    const current = readFileSync(entry.target, 'utf8');
    return { ...entry, current, status: current === entry.content ? 'same' : 'differs' };
  });
}

/** Yalnız `rels` içindeki (ve `same` olmayan) dosyaları yazar; yazılanların `rel` listesini döner. */
export function applyAssets(diffs: AssetDiff[], rels: Iterable<string>): string[] {
  const wanted = new Set(rels);
  const written: string[] = [];
  for (const diff of diffs) {
    if (!wanted.has(diff.rel) || diff.status === 'same') continue;
    mkdirSync(dirname(diff.target), { recursive: true });
    writeFileSync(diff.target, diff.content, 'utf8');
    written.push(diff.rel);
  }
  return written;
}
