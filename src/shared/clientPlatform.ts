/**
 * Bir istemci uygulamasının platformu (docs/frontend/http-layer.md "Platform tespiti"): admin, web ya da mobil.
 * `package.json` bağımlılıklarından anlaşılır; manifest'e yazılan seçim (`workspace.clientPlatforms`) her zaman önce gelir.
 */
export type ClientPlatform = 'admin' | 'web' | 'mobile';

export const CLIENT_PLATFORMS: readonly ClientPlatform[] = ['admin', 'web', 'mobile'];

export const CLIENT_PLATFORM_LABELS: Record<ClientPlatform, string> = {
  admin: 'Admin',
  web: 'Web',
  mobile: 'Mobil'
};

/** Ortak `api.ts`'in platform adaptörü (`client-http/platform/<adapter>`). */
export const CLIENT_HTTP_ADAPTER: Record<ClientPlatform, 'browser' | 'mobile'> = {
  admin: 'browser',
  web: 'browser',
  mobile: 'mobile'
};

/** Data layer preset'i (`client-redux`); admin admin-base kullanır, preset'i yok. */
export const CLIENT_REDUX_PRESET: Record<ClientPlatform, 'redux-web' | 'redux-rn' | null> = {
  admin: null,
  web: 'redux-web',
  mobile: 'redux-rn'
};

export interface PackageJsonLike {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const ADMIN_PACKAGE = '@atakanimo/ata-admin-base';
const MOBILE_PACKAGES = ['react-native', 'expo'];
const WEB_PACKAGES = ['react-dom', 'react'];

/**
 * Sıra önemlidir: admin paketi olan uygulama React'tır da (admin > web); React Native uygulaması `react`'ı da taşır
 * (mobil > web). Hiçbiri yoksa istemci değildir (`null`).
 */
export function detectClientPlatform(pkg: PackageJsonLike | null | undefined): ClientPlatform | null {
  if (!pkg) return null;
  const deps = { ...(pkg.devDependencies ?? {}), ...(pkg.dependencies ?? {}) };
  if (ADMIN_PACKAGE in deps) return 'admin';
  if (MOBILE_PACKAGES.some(name => name in deps)) return 'mobile';
  if (WEB_PACKAGES.some(name => name in deps)) return 'web';
  return null;
}

export function isClientPlatform(value: unknown): value is ClientPlatform {
  return typeof value === 'string' && (CLIENT_PLATFORMS as readonly string[]).includes(value);
}
