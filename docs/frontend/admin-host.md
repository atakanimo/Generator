# Yeni admin paneli (`@atakanimo/ata-admin-base` host)

Generator boş bir klasöre, Varlik360 / SharedFrame admin'iyle aynı kabuğu kurar: tema (light / dark, palet ve tipografi), sol menü, login, Redux store, axios interceptor, i18n (tr / en) ve hook'lar. Modül ekranları sonradan Frontend generate'in yazdığı config'ten gelir ([admin-base-config.md](admin-base-config.md)); host'ta sayfa / route / reducer eklenmez.

Kod: iskelet `src/generator-assets/admin-base/_skeleton/`, yazıcı `src/main/generators/admin-base/AdminHostBootstrap.ts`, IPC `src/main/ipc/adminPanel.ts` (`project:bootstrapAdmin`), bilgi + backend varsayılanları `src/shared/adminPanel.ts`.

## Arayüz

- Proje seçimi kartında **Yeni Admin paneli**: klasör + panel adı + backend. Açık proje değişmez (panel FE klasörüdür).
- **Yeni … projesi** diyaloğunda **Admin paneli de kur** (varsayılan açık): backend kurulduktan sonra `<host>/apps/admin`'e panel kurulur. Bu yol `adminDir`'in varsayılanıdır; Frontend generate oraya yazar.

## Kurulan dosyalar

Hepsi K (bir kez yazılır, sonra kullanıcının); `modules/resources.generated.ts` G (boş liste, ilk generate'te yeniden yazılır).

| Yol | İçerik |
| --- | --- |
| `package.json`, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `.prettierrc` | React 19, Vite 7, MUI 7, admin-base (`packages/admin-base` sürümü), `@` takma adı, peer `dedupe`, `/api` proxy |
| `.env.development`, `.env.example` | `VITE_API_PROXY` (dev), `VITE_API_BASE_URL` (prod), `VITE_APP_ENV` |
| `src/config/app.ts` | Tema anahtarı (`storage.themeMode`), ana sayfa (`homePath`); panel adı i18n'de (`common.name`) |
| `src/App.tsx` | Redux `Provider`, `ThemeProvider`, `AtaAdminProvider` (rest provider, `t`, tarih dili, `getCurrentUserId`), router, loading, toast |
| `src/routes/` | `routes.ts`: menü sırası (Dashboard, `createAdminRoutes(resources)`); `ProtectedRoute` |
| `src/layout/MainLayout.tsx` | `AtaAdminLayout` (ortam etiketi, sürüm, dil / tema, çıkış) |
| `src/pages/` | Login (`AtaLoginPage`), Dashboard (`AdminDashboard`); tema ve dil üst bardaki düğmelerden |
| `src/store/` | `theme` (mod tarayıcıda saklanır, çekmece), `auth` (login / me / logout thunk'ları, access + refresh token, "beni hatırla"), `common` (global loading) |
| `src/services/api/` | ortak http katmanı (`index.ts` interceptor: token, loading, `uiMessage` / hata toast'u, 401 → tek seferlik refresh, olmazsa çıkış; `hooks.ts`, `auth.ts`, `platform.ts`). `services/auth.service.ts` auth istisnası |
| `src/hooks/`, `src/theme/`, `src/i18n/`, `src/components/`, `src/helper/`, `src/types/`, `src/utils/` | SharedFrame admin ile aynı |

Tokenlar: `__App__` panel adı, `__app__` npm adı (`OrdersApi` → `orders-api-admin`, `OrdersAdmin` → `orders-admin`), `__API_PREFIX__` / `__API_DEV_URL__` backend'e göre:

| Backend | Auth öneki | Dev proxy |
| --- | --- | --- |
| Express | `/api` | `http://localhost:3000` |
| .NET | `/api` | `http://localhost:5080` |
| Python | `/api/v1` | `http://localhost:8000` |

Kurulumdan sonra ilk Frontend generate'ten önce panelde `npm install` yapılır: uzantı dosyasının `detail: true`'su kurulu admin-base sürümüne bakar (`hostSupportsDetail`), paket yoksa yazılmaz.

## Backend beklentisi

Generator'ın kurduğu Express / .NET / Python host'u bu uçları zaten verir ([../backend/auth.md](../backend/auth.md), sözleşme §8). Panel şunları kullanır:

- `POST <önek>/auth/login` → `AuthSession` (`{ accessToken, refreshToken, expiresIn, user }`); `user.role !== 'admin'` girişte reddedilir ve o refresh token `logout` ile iptal edilir.
- `GET <önek>/auth/me` → `AuthUser`: kayıtlı token açılışta bununla doğrulanır.
- `POST <önek>/auth/refresh` `{ refreshToken }` → yeni çift: `services/api/api.generated.ts` 401'de bir kez çağırır (aynı anda gelen 401'ler tek isteği bekler), isteği bir kez tekrarlar; başarısızsa `clearSession`.
- `POST <önek>/auth/logout` `{ refreshToken }`: çıkışta; cevap ne olursa olsun yerel oturum kapanır.

Kurulum HTTP katmanını asset sync ile (`services/api/*.generated.ts`, `hooks.ts`, `types/API/response.generated.ts`) ve auth'u `generateClientAuthFiles` ile (G: `auth.service` / `auth.thunk` / `auth.slice` `.generated`, K uzantıları; admin `canSignIn`) yazar ([../backend/auth.md](../backend/auth.md#i̇stemciler)). Token'lar "Beni hatırla" seçimine göre `localStorage` ya da `sessionStorage`'da (`services/api/auth.generated.ts`, önek paket adı); uçlar `services/auth.service.generated.ts`'te.

## Kurallar

Sayfalarda `try/catch` ve `.then` yok: `const { isSuccess } = await dispatch(thunk()).unwrap()`. Thunk'lar her zaman fulfilled döner; toast ve loading interceptor'dadır.

## Doğrulama

`node scripts/verify/admin-bootstrap.mjs [--install] [--keep]`: her backend için kurulum, token kalmadı, önek / proxy, bilgi ağacı, ikinci kurulum reddi; `--install` ile `npm install` + iki Varlik360 modülünün config'i + `npm run typecheck` + `npm run build`.
