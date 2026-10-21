import TableRowsOutlinedIcon from '@mui/icons-material/TableRowsOutlined';
import type { ComponentType } from 'react';
import type { AnyResource } from '../schema/extend.js';
import { ResourcePage } from './ResourcePage.js';
import { humanize } from './texts.js';

/** Resource başlığının i18n anahtarı (sayfa başlığı ve sol menü aynı anahtarı kullanır). */
export function resourceTitleKey(resource: Pick<AnyResource, 'name'>): string {
  return `admin.${resource.name}.title`;
}

/**
 * Host'un route + sol menü dizisiyle aynı şekil (Varlik360 `ProtectedRoutes`):
 * host bu kayıtları diziye ekleyince hem `<Route>` hem menü öğesi oluşur.
 */
export interface AdminRouteEntry {
  id: string;
  /** Menü metni için i18n anahtarı (host kendi `t`'siyle çevirir): `t(text, { defaultValue })`. */
  text: string;
  /** Anahtarın çevirisi yoksa gösterilecek metin: config `label`'ı, yoksa humanize edilmiş `name`. */
  defaultValue: string;
  path: string;
  element: ComponentType;
  icon: ComponentType;
  isProtected: true;
}

export interface CreateAdminRoutesOptions {
  /** Ör. `/admin` → `/admin/user-subscriptions`. Varsayılan: kök. */
  basePath?: string;
  /** Varsayılan: `admin.<resource>.title`. */
  textKey?: (resource: AnyResource) => string;
  defaultIcon?: ComponentType;
}

function byMenuOrder(a: AnyResource, b: AnyResource): number {
  const oa = a.menu?.order ?? Number.MAX_SAFE_INTEGER;
  const ob = b.menu?.order ?? Number.MAX_SAFE_INTEGER;
  return oa - ob || a.name.localeCompare(b.name);
}

/** Paket admin route'larını ve sol menü öğelerini kendisi üretir (karar 16.10.2026). */
export function createAdminRoutes(resources: readonly AnyResource[], options: CreateAdminRoutesOptions = {}): AdminRouteEntry[] {
  const base = (options.basePath ?? '').replace(/\/+$/, '');
  return [...resources].sort(byMenuOrder).map(resource => {
    const Element = () => <ResourcePage resource={resource} />;
    Element.displayName = `ResourcePage(${resource.name})`;
    return {
      id: `admin:${resource.name}`,
      text: options.textKey?.(resource) ?? resourceTitleKey(resource),
      defaultValue: resource.label ?? humanize(resource.name),
      path: `${base}/${resource.path ?? resource.name}`,
      element: Element,
      icon: resource.extensions?.icon ?? options.defaultIcon ?? TableRowsOutlinedIcon,
      isProtected: true
    };
  });
}
