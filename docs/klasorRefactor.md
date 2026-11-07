# Görev: Ön yüz klasör yapısını ve dosya adlarını tekleştirme

Bu belge iki iş yapar. Birincisi, tüm admin, web ve mobil uygulamaların uyacağı ortak klasör ve isimlendirme kurallarını koyar. İkincisi, bugünkü projelerin bu kurala geçmek için ne yapması gerektiğini listeler. Yeni proje ve yeni dosyalar da hep bu kurala göre yazılır.

Kapsanan uygulamalar:

- Admin: CeyizDefterim, SharedFrame, StockExchange, Varlik360
- Web: SharedFrame, StockExchange
- Mobil: CeyizDefterim, Varlik360

Kurallar React ve React Native topluluğunda yaygın kabul gören düzeni izler: özellik dosyaları türüne göre klasörlere ayrılır, bileşenler PascalCase, geri kalan her şey camelCase yazılır ve her klasör tek bir barrel'dan dışa açılır.

Projeler arasında yalnız şu iki alan farklı olabilir:

- `pages/` (web, admin) veya `screens/` (mobil). İçerik serbesttir, ama dosya biçimi kurallarına (K19) uyulur.
- `modules/`. Yalnız admin'de bulunur; Generator'ın ürettiği entity config'leri tutar.

## 1. Ortak klasör yapısı

```
src/
  App.tsx                 # kök bileşen (provider'lar, router)
  main.tsx                # web/admin giriş noktası (mobilde kökteki index.js)
  index.css               # web/admin tek global stil dosyası
  assets/                 # resim, ikon, font, splash
    images/  icons/  fonts/
  components/
    index.ts              # barrel
    Core/<Ad>/index.tsx   # alan bilgisi taşımayan temel UI: Button, Text, Input, Toast, Loader, Modal…
    <alan>/<Ad>.tsx       # birden çok sayfanın kullandığı alan bileşeni: qrkit/, plans/, reports/…
  config/
    app.ts                # uygulama sabitleri: ad, auth uçları, storage anahtarları, ana sayfa
    env.ts                # ortam değişkenlerini okuma (import.meta.env / react-native-config)
    <konu>.ts             # konu sabitleri: markets.ts, deepDive.ts…
  helper/
    index.ts              # barrel
    <konu>.ts             # React'sız saf fonksiyonlar: storage, date, format, validation, download…
  hooks/
    index.ts              # barrel: useAppDispatch, useAppSelector, useCustomTranslation, useTheme
    use<Ad>.ts
    <konu>/               # birden çok dosyalı hook grubu (ör. revenueCat/)
  i18n/
    index.ts              # i18next kurulumu
    locales/tr.ts  en.ts  (de.ts…)
  layout/
    <Ad>Layout.tsx        # MainLayout, FullScreenLayout, AuthLayout…
  routes/
    routes.ts             # route / menü listesi
    index.tsx             # router (web/admin) veya kök navigator (mobil)
    guards/               # ProtectedRoute, PublicRoute, RequireAuth, RequirePlan, RequireAdmin
    <Ad>Stack/            # yalnız mobil: AuthStack/, MainStack/ (index.tsx + <ad>Screens.ts)
  services/
    api/                  # ortak http katmanı (Generator client-http): index, hooks, auth, platform
    common.generated.ts
    <kaynak>.service.generated.ts
    <kaynak>.service.ts
  store/
    index.ts              # store, RootState, AppDispatch (mobilde Provider ve persist de buradan açılır)
    slices/<kaynak>.slice.ts (+ .slice.generated.ts)
    thunks/<kaynak>.thunk.ts (+ .thunk.generated.ts)   # admin'de yalnız auth.thunk(.generated).ts (K13)
  theme/
    index.ts              # tema nesnesi / provider'a verilen tema
    palette.ts            # renkler
    typography.ts         # yazı ölçekleri
  types/
    index.ts              # barrel
    API/index.ts  response.ts  auth.ts  <kaynak>.ts
    navigation.ts         # yalnız mobil
  pages/  | screens/      # serbest alan (K19)
  modules/                # yalnız admin
```

## 2. Klasör kuralları

**K1. Klasör adları her uygulamada aynıdır.**

| Kullan | Kullanma |
| --- | --- |
| `i18n/` | `locales/` (kökte) |
| `theme/` | `styles/` |
| `layout/` | `layouts/` |
| `config/` | `constants/` |
| `helper/` | `utils/`, `lib/`, `validation/` |
| `components/Core/` | `components/ui/` |
| `routes/guards/` | `routes/components/` |

**K2. `utils/`, `lib/` ve `validation/` klasörü yoktur.**

- Ortam okuma ve sürüm bilgisi `config/env.ts` dosyasına girer.
- Saf yardımcılar `helper/` altına girer.
- Yup / form şemaları `helper/validation.ts` dosyasına girer.

**K3. Platforma özel tek klasör `modules/`.** Yalnız admin'de bulunur. Mobilde ek olarak `routes/<Ad>Stack/` ve `types/navigation.ts` bulunur.

**K4. Kökte (`src/`) yalnız şu dosyalar bulunur:** `App.tsx`, `main.tsx`, `index.css`, `vite-env.d.ts`. Diğer her dosya bir klasöre girer.

- `ThemeHydrate.tsx` gibi bileşenler `components/` veya `theme/` altına taşınır.
- `.d.ts` bildirimleri `types/` altına taşınır. Vite'ın kendi `vite-env.d.ts` dosyası istisnadır.

**K5. Her kök klasörün bir `index.ts` barrel'ı vardır** (`components`, `helper`, `hooks`, `types`, `config`).

- Dışarıdan import her zaman barrel'dan yapılır: `@/hooks`, `@/helper`, `@/components`.
- Klasör içinde dosyalar birbirini göreli yolla import eder.
- `store` için tek giriş `@/store`'dur.

## 3. Ne nereye gider

**K6. Hook'lar `hooks/` altında durur.**

- Bileşen klasöründe, `helper/` altında veya `config/` altında hook olmaz.
- İstisna: yalnız tek bir sayfanın kullandığı hook o sayfanın klasöründe kalabilir (`pages/<Ad>/use<Ad>.ts`).

**K7. Bileşen yerleşimi.**

- `components/Core/<Ad>/index.tsx`: alan bilgisi taşımayan temel UI. Bileşene ait alt parça veya stil dosyası aynı klasöre girer (`Core/BottomSheet/Header.tsx`).
- `components/<alan>/<Ad>.tsx`: birden çok sayfanın kullandığı alan bileşeni. Klasörün kendi `index.ts` barrel'ı olabilir.
- Kök `components/` altında tek başına `.tsx` dosyası olmaz.
- Tek bir sayfanın kullandığı bileşen o sayfanın klasöründe kalır.

**K8. `helper/` yalnız React'sız saf fonksiyon tutar.**

- JSX yoktur, hook yoktur, Redux'a erişim yoktur.
- Bir dosya bir konudur: `storage.ts`, `date.ts`, `format.ts`, `download.ts`.
- Aynı işi yapan dosya her projede aynı adı taşır (bkz. §5).

**K9. Sabitler `config/` altında durur.** Uygulama genelindeki sabitler `app.ts` dosyasına, konu sabitleri `<konu>.ts` dosyasına girer. Sabit bir bileşen veya helper dosyasının içine gömülmez.

**K10. Bütün API tipleri `types/API/` altında durur.**

- OpenAPI'dan üretilen tipler de buraya girer, ör. `types/API/openapi.generated.ts`.
- `src/api/` klasörü yoktur.
- Bileşene ait prop tipleri bileşen dosyasında kalır. Birden çok bileşenin paylaştığı UI tipleri `types/` altına girer (`coreComponents.ts`).

**K11. `services/api/` ortak http katmanıdır** ([http-layer.md](frontend/http-layer.md)).

- Projede yalnız `platform.ts` değişir.
- `request.ts` gibi ikinci bir istek yardımcısı olmaz.
- Servis dosyası yalnız istek atar: UI, toast ve dispatch yoktur.

**K12. Store düzeni.**

- `store/index.ts` store'u kurar ve `RootState` ile `AppDispatch` tiplerini dışa açar.
- Slice'lar `store/slices/`, thunk'lar `store/thunks/` altına girer.
- Slice içinde thunk tanımlanmaz.
- Store yardımcıları (`thunkCatch`, `thunkPayload`) projeye kopyalanmaz; ortak katmandan gelir.
- Mobilde `stores.ts`, `reduxProvider.tsx` ve `migrations.ts` dosyaları `store/` altında kalabilir, ama dışarıya `store/index.ts` üzerinden açılır. Import her zaman `@/store` olur, `@/store/stores` olmaz.
- Başlangıç verisi (`initialData/`) slice dosyasının içinde veya `store/slices/<kaynak>.initial.ts` dosyasında durur.

**K13. Admin'de `store/thunks/` yalnız auth içindir** ([frontend.admin.mdc](../.cursor/rules/frontend.admin.mdc), [CommonAuth.md](CommonAuth.md)).

- CRUD uçları admin-base'den gelir.
- CRUD dışı uçlar `services/<x>.service.ts` + TanStack (`useQuery` / `useMutation`) ile çağrılır.
- Admin'de yalnız `auth`, `common` ve `theme` slice'ları bulunur.
- Auth istisnadır: oturum Redux'ta durur (`services/api/` token'ı oradan okur), TanStack'e taşınmaz. Auth thunk'ları web ve mobildeki gibi Generator'dan gelir: `store/thunks/auth.thunk.generated.ts` (G) + `store/thunks/auth.thunk.ts` (K, hook'lar). K12 gereği `auth.slice.ts` içinde thunk olmaz.
- `store/thunks/` altında auth dışında dosya olmaz.

**K14. Route düzeni.**

- `routes/routes.ts` route listesini (admin'de menü sırasını) tutar.
- `routes/index.tsx` router'ı kurar.
- Guard'lar `routes/guards/` altına girer.
- StockExchange admin'deki `generatedRoutes.ts` gibi Generator çıktısı `routes/routes.generated.ts` adını alır.

**K15. Layout düzeni.**

- `layout/<Ad>Layout.tsx` biçimi kullanılır.
- Menü / navigasyon tanımı layout klasörüne değil `routes/routes.ts` dosyasına girer (StockExchange admin'deki `adminNav.ts` buraya taşınır).

**K16. Tema düzeni.** `theme/index.ts` tema nesnesini, `palette.ts` renkleri, `typography.ts` yazı ölçeklerini tutar. Uygulamaya özel CSS gerekiyorsa `theme/<ad>.css` dosyasına girer ve `index.css`'ten import edilir.

**K17. i18n düzeni.**

- `i18n/index.ts` i18next'i kurar.
- Çeviriler `i18n/locales/<dil>.ts` dosyalarındadır: `tr.ts` tip kaynağıdır (`export const tr = {...}`), diğerleri `typeof tr` ile tiplenir.
- JSON locale yoktur.
- Bileşende `useCustomTranslation` kullanılır.

**K18. Temizlik.**

- Şablondan kalan dosyalar silinir: `assets/react.svg`, `assets/vite.svg`, boş veya kullanılmayan `App.css`.
- `.DS_Store` `.gitignore`'a eklenir; izlenenler repodan çıkarılır.

**K19. `pages/` ve `screens/` dosya biçimi.**

- Web / admin: `pages/<Ad>/index.tsx`.
- Mobil: `screens/<Grup>/<Ad>/index.tsx`. Grup örnekleri: `Auth`, `Main`, `Common`, `Onboarding`.
- Sayfaya özel bileşen, hook ve yardımcı aynı klasöre girer.
- `pages/XxxPage.tsx` gibi düz dosya olmaz.

## 4. Generator çıktısı

**K20. Generator'ın yazdığı dosyalar `.generated.ts` soneki alır ve elle düzenlenmez.**

- Elle yazılan karşılığı aynı adla, soneksiz durur ve generated dosyayı içeri alır: `events.service.ts` → `events.service.generated.ts`.
- Generator'ın yazdığı yerler bu yapıyla aynıdır: `services/`, `store/slices/`, `store/thunks/`, admin'de `modules/`.
- Generator iskeleti (`src/generator-assets/admin-base/_skeleton`) ve client-redux / client-http şablonları bu belgeye göre güncellenir. Ör. `utils/appEnv.ts` → `config/env.ts`.

## 5. Dosya isimlendirme

**Genel**

| Tür | Biçim | Örnek |
| --- | --- | --- |
| Bileşen dosyası | PascalCase `.tsx` | `EventCard.tsx` |
| Bileşen klasörü | PascalCase, içinde `index.tsx` | `Core/Button/index.tsx` |
| Sayfa / ekran klasörü | PascalCase, `Page` / `Screen` soneki yok | `pages/EventDetails/index.tsx` |
| Hook | `use` + PascalCase, `.ts` (JSX dönüyorsa `.tsx`) | `useEventQrKit.ts` |
| Helper, config, tip dosyası | camelCase `.ts` | `storage.ts`, `localizedText.ts` |
| Servis | `<kaynak>.service.ts` | `events.service.ts` |
| Slice | `<kaynak>.slice.ts` | `events.slice.ts` |
| Thunk | `<kaynak>.thunk.ts` | `events.thunk.ts` |
| Generator çıktısı | `<ad>.generated.ts` | `events.slice.generated.ts` |
| Test | kaynakla aynı ad + `.test.ts(x)`, kaynağın yanında | `storage.test.ts` |
| Diğer klasörler | camelCase veya küçük harf | `qrkit/`, `revenueCat/`, `slices/` |
| Barrel | `index.ts` (JSX dışa açıyorsa da `.ts`) | `components/index.ts` |

**Ek kurallar**

- `<kaynak>` backend kaynağının camelCase çoğul adıdır ve servis, slice ve thunk'ta aynıdır: `eventTypes.service.ts`, `eventTypes.slice.ts`, `eventTypes.thunk.ts`.
- `helper/` altında sonek yoktur: `storage.ts` olur, `asyncStorage.helper.ts` veya `markets.helper.ts` olmaz.
- Yazım hatası olan adlar düzeltilir: `localStorega.ts` → `storage.ts`, `Typograpy.ts` → `typography.ts`, `Seperator` → `Separator`, `GradiantTypography` → `GradientTypography`, `colorPallets.ts` → `palette.ts`.
- Kısaltma tek kelime gibi yazılır: `ApiSetup`, `useHttpClient`, `QrKit`. `API` klasörü mevcut kullanım olduğu için istisnadır.
- Aynı işi yapan dosyanın adı her projede aynıdır:

| İş | Ad |
| --- | --- |
| Tarayıcı / AsyncStorage saklama | `helper/storage.ts` |
| Tarih işlemleri | `helper/date.ts` |
| Sayı, para, metin biçimleme | `helper/format.ts` |
| Dosya indirme | `helper/download.ts` |
| Form şemaları | `helper/validation.ts` |
| Ortam ve sürüm | `config/env.ts` |
| Yazı ölçeği | `theme/typography.ts` |
| Renkler | `theme/palette.ts` |
| Çeviri | `hooks/useTranslation.ts` (`useCustomTranslation` dışa açar) |

**Dışa açma**

- Bileşen, sayfa ve ekran `export default` kullanır; barrel'da adlandırılmış olarak yeniden açılır.
- Hook, helper, servis ve tipler adlandırılmış export (`export const` / `export function`) kullanır.

## 6. Proje görevleri

Her proje ayrı bir commit / PR olur. Taşımadan sonra o uygulamanın `tsc` ve lint'i geçer. Import yolları IDE "move" veya `sed` ile birlikte güncellenir. Generated dosyaların yeri değişiyorsa önce Generator şablonu güncellenir (T0), sonra yeniden üretilir.

### T0. Generator

- [ ] Admin iskeleti: `utils/appEnv.ts` → `config/env.ts`; `routes/ProtectedRoute.tsx` → `routes/guards/ProtectedRoute.tsx`; `theme/` dosya adları (§5).
- [ ] client-redux ve client-http şablonlarının yazdığı yolların bu belgeyle aynı olduğunu doğrula.
- [ ] `docs/frontend/admin-host.md`: `services/api.ts` yerine `services/api/` yaz.
- [ ] `.cursor/rules/frontend.admin.mdc` "Dosya düzeni" bölümünü bu belgeye bağla. Auth thunk istisnası (K13) oraya da yazılır: "Auth istisnadır … elle yazılır", "Admin'e `*.thunk.ts` yazılmaz", "login / me thunk'ları `auth.slice.ts` içinde" ve "`store/thunks/` yok" satırları [CommonAuth.md](CommonAuth.md) "Admin kuralıyla çakışan satırlar" tablosuna göre değişir.
- [ ] `frontend.admin.mdc`'nin atıf yaptığı `frontend.web.mdc` ve `frontend.mobile.mdc` dosyaları yok: yaz veya ortak bir `frontend.structure.mdc` kuralına indir.

### T1. CeyizDefterim admin

- [ ] `utils/appEnv.ts` → `config/env.ts`.
- [ ] `routes/ProtectedRoute.tsx` → `routes/guards/`.
- [ ] `components/index.ts` ve `helper/` adlarını §5 tablosuyla karşılaştır.

### T2. SharedFrame admin

- [ ] `utils/appEnv.ts` → `config/env.ts`.
- [ ] `routes/ProtectedRoute.tsx` → `routes/guards/`.
- [ ] `theme/Typograpy.ts` → `typography.ts`, `AppTheme.ts` → `index.ts` içine.
- [ ] `Core/GradiantTypography` → `GradientTypography`.
- [ ] `assets/react.svg` ve kullanılmıyorsa `App.css` sil.

### T3. StockExchange admin

- [ ] Kök `components/` altındaki paneller (`ScreenerLogsPanel`, `JobLogsPanel`, `DeepDiveLogsPanel`, `AdminPageShell`, `GlobalLoader`) → `components/<alan>/` veya ilgili sayfa klasörü.
- [ ] `Core/CoreText.tsx`, `Core/TypographyScale.ts` → `Core/Text/index.tsx` ve `theme/typography.ts`.
- [ ] `layout/adminNav.ts` → `routes/routes.ts`; `ScreenLayout.tsx` ve `AdminLayout.tsx` için §K15 adları.
- [ ] `routes/generatedRoutes.ts` → `routes/routes.generated.ts`; `RequireAdmin` / `RequireAuth` → `routes/guards/`.
- [ ] `services/request.ts` kaldır, çağrıları `services/api/`'ye bağla.
- [ ] `store/thunks/` (auth hariç) ve `screen` / `adminPortal` slice'ları → servis + TanStack (K13); `store/thunkCatch.ts` kaldır.
- [ ] `helper/` altındaki 11 dosyayı §5 tablosuna göre adlandır; tek sayfaya ait olanları sayfa klasörüne taşı.
- [ ] `theme/adminTheme.ts` → `theme/index.ts`.
- [ ] `utils/appEnv.ts` → `config/env.ts`.

### T4. Varlik360 admin

- [ ] `helper/localStorega.ts` → `helper/storage.ts`.
- [ ] Kök `components/CoreText.tsx`, `TypographyScale.ts`, `AdminTable.tsx` → `Core/Text/`, `theme/typography.ts`, `Core/AdminTable/`.
- [ ] `store/thunks/` (auth hariç) ve `logs` / `metrics` / `ipBlacklist` slice'ları → servis + TanStack (K13).
- [ ] `theme/Typograpy.ts` → `typography.ts`; `Core/GradiantTypography` → `GradientTypography`.
- [ ] `utils/appEnv.ts` → `config/env.ts`; `routes/ProtectedRoute.tsx` → `routes/guards/`.
- [ ] `components/.DS_Store` sil; `App.css` kullanılmıyorsa sil.

### T5. SharedFrame web

- [ ] `locales/` → `i18n/` (`i18next.ts` → `i18n/index.ts`, diller `i18n/locales/`).
- [ ] `validation/index.ts` → `helper/validation.ts`.
- [ ] Kök `components/` altındaki tek dosyalar (`EventGuestsModal`, `EventExportCard`, `DeleteEventDialog`, `EventPlanCard`, `AppBar`, `AcceptDocumentsModal`, `LoadingOverlay`, `Modal`, `GoogleAuthButton`) → `Core/<Ad>/` veya `components/<alan>/`.
- [ ] `components/index.tsx` → `index.ts`.
- [ ] `components/qrkit/useEventQrKit.ts`, `components/plans/usePricing.ts` → `hooks/` (veya tek sayfaya aitse o sayfaya).
- [ ] `components/plans/currency.ts`, `qrkit/qrKitUtils.ts` → `helper/`.
- [ ] `helper/localStorage.ts` → `helper/storage.ts`; `dayOperation.ts` → `date.ts`; `uploadMediaOperation.ts` → `upload.ts`.
- [ ] `routes/AppRoutes.tsx` → `routes/index.tsx`; `routes/components/` → `routes/guards/`.
- [ ] `store/initialData/Events.ts` → slice içine veya `store/slices/events.initial.ts`.
- [ ] `config/app.ts` ekle; dağınık sabitleri ve ortam okumayı `config/`'e topla.
- [ ] `pages/XxxPage.tsx` → `pages/<Ad>/index.tsx` (K19).

### T6. StockExchange web

- [ ] `src/api/gen.ts` → `types/API/openapi.generated.ts`; `gen:api` script yolunu güncelle.
- [ ] Kök `ThemeHydrate.tsx` → `theme/` veya `components/`; `app-version.d.ts` → `types/`.
- [ ] `components/ui/` → `components/Core/<Ad>/index.tsx`; `ui/cn.ts` → `helper/`.
- [ ] Kök `components/` altındaki ~25 dosya → `components/<alan>/` (market, deepDive, reports, backtest, watchlist…) veya sayfa klasörü.
- [ ] `locales/` → `i18n/`.
- [ ] `theme/alpha-terminal.css` kalır; `theme/index.ts`, `palette.ts`, `typography.ts` ekle (`ui/TypographyScale.ts` ve `helper/bumpTypographyVariant.ts` buraya).
- [ ] `services/request.ts` kaldır; `store/thunkCatch.ts`, `thunkPayload.ts` ortak katmana bağla.
- [ ] `routes/` için `routes.ts` + `index.tsx` ekle; `RequireAuth` / `RequirePlan` → `routes/guards/`.
- [ ] `helper/language.ts` için Accept-Language kuralını kontrol et; dil seçimi `i18n/`'e aitse taşı.
- [ ] `config/app.ts` ve `config/env.ts` ekle.
- [ ] `assets/vite.svg`, `assets/react.svg` sil; `App.css` kullanılmıyorsa sil.
- [ ] `pages/XxxPage.tsx` → `pages/<Ad>/index.tsx`.

### T7. CeyizDefterim mobil

- [ ] `styles/` → `theme/` (`appTheme.ts` → `index.ts`, `colorPallets.ts` → `palette.ts`); `Core/Text/TextTypography.ts` → `theme/typography.ts`.
- [ ] `layouts/<Ad>/index.tsx` → `layout/<Ad>Layout.tsx`.
- [ ] `constants/index.ts` → `config/app.ts`.
- [ ] `locales/` → `i18n/`.
- [ ] `utils/` kaldır: `useAppInForeground.ts` → `hooks/`; `date.ts`, `formatter.ts` (→ `format.ts`), `YupValidationSchemas.ts` (→ `validation.ts`) → `helper/`; `getAppVersion.ts`, `deviceMeta.ts` → `config/env.ts` veya `helper/`.
- [ ] `helper/asyncStorage.helper.ts` → `helper/storage.ts`.
- [ ] `store/stores.ts` dışa açımı `store/index.ts`'e; `@/store/stores` importlarını `@/store` yap.
- [ ] `components/index.tsx` → `index.ts`; `OtpSection/` → `Core/` veya `components/auth/`.
- [ ] `Core/Seperator` → `Separator`.
- [ ] `.DS_Store` dosyalarını sil, `.gitignore`'a ekle.

### T8. Varlik360 mobil

- [ ] T7'deki `styles/`, `layouts/`, `constants/` (`markets.ts`, `symbolTypeColors.ts`, `deepDive.ts` → `config/`), `locales/`, `utils/`, `store/stores.ts`, `components/index.tsx`, `Seperator`, `.DS_Store` maddelerinin aynısı.
- [ ] `utils/` içindeki `persistMigrations.ts` → `store/`; `appVersionCheck.helper.ts`, `notification.ts` → `helper/`.
- [ ] `helper/*.helper.ts` sonekini kaldır (`markets.ts`, `quotes.ts`, `deepDive.ts`, `premium.ts`, `portfolio.ts`, `revenueCatAuth.ts`); `revenueCat.config.ts` → `config/revenueCat.ts`.
- [ ] `hooks/revenueCat/MainScreen.tsx` bir ekran: `screens/` veya `components/` altına taşı; `RevenueCatService.ts` → `services/revenueCat.service.ts`.
- [ ] `components/Charts/` → `components/charts/`; `components/OTP/` → `components/auth/`; `Core/Modal/ClaimMissingAssetModal.tsx` → alan klasörü.

## 7. Bitti sayılma

- Her uygulamada `src/` kökü §1 ağacıyla aynı klasörleri taşır (eksik olan yalnız o uygulamanın gerçekten kullanmadığı klasördür).
- §1 ağacında ve §5'te olmayan klasör veya dosya adı yoktur.
- Her uygulamada `tsc` ve lint temiz; web / admin build alır, mobil iOS ve Android derlenir.
- Generator yeniden üretimi (`regen-client`, admin iskeleti) yeni yollara yazar ve doğrulama kapıları geçer.
