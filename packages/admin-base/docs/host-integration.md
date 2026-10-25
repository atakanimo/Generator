# Host entegrasyonu

Örnek host: Varlik360 `apps/admin`.

## 1. Bağımlılık

- Geliştirmede `file:` ile: `"@atakanimo/ata-admin-base": "file:<göreli yol>/Generator/packages/admin-base"`. Paket önce derlenmiş olmalı (`npm run build` → `dist/`).
- Peer'lar host'ta kurulu olmalı: `react`, `react-dom`, `@mui/material`, `@mui/icons-material`, `@mui/x-data-grid`, `@mui/x-date-pickers`, `@emotion/react`, `@emotion/styled`, `@tanstack/react-query`, `axios`, `dayjs` (tam liste `package.json` `peerDependencies`).
- Vite `resolve.dedupe`: `react`, `react-dom`, `@mui/material`, `@emotion/react`, `@emotion/styled`, `@tanstack/react-query`, `axios`. Paketin kendi `node_modules`'undaki axios tipleri çakışırsa tsconfig `paths` ile host'unkine yönlendirilir.

## 2. Provider

```tsx
import { AtaAdminProvider, createAtaRestProvider } from '@atakanimo/ata-admin-base';
import 'dayjs/locale/tr';
import { API } from '@/services/api';                         // interceptor'lı host axios'u
import { resources } from '@/modules/resources.generated';

<AtaAdminProvider
  dataProvider={createAtaRestProvider({ http: API })}
  resources={resources}
  t={(key, options) => i18n.t(key, options)}   // paket metinleri ataAdmin.*
  dateLocale='tr'
  getCurrentUserId={() => store.getState().auth.user?.id}   // dynamic: 'currentUserId' için
>
  <App />
</AtaAdminProvider>
```

`queryClient` verilmezse paket kendi QueryClient'ını kurar.

`http` bir `AxiosInstance` ya da yalnız `request(config)`'i olan bir sarmalayıcı olabilir (`AtaHttp`). `request` zarfı (`LocalResponse`) döndürmeli; interceptor'ı başarıda axios yanıtını dönen host'larda (ör. StockExchange) küçük bir köprü yazılır: `request: async (c) => (await api.request(c)).data`.

## 3. Interceptor (sözleşme §7)

1. Başarıda `LocalResponse` ile resolve, hatada `LocalResponse` ile reject.
2. `config.skipLoading` → global loading açılmaz.
3. `config.skipSuccessToast` → başarı toast'u yok.
4. `axios.isCancel(error)` → toast yok.
5. Token ve 401 host'un işi. Bayraklar header değil axios config alanıdır.
6. `responseType: 'blob'` (export): başarıda axios yanıtını (`data` Blob, `headers['content-disposition']`) ya da çıplak Blob'u döner; hatada Blob'daki JSON zarfı `LocalResponse`'a çevirip reject eder. Çıplak Blob'da dosya adı `<name>.csv` olur. BE farklı origin'deyse `Access-Control-Expose-Headers: Content-Disposition` gerekir.

Paketin koyduğu bayraklar: list / getOne `skipSuccessToast`; autocomplete `skipSuccessToast` + `skipLoading`; export `skipSuccessToast` + `responseType: 'blob'`; yazma ve aksiyonlar bayraksız.

## 4. Route + menü

```ts
import { createAdminRoutes } from '@atakanimo/ata-admin-base';

export const ProtectedRoutes = [
  ...handWrittenRoutes,
  ...createAdminRoutes(resources, { textKey: r => r.label ?? r.name }),
];
```

Her kayıt `{ id, text, path, element, icon, isProtected }`. Seçenekler: `basePath`, `textKey`, `defaultIcon`. Yeni modül host'ta değişiklik istemez; Generator `resources.generated.ts`'i günceller.

## 5. Metinler

- Paket metinleri `adminBaseTexts` (Türkçe). Host isterse i18next'e `addResourceBundle` ile ekleyip çevirir.
- DataGrid metinleri MUI `trTR`'den.
- Kök `<html lang="tr">` olmalı; CSS büyük harf dönüşümü `SİL` versin diye.
