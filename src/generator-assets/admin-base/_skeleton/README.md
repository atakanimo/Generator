# __App__ Admin

Generator ile kuruldu (`@atakanimo/ata-admin-base` paneli). Tema, sol menü, login, dil (tr / en), global loading ve toast'lar
Varlik360 / SharedFrame admin ile aynıdır.

## Çalıştırma

```bash
npm install        # ilk Frontend generate'ten önce: Generator kurulu admin-base sürümüne bakar (detay görünümü)
npm run dev        # http://localhost:5173 ; /api istekleri VITE_API_PROXY'ye (.env.development) gider
npm run typecheck
npm run build
```

Production'da `VITE_API_BASE_URL` backend köküdür (boşsa panelle aynı origin).

## Backend beklentisi

- Generator'ın ürettiği admin uçları (`modules/<m>` config'lerindeki `endpoint`).
- Ortak auth uçları (`__API_PREFIX__/auth/login`, `refresh`, `me`, `logout`); `user.role === 'admin'` değilse giriş
  reddedilir (`store/thunks/auth.thunk.ts` → `canSignIn`).

## Dosyalar

| Yol | Sahibi |
| --- | --- |
| `src/modules/<m>/<m>.generated.config.ts` | Generator, her generate'te yeniden yazılır |
| `src/modules/<m>/<m>.generated.ts` | Generator bir kez yazar, sonra sizin (`extendResource`: aksiyon, hücre, ikon) |
| `src/modules/resources.generated.ts` | Generator; bütün modüller |
| `src/services/api/*.generated.ts`, `src/types/API/response.generated.ts` | Generator, ortak HTTP katmanı (asset sync) |
| `src/services/auth.service.generated.ts`, `store/thunks/auth.thunk.generated.ts`, `store/slices/auth.slice.generated.ts` | Generator, ortak auth; uzantıları `auth.service.ts`, `auth.thunk.ts`, `auth.slice.ts` sizin |
| `src/services/api/hooks.ts` | Bir kez oluşturuldu, sizin (projeye özel HTTP davranışı) |
| Diğer her şey (`App.tsx`, `routes`, `layout`, `store`, `theme`, `i18n`, `pages`) | Bir kez oluşturuldu, sizin |

Yeni modül için host'ta değişiklik gerekmez: menü ve route `createAdminRoutes(resources)`'tan gelir. Menü başlığı
`i18n/locales/<dil>.ts` → `admin.<m>.title` (yoksa config etiketi). Elle yazılan sayfalar `routes/routes.ts`'e eklenir.

Kurallar: sayfalarda `try/catch` ve `.then` yok; veri `thunk` → `await dispatch(thunk()).unwrap()` ile gelir, toast /
loading interceptor'dadır (`services/api/api.generated.ts`). Importlar `.generated` dosyalardandır.
