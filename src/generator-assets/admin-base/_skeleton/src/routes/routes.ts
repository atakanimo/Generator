import { Dashboard as DashboardIcon } from '@mui/icons-material';
import { createAdminRoutes } from '@atakanimo/ata-admin-base';
import Dashboard from '@/pages/Dashboard';
import { resources } from '@/modules/resources.generated';

/** Menü başlığı: kaynaklar `admin.<resource>.title`, elle yazılan sayfalar `common.<text>`. */
export const routeTitle = (route: Pick<RouteObject, 'text' | 'titleKey' | 'defaultTitle'>, t: (key: string, options?: { defaultValue?: string }) => string) =>
  route.titleKey ? t(route.titleKey, { defaultValue: route.defaultTitle }) : t(`common.${route.text}`);

export type RouteObject = {
  id: number | string;
  /** i18n anahtarı (`common`), elle yazılan sayfalar. */
  text: string;
  /** @atakanimo/ata-admin-base kaynakları: tam i18n anahtarı (`admin.<resource>.title`) + çeviri yoksa config etiketi. */
  titleKey?: string;
  defaultTitle?: string;
  path: string;
  element: React.ComponentType;
  icon: React.ComponentType;
  isProtected: boolean;
};

/** Sol menü sırası. Yeni modül için burada değişiklik gerekmez: Generator `modules/resources.generated.ts`'e ekler. */
export const ProtectedRoutes: RouteObject[] = [
  { id: 'dashboard', text: 'dashboard', path: '/dashboard', element: Dashboard, icon: DashboardIcon, isProtected: true },
  // Generator'ın ürettiği kaynaklar: `modules/resources.generated.ts`
  ...createAdminRoutes(resources).map(route => ({ ...route, titleKey: route.text, defaultTitle: route.defaultValue }))
];
