/**
 * New admin panel (`@atakanimo/ata-admin-base` host) for the "Yeni Admin paneli" button and the "Admin paneli de kur"
 * option of the backend dialog: the info popover, the backend defaults the skeleton is wired to, and the folder.
 *
 * Kept in line with `docs/frontend/admin-host.md` (the long form). `scripts/verify/admin-bootstrap.mjs` bootstraps a
 * panel and checks that every tree entry marked `bootstrap` exists.
 */

import type { BackendStack } from './backendDatabase.js';
import type { ProjectInfo } from './backendStacks.js';

/** Panel folder inside a new backend host (same as the `adminDir` fallback). */
export const ADMIN_PANEL_DIR = 'apps/admin';

export interface AdminBackendDefaults {
  /** Prefix of the auth endpoints (`<prefix>/auth/login`, `<prefix>/auth/me`). */
  apiPrefix: string;
  /** Backend URL the Vite dev server proxies `/api` to. */
  devUrl: string;
}

/** Ports and prefixes of the stack skeletons (Express `.env.example`, .NET `launchSettings.json`, Python `core/config.py`). */
export const ADMIN_BACKEND_DEFAULTS: Record<BackendStack, AdminBackendDefaults> = {
  'nodejs-mongoose': { apiPrefix: '/api', devUrl: 'http://localhost:3000' },
  'dotnet-ef': { apiPrefix: '/api', devUrl: 'http://localhost:5080' },
  'python-fastapi': { apiPrefix: '/api/v1', devUrl: 'http://localhost:8000' }
};

export const ADMIN_STACK_LABELS: Record<BackendStack, string> = {
  'nodejs-mongoose': 'Express',
  'dotnet-ef': '.NET',
  'python-fastapi': 'Python'
};

export const ADMIN_PANEL_INFO: ProjectInfo = {
  label: 'Yeni Admin paneli',
  summary:
    'React + Vite + @atakanimo/ata-admin-base: Varlik360 / SharedFrame admin ile aynı tema, sol menü, login, state, i18n ve hook\'lar. Modül ekranları Generator\'ın config\'inden gelir.',
  technologies: [
    { label: 'Dil', value: 'TypeScript 5.8, React 19' },
    { label: 'Build', value: 'Vite 7 (dev: /api → backend proxy)' },
    { label: 'UI', value: 'MUI 7 + @atakanimo/ata-admin-base (tablo, form, filtre, layout, login)' },
    { label: 'State', value: 'Redux Toolkit (tema, auth, loading); kaynak verisi TanStack Query (paket)' },
    { label: 'Navigasyon', value: 'react-router 7, menü = createAdminRoutes(resources) + elle sayfalar' },
    { label: 'Localization', value: 'i18next (tr / en) + adminBaseTexts' },
    { label: 'HTTP', value: 'Ortak HTTP katmanı (services/api/*.generated.ts): token, loading, toast, 401 → refresh' }
  ],
  tree: [
    { depth: 0, name: 'package.json', owner: 'K', bootstrap: true },
    { depth: 0, name: 'vite.config.ts', owner: 'K', note: '@ takma adı, /api proxy', bootstrap: true },
    { depth: 0, name: 'tsconfig.json', owner: 'K', bootstrap: true },
    { depth: 0, name: '.env.development', owner: 'K', note: 'VITE_API_PROXY', bootstrap: true },
    { depth: 0, name: '.env.example', owner: 'K', bootstrap: true },
    { depth: 0, name: 'src/' },
    { depth: 1, name: 'App.tsx', owner: 'K', note: 'Provider, tema, AtaAdminProvider, router', bootstrap: true },
    { depth: 1, name: 'config/app.ts', owner: 'K', note: 'tema anahtarı, ana sayfa', bootstrap: true },
    { depth: 1, name: 'routes/', owner: 'K', note: 'routes.ts: sol menü sırası, ProtectedRoute', bootstrap: true },
    { depth: 1, name: 'layout/MainLayout.tsx', owner: 'K', note: 'AtaAdminLayout', bootstrap: true },
    { depth: 1, name: 'pages/', owner: 'K', note: 'Login, Dashboard', bootstrap: true },
    { depth: 1, name: 'store/', owner: 'K', note: 'theme, common slice; auth.slice / auth.thunk (.generated = G)', bootstrap: true },
    { depth: 1, name: 'hooks/', owner: 'K', note: 'redux, useTheme, useCustomTranslation', bootstrap: true },
    { depth: 1, name: 'services/api/', owner: 'G', note: 'ortak HTTP katmanı (asset sync); hooks.ts K', bootstrap: true },
    { depth: 1, name: 'services/auth.service.generated.ts', owner: 'G', note: 'ortak auth uçları; auth.service.ts K', bootstrap: true },
    { depth: 1, name: 'theme/', owner: 'K', note: 'palet, tipografi (light / dark)', bootstrap: true },
    { depth: 1, name: 'i18n/', owner: 'K', note: 'locales/tr · en', bootstrap: true },
    { depth: 1, name: 'components/', owner: 'K', note: 'Toast, LoadingOverlay…', bootstrap: true },
    { depth: 1, name: 'modules/' },
    { depth: 2, name: 'resources.generated.ts', owner: 'G', bootstrap: true },
    { depth: 2, name: '<m>/<m>.generated.config.ts', owner: 'G' },
    { depth: 2, name: '<m>/<m>.generated.ts', owner: 'K', note: 'extendResource: aksiyon, hücre' }
  ],
  placeholders: '<m> modül (admin route adı, kebab-case)',
  runCommands: [
    { command: 'npm install' },
    { command: 'npm run dev', comment: 'http://localhost:5173 (backend açık olmalı)' },
    { command: 'npm run typecheck' },
    { command: 'npm run build', comment: 'production: VITE_API_BASE_URL' }
  ],
  doc: 'docs/frontend/admin-host.md',
  appName: { placeholder: 'OrdersAdmin', helper: 'Panel başlığı; paket adı kebab-case olur (OrdersAdmin → orders-admin)' }
};
