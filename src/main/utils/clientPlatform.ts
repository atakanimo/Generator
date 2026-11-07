/**
 * İstemci uygulamasının platformunu çözer (docs/frontend/http-layer.md "Platform tespiti"): önce manifest'teki seçim
 * (`workspace.clientPlatforms`), yoksa `package.json` tespiti. Tespit edilen değer manifest'e yazılır; elle değiştirmek
 * için `setClientPlatform`.
 */
import { existsSync, readFileSync } from 'fs';
import { isAbsolute, join, relative, resolve } from 'path';
import { detectClientPlatform, isClientPlatform, type ClientPlatform, type PackageJsonLike } from '../../shared/clientPlatform.js';
import { getWorkspacePreferences, updateWorkspacePreferencesInManifest } from './manifestSnapshot.js';

const MANIFEST = join('.generator', 'manifest.json');

export interface ResolvedClientPlatform {
  platform: ClientPlatform | null;
  /** `manifest`: kayıtlı (elle ya da daha önce tespit edilmiş); `detected`: bu çağrıda `package.json`'dan. */
  source: 'manifest' | 'detected' | 'none';
}

/** Manifest anahtarı: workspace köküne göre `/` ayraçlı klasör (`apps/admin`); kök için `.`. */
export function clientAppKey(workspaceRoot: string, appDir: string): string {
  const abs = isAbsolute(appDir) ? appDir : join(workspaceRoot, appDir);
  const rel = relative(resolve(workspaceRoot), resolve(abs)).replace(/\\/g, '/');
  return rel || '.';
}

export function readPackageJson(appDir: string): PackageJsonLike | null {
  const path = join(appDir, 'package.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as PackageJsonLike;
  } catch {
    return null;
  }
}

/** Yalnız `package.json`'dan; manifest'e bakmaz, yazmaz. */
export function detectClientPlatformAt(appDir: string): ClientPlatform | null {
  return detectClientPlatform(readPackageJson(appDir));
}

/**
 * Kayıtlı seçim varsa onu, yoksa tespiti döner. `remember` (varsayılan `true`): tespit edilen değer manifest'e yazılır,
 * sonraki çağrılar ve elle değiştirme oradan devam eder.
 */
export function resolveClientPlatform(workspaceRoot: string, appDir: string, remember = true): ResolvedClientPlatform {
  const key = clientAppKey(workspaceRoot, appDir);
  const saved = getWorkspacePreferences(workspaceRoot)?.clientPlatforms?.[key];
  if (isClientPlatform(saved)) return { platform: saved, source: 'manifest' };

  const platform = detectClientPlatformAt(isAbsolute(appDir) ? appDir : join(workspaceRoot, appDir));
  if (!platform) return { platform: null, source: 'none' };
  if (remember) updateWorkspacePreferencesInManifest(workspaceRoot, { clientPlatforms: { [key]: platform } });
  return { platform, source: 'detected' };
}

/** Uygulama klasöründen yukarı çıkıp `.generator/manifest.json`'u olan workspace kökünü bulur; yoksa null. */
export function findClientWorkspaceRoot(appDir: string): string | null {
  let dir = resolve(appDir);
  for (let i = 0; i < 32; i++) {
    if (existsSync(join(dir, MANIFEST))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

/**
 * Uygulama klasöründen çözüm: workspace manifest'i varsa oradaki seçim, yoksa tespit. `remember` verilmezse manifest'e
 * yazmaz (asset sync özeti gibi salt okunur akışlar).
 */
export function resolveClientPlatformAt(appDir: string, remember = false): ResolvedClientPlatform {
  const workspaceRoot = findClientWorkspaceRoot(appDir);
  if (workspaceRoot) return resolveClientPlatform(workspaceRoot, appDir, remember);
  const platform = detectClientPlatformAt(appDir);
  return { platform, source: platform ? 'detected' : 'none' };
}

/** Elle seçim: tespitin önüne geçer. */
export function setClientPlatform(workspaceRoot: string, appDir: string, platform: ClientPlatform) {
  return updateWorkspacePreferencesInManifest(workspaceRoot, { clientPlatforms: { [clientAppKey(workspaceRoot, appDir)]: platform } });
}
