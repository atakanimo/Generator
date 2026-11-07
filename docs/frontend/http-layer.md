# Ortak HTTP katmanı (api.ts)

Sunucu zarfı bütün BE stack'lerinde aynıdır (`docs/api-contract.md` §1, §7). Bu yüzden FE'de interceptor da aynıdır:
**tek `services/api/index.ts`** (kısaca api.ts) admin, web ve mobilde birebir aynıdır. Token, loading, dil, refresh,
401, dosya ve mesaj kuralları orada. Platformun farkı küçük bir adaptörde (`api/platform.ts`), oturum (token, refresh)
köprüde (`api/auth.ts`), projenin farkı `api/hooks.ts`'tedir. Önce api.ts ortaklaşır; auth sonra (köprü değişir, api.ts
değişmez).

HTTP altyapısı `services/api/` klasöründedir; `services/` kökünde yalnız `<modül>.service.ts` durur. Import
değişmez: `@/services/api` (ya da servislerde `./api`) klasörün `index.ts`'ine çözülür. Eski düz `services/api.ts`
kalırsa klasörün önüne geçer; parity script'i bunu hata sayar.

Kaynak: `src/generator-assets/client-http/`

| Dosya | Projedeki yeri | Admin | Web | Mobil |
| --- | --- | --- | --- | --- |
| `shared/services/api/index.ts` | `src/services/api/index.ts` | ortak | ortak | ortak |
| `shared/types/API/response.ts` | `src/types/API/response.ts` (`@/types` re-export) | ortak | ortak | ortak |
| `platform/browser/services/api/platform.ts` | `src/services/api/platform.ts` | ✓ | ✓ | |
| `platform/mobile/services/api/platform.ts` | `src/services/api/platform.ts` | | | ✓ |
| `auth-bridge/*/services/api/auth.ts` | `src/services/api/auth.ts` | proje | proje | proje |
| `shared/services/api/hooks.ts` | `src/services/api/hooks.ts` | proje | proje | proje |

## Generator'dan yazma (asset sync)

Projeye Generator yazar, elle kopyalanmaz: istemci uygulaması da asset sync'in bir stack'idir (`client-http`,
`src/main/generators/assetSync.ts`; BE core asset'leriyle aynı akış).

```bash
node scripts/assets-sync.mjs <uygulama klasörü>                    # özet: eksik / farklı / aynı / proje (yazmaz)
node scripts/assets-sync.mjs <uygulama klasörü> --diff [yol…]
node scripts/assets-sync.mjs <uygulama klasörü> --apply yol [yol…] | --apply-all
```

- Ortak dosyalar (`api/index.ts`, `api/platform.ts`, `types/API/response.ts`): Generator'daki hâliyle karşılaştırılır,
  farklıysa seçilince yazılır. api.ts'te değişiklik Generator'da yapılır, sonra bu komutla projelere gider.
- Projeye ait dosyalar (`api/auth.ts`, `api/hooks.ts`): yalnız yoksa yazılır; varsa `proje` olarak listelenir, içeriğine
  bakılmaz. `auth.ts` başlangıcı: `services/authRefresh.generated.ts` varsa `generated`, yoksa admin → `legacy-admin`,
  mobil → `legacy-mobile`; üretilen auth'u olmayan web'de yazılmaz, not düşülür. Elle refresh'i olan admin
  (`admin-refresh`) seçilmez; dosyası zaten olan projede kalır.
- Notlar: eski düz dosyalar (`services/api.ts`, `apiAuth.ts` …) varsa taşınması söylenir; dokunulmaz.
- Özet salt okunurdur: manifest'e de yazmaz.
- Henüz yazmayan yer: yeni admin paneli (bootstrap skeleton'ı) shared-auth merge'ünden sonra bu katmana geçer.

Gate: `node scripts/verify/client-http-sync.mjs`. Projelerdeki kopyaların eşliği ayrıca:
`node scripts/verify/http-layer-parity.mjs --app <klasör> [--app <klasör> …]` (elle platform: `--app mobile=<klasör>`).

## Platform tespiti

`src/shared/clientPlatform.ts` (`detectClientPlatform`), uygulama klasörünün `package.json` bağımlılıklarından:

1. `@atakanimo/ata-admin-base` → **admin**
2. `react-native` ya da `expo` → **mobil**
3. `react-dom` ya da `react` → **web**
4. hiçbiri → istemci değil (`null`)

Sıra önemli: admin de React'tır, React Native de `react` taşır.

Kayıt: `src/main/utils/clientPlatform.ts`. `resolveClientPlatform(workspaceRoot, appDir, remember)` önce manifest'teki
`workspace.clientPlatforms["apps/admin"]`'a bakar; yoksa tespit eder (`remember` ise oraya yazar). Asset sync
`resolveClientPlatformAt(appDir)` ile workspace kökünü yukarı doğru bulur ve yazmaz. `setClientPlatform` elle seçimdir
ve tespitin önüne geçer. Platformdan türeyenler: adaptör (`CLIENT_HTTP_ADAPTER`: admin + web → `browser`, mobil →
`mobile`) ve data layer preset'i (`CLIENT_REDUX_PRESET`: web → `redux-web`, mobil → `redux-rn`, admin → yok).

İki preset de bayrakları axios config'ine yazar (`common.generated.ts` `requestFlags`); header seçeneği kalktı.
Projeye özel header'lar (`premiumUx`, `silentStatuses`) header olarak kalır ve `api/hooks.ts` okur.

## api.ts'in beklediği (her uygulamada)

- `@/store/slices/common.slice`: `setCommonLoading(boolean)`. Global loading'i yalnız api.ts açar / kapatır (sayaç
  api.ts'te); uygulama yalnız okur.
- `injectStore(store)`: store oluşunca çağrılır (mobil dahil).
- `i18next` örneği: dil header'ı ve genel hata metni.
- `./auth.ts` (`services/api/auth.ts`): oturum köprüsü (aşağıda).

## `api/auth.ts` (oturum köprüsü)

`ApiAuth` (`@/types`): `getAccessToken(state)`, `hasSession(state)`, `refreshSessionOnce(dispatch)`, `isAuthRequest(url)`.
Dosya bu dört adı export eder.

| Örnek | Kim kullanır |
| --- | --- |
| `auth-bridge/generated` | üretilen auth'u olanlar (`authStorage` / `authRefresh.generated`, `state.auth.accessToken`): SharedFrame web, StockExchange web; auth ortaklaşınca herkes |
| `auth-bridge/legacy-admin` | refresh'i olmayan admin (`state.auth.token` + storage helper; 401 → `logout()`) |
| `auth-bridge/legacy-mobile` | refresh'i olmayan mobil (`state.auth.token`; 401 → `resetAuthState()`) |

Elle yazılmış refresh'i olan (SharedFrame admin, StockExchange admin) kendi `refreshSessionOnce`'unu köprüye taşır.

## Davranış (üçünde aynı)

| Konu | Kural |
| --- | --- |
| Token | `apiAuth.getAccessToken(state)` (store'daki; yoksa storage helper'ı) |
| Loading | `skipLoading` yoksa sayaç; ilk istekte `setCommonLoading(true)`, son biten istekte `false` |
| Dil | Her istekte yalnız `Accept-Language` = kullanılan dilin kısa kodu (`i18n.resolvedLanguage`, `tr-TR` → `tr`; desteklenmeyen cihaz dili → i18next'in düştüğü dil). Çağrı kendi `Accept-Language`'ını verdiyse (içeriğin dili) dokunulmaz (api-contract §1.1, K6) |
| Başarı mesajı | `uiMessage` varsa; GET / HEAD, `/get-all`, `/me` ve `skipSuccessToast` hariç (mobil adaptörü göstermez) |
| Hata mesajı | Bir kez, interceptor'da; `skipErrorToast` ya da `apiHooks.onError` → `true` ise yok |
| Dosya | `data` Blob ise `LocalResponse<Blob>` + `fileName` (`Content-Disposition`); hata gövdesi Blob'daysa JSON zarf okunur |
| 2xx `isSuccess: false` | Hata olarak reject |
| İptal | Sessiz; `LocalResponse` (`isSuccess: false`) ile reject |
| 401 | Auth ucu değilse tek seferlik `apiAuth.refreshSessionOnce` (aynı anda gelenler aynı çağrıyı bekler), istek bir kez tekrar. Oturum bittiyse (`hasSession` → `false`) **uçuştaki bütün istekler iptal**, mesaj bir kez. Ağ hatasında oturum kalır. |
| Bayraklar | `skipLoading`, `skipSuccessToast`, `skipErrorToast`: axios **config** alanı, header değil (§7.7) |

## Platform adaptörü

| | browser (admin + web) | mobile |
| --- | --- | --- |
| `BASE_URL` | `import.meta.env.VITE_API_BASE_URL` | `@env` `API_URL`; Android emulator'da `localhost` → `10.0.2.2` |
| `showSuccessMessage` | `showSuccess` toast | yok |
| `showErrorMessage` | `showError` toast | `InfoAlert`, aynısı 4 sn içinde bir kez |

## `api/hooks.ts` (projeye özel)

```ts
export const apiHooks: ApiHooks = {
  onRequest,          // ek header ya da isteği durdurma (LocalResponse dönerse istek gitmez)
  onResponseHeaders,  // cevap header'ı okuma
  onError             // true → hata mesajı yok
};
```

## Tek tip: `LocalResponse`

```ts
interface ErrorData { header: string; message: string; code: number; field?: string }
interface LocalResponse<T> {
  isSuccess: boolean; data: T; uiMessage: string; errorData: ErrorData | null;
  statusCode?: number; traceId?: string; fileName?: string;
}
```

Düzleştirilmiş alanlar (`uiError`, `uiErrorCode`, `uiErrorField`) yoktur: `errorData.message`, `.code`, `.field`.

## Geçiş

Sıra: önce api.ts (bu sayfa), sonra auth (köprüler `auth-bridge/generated`'a geçer). Taşınanlar yalnız çalışma
kopyasında (commit yok); tarayıcıda / cihazda denenmedi.

| Proje | Durum | `api/auth.ts` | `api/hooks.ts` | Diğer |
| --- | --- | --- | --- | --- |
| CeyizDefterim admin, Varlik360 admin | ✓ 2026-11-07 | legacy-admin (Varlik360: `resetAuthState`) | — | `commonSlice.ts` → `common.slice.ts`; camelCase dosyalar → `.slice` / `.service` / `.thunk` |
| SharedFrame admin, StockExchange admin | ✓ 2026-11-07 | admin-refresh | — | aynı; StockExchange: `parseLocalResponse` `meta` / `details` bırakır, `request.ts` kalır (zaman aşımı + zarf yardımcıları; dil header'ı ortak api.ts'te) |
| SharedFrame web | ✓ 2026-11-07 | generated | `X-Guest-Key` (`onRequest`, `onResponseHeaders`) | `incLoading` / `decLoading` / `loadingCount` → `setCommonLoading` + `isLoading`; QrKit `uiErrorField` → `errorData.field` |
| StockExchange web | ✓ 2026-11-07 | generated | 461 günlük kota mesajı (`onError`, plana göre) | aynı loading değişikliği (`GlobalLoader` `isLoading`); `apiLocalRequest` / `apiExportRequest` → `services/request.ts`; `parseLocalResponse` silindi; `meta` / `traceId` / `details` kalktı; `errors.general` / `errors.networkError` çevirisi eklendi; `components/index.ts` (toast barrel) |
| CeyizDefterim mobil | ✓ 2026-11-07 (asset sync) | legacy-mobile | çevrimdışı engeli (`onRequest`), `silentStatuses` header'ı (`onError`) | `injectStore` `store/stores.ts`'te; `ErrorCodes` → `@/constants`; `IErrorData` → `ErrorData`; `common.generated.ts` yeniden üretildi (bayraklar config'te); `errors.general` / `errors.networkError` çevirisi |
| Varlik360 mobil | ✓ 2026-11-07 (asset sync) | legacy-mobile | 460 paywall: `premiumUx` header'ı `paywall` (varsayılan) ise ödeme ekranı, uyarı yok (`onError`) | aynı; `alpha.service` header bayrakları → config (20 yer); `auth.reloginRequired*` çevirisi (ortak adaptör) |

Mobillerde davranış farkları: dil header'ı artık `selectedLanguageCode` yerine i18next'ten (kısa kod; aynı değer);
ağ hatası uyarısının başlığı boş (eskiden "Bir sorun oluştu"); `withCredentials` kalktı (React Native'de çerez yok);
`EMAIL_NOT_VERIFIED` için `console.log` kalktı.

Web'lerde davranış farkları (eski interceptor'a göre): 2xx `isSuccess: false` artık reject (thunk'lar yakalayıp
`LocalResponse` döndüğü için sonuç aynı); başarı toast'u `/get-all` ve `/me`'de de basılmaz; StockExchange web her
istekte `Accept-Language` gönderir (eskiden göndermiyordu); `VITE_API_BASE_URL` yoksa eski `127.0.0.1:8765`
yedeği yok.

Dosya cevabı: admin-base `readExportResponse` `LocalResponse<Blob>.fileName`'i okur (yayın bekliyor).

## Açık konular

- **`contract-parity` dil senaryosu:** aynı isteği `Accept-Language: tr` ile iki stack'e atıp `uiMessage`'ı karşılaştırmak.
  Host ayağa kaldırmak gerektiği için eklenmedi.
- **Veri dili alanları (K6 kapsamı dışı, sonra ele alınacak):** isteğin değil verinin dilini taşıdıkları için Accept-Language
  geçişinde olduğu gibi bırakıldı. Her biri için karar verilecek: kalacak mı, değer kümesi `SUPPORTED_LANGUAGES` / kısa kod
  (`en`, `tr`) ile hizalanacak mı, varsayılanı projenin varsayılan diliyle (api-contract §1.1) aynı mı.
  - StockExchange haber dili: `market_data` haber `language` alanı (`"TR"` / `"EN"`, büyük harf; `news_rss_tr.py`,
    `news_rss_uk.py`, `router/news.py`).
  - StockExchange deep-dive prompt `languages` çoklu seçimi (`deep_dive_prompts`).
  - Üretilmiş admin CRUD'larındaki `language` kolon ve filtreleri: StockExchange `deep_dive_reports`, SharedFrame
    `EventQrKits`.
  - Varlik360 arka plan job'ları ve bildirimler: istek olmadığı için kullanıcının kayıtlı `deviceLanguageTag`'ini okuyor,
    yoksa `'tr'` (`users.service.ts`, `daily-portfolio.service.admin.ts`; kayıtta `auth.service.ts` `?? 'tr'`). Varsayılan
    Varlik360'ın `tr`'siyle uyumlu; `'tr'` sabitleri `DEFAULT_LANGUAGE`'a bağlanabilir.
- **Shared-auth ile çakışma:** shared-auth session'ı admin skeleton'ında `services/api.ts`, `store/slices/authSlice.ts`,
  `services/auth.services.ts`, `types/API/index.ts`'i commit'siz değiştiriyor. Skeleton'ın ortak api.ts'e geçişi ve
  dosya yeniden adlandırması o iş merge olduktan sonra yapılır; o zamana kadar skeleton'a dokunulmaz.
- **Dosya adı kuralı (admin, web, mobil tek):** `services/<modül>.service.ts`, `store/thunks/<modül>.thunk.ts`,
  `store/slices/<modül>.slice.ts` (+ `.generated` eşleri); HTTP altyapısı `services/api/`. Dört admin bu şemaya çevrildi (2026-11-07; yalnız çalışma
  kopyası). Kalan: admin skeleton'ı (shared-auth merge'ünden sonra), projelerin `.cursor/rules` kopyaları, web ve
  mobiller.
- **admin-base yayını:** `readExportResponse`'un `fileName` okuması yayınlanana kadar export dosyası varsayılan adla iner.
