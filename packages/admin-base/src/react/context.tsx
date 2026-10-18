import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { DataProvider } from '../data/dataProvider.js';
import { createAdminQueryClient } from '../data/queryClient.js';
import type { AnyResource } from '../schema/extend.js';
import { fallbackTranslate, type Translate } from '../ui/texts.js';

interface AtaAdminContextValue {
  dataProvider: DataProvider;
  resources: ReadonlyMap<string, AnyResource>;
  t: Translate;
  getCurrentUserId?: () => string | null | undefined;
}

const AtaAdminContext = createContext<AtaAdminContextValue | null>(null);

export interface AtaAdminProviderProps {
  dataProvider: DataProvider;
  /** Generator'ın ürettiği `resources.generated.ts`; ilişkiler `ref` ile buradan çözülür. */
  resources: readonly AnyResource[];
  /** Host'un i18next `t`'si; verilmezse paketin Türkçe varsayılanları kullanılır. */
  t?: Translate;
  /** dayjs locale (ör. `tr`); host `dayjs/locale/tr`'yi import etmiş olmalı. */
  dateLocale?: string;
  /** Verilmezse `createAdminQueryClient()` kullanılır. */
  queryClient?: QueryClient;
  /** Oturumdaki kullanıcının id'si: `default: { dynamic: 'currentUserId' }` alanları için. */
  getCurrentUserId?: () => string | null | undefined;
  children: ReactNode;
}

function toRegistry(resources: readonly AnyResource[]): ReadonlyMap<string, AnyResource> {
  const registry = new Map<string, AnyResource>();
  for (const resource of resources) {
    if (registry.has(resource.name)) {
      throw new Error(`[admin-base] Duplicate resource name "${resource.name}".`);
    }
    registry.set(resource.name, resource);
  }
  return registry;
}

export function AtaAdminProvider({ dataProvider, resources, t, dateLocale, queryClient, getCurrentUserId, children }: AtaAdminProviderProps) {
  const [client] = useState(() => queryClient ?? createAdminQueryClient());
  const value = useMemo(
    () => ({ dataProvider, resources: toRegistry(resources), t: t ?? fallbackTranslate, getCurrentUserId }),
    [dataProvider, resources, t, getCurrentUserId]
  );

  return (
    <QueryClientProvider client={client}>
      <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale={dateLocale}>
        <AtaAdminContext.Provider value={value}>{children}</AtaAdminContext.Provider>
      </LocalizationProvider>
    </QueryClientProvider>
  );
}

export function useAtaAdmin(): AtaAdminContextValue {
  const value = useContext(AtaAdminContext);
  if (!value) throw new Error('[admin-base] useAtaAdmin must be used inside <AtaAdminProvider>.');
  return value;
}
