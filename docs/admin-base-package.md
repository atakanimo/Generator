# `@atakanimo/ata-admin-base` paketi

`packages/admin-base`: Generator'ın ürettiği admin config'ini çalıştıran React + MUI paketi. Ayrıntılı dokümanlar paketin içinde: [`packages/admin-base/docs/`](../packages/admin-base/docs/README.md) (mimari, config, host kurulumu, geliştirme). Bu dosya Generator tarafından bakışla kısa özettir.

## Yapı

| Klasör | İçerik |
| --- | --- |
| `src/contract` | Sözleşme tipleri (`IApiResponse`, `ListBody`, `PaginatedList`) |
| `src/data` | `createAtaRestProvider`, resource API, axios bayrakları (`skipLoading`, `skipSuccessToast`), QueryClient |
| `src/schema` | `defineResourceSchema`, `extendResource`, alan tipleri, ilişki ve yazma body'si (`toWriteBody`) |
| `src/react` | `AtaAdminProvider`, TanStack Query hook'ları |
| `src/ui` | `ResourcePage`, form drawer, filtre çubuğu, tablo hücreleri, `createAdminRoutes`, `AdminDashboard`, metinler |
| `playground/` | Sahte BE ile geliştirme ortamı |

Ana sayfa bileşeni `AdminDashboard`: host kart, grafik, tablo ve rota kısayolu dizilerini verir. Hangi durumda ne basıldığı [packages/admin-base/docs/dashboard.md](../packages/admin-base/docs/dashboard.md) içindedir.

## Davranış

- Liste: sunucu sayfalama ve sıralama (resource ya da alan `sortable: false` ile kapatılır), filtre çubuğu (taslak / uygulanan), satır ve toplu aksiyonlar, silme onayı. Toolbar / toplu aksiyonlar `visible` / `disabled` ile liste isteğine (`listBody`) ve seçime göre gösterilir.
- Detay: `extensions.detail` ya da `placement: 'detail'` aksiyonu → satırda "Detay" ikonu, sağdan salt okunur drawer (`getOne`, alanlar, `detail.component`, detail aksiyonları, düzenle / sil). (0.1.6)
- Dinamik seçenek: `extensions.fields.<ad>.loadOptions` enum / string alanının filtre ve form select'ini çalışma anında doldurur. (0.1.6)
- Form: sağdan açılan drawer; react-hook-form; kurallar config'ten türer (zod yok, son söz BE'de). Update body'si formdaki yazılabilir alanların tamamıdır; ilişkiler id'ye iner. Edit'te boşaltılan opsiyonel ya da `nullable` tekil alan `null` gider ve BE alanı temizler ([api-contract.md](api-contract.md) §5, JSON Merge Patch); zorunlu alan gönderilmez, dizi `[]` ile boşalır (0.1.8). Alt objede config'te olmayan anahtarlar okunan değerle aynen geri gider (modellenmemiş iç içe alan kaydedince silinmez; 0.1.8). Yalnız id gelen tekil ilişkinin etiketi hedefin `get-all`'undan (`filters.id`) okunur (alt obje ilişkileri; 0.1.8).
- Alan türleri: relation autocomplete, enum (sayısal enum `numbers[i]` açık değerini gönderir; filtre, form ve hücre aynı yardımcıyı kullanır: `enumChoices`), tarih (dayjs; `dateFormat: 'date'` saat seçmez), iç içe obje, obje dizisi, map, JSON, resim URL'i, decimal (metin olarak gönderilir), e-posta, tam sayı. `constraints` (`minLength` / `maxLength` / `pattern` tekil metinde, `min` / `max` tekil sayıda) form kuralıdır (0.1.7).
- `ApiResponse.traceId?`: zarftaki istek kimliği (0.1.7).
- Dinamik create varsayılanı: `default: { dynamic: 'now' | 'uuid' | 'currentUserId' }`; kullanıcı id'si `AtaAdminProvider getCurrentUserId`'den.
- Obje / dizi hücreleri okunur özet gösterir, tıklayınca JSON penceresi açılır.
- Metinler host'un i18next `t`'sinden; Türkçe varsayılanlar `adminBaseTexts`. DataGrid metinleri MUI `trTR`.
- QueryClient: `retry: false`, `refetchOnWindowFocus: false`, liste önceki veriyi tutar. Mutation'lar liste yenilemesini beklemez.
- Paket kendi hata ya da toast'unu göstermez; bunlar host interceptor'ındadır ([api-contract.md](api-contract.md) §7).

## Host kurulumu

1. Bağımlılık: geliştirmede `file:` ile (`"@atakanimo/ata-admin-base": "file:<göreli yol>/Generator/packages/admin-base"`). Peer: React, MUI, emotion, `@tanstack/react-query`, axios.
2. Vite `resolve.dedupe`: `react`, `react-dom`, `@mui/material`, `@emotion/react`, `@emotion/styled`, `@tanstack/react-query`, `axios`. Dashboard grafiği için host'ta `chart.js` ve `react-chartjs-2` de bulunur. Gerekirse tsconfig `paths` ile axios host'unkine yönlendirilir.
3. `AtaAdminProvider` + `createAtaRestProvider({ http: API })`, `t`, `dateLocale='tr'` (`dayjs/locale/tr` import edilir).
4. Interceptor sözleşme §7'ye uyar.
5. Route + menü: `[...elleYazilanRoutes, ...createAdminRoutes(resources)]`.
6. Kök `<html lang="tr">` (CSS büyük harf dönüşümü `SİL` versin diye).
7. Paket metinleri (`ataAdmin.*`) i18next'e iki dilde eklenir; eklenmezse paket her dilde Türkçe varsayılanı gösterir:
   `i18n.addResourceBundle('tr', 'translation', adminBaseTexts, true, false)` ve `i18n.addResourceBundle('en', 'translation', adminBaseTextsEn, true, false)`.

### Login ekranı

`AtaLoginPage` (0.1.5): Varlik360 admin referansı; ortada kart (en çok 480px), logo + `appName`, başlık / alt başlık, e-posta + şifre (doğrulama: zorunlu, e-posta biçimi), "Beni hatırla", tam genişlik giriş düğmesi (gönderim sürerken kilit + spinner), "Şifrenizi mi unuttunuz?", sağ üstte dil / tema düğmeleri. `AtaAdminProvider` dışında da çalışır; metin için `t` prop'u alır (anahtarlar `ataAdmin.login*`).

```tsx
<AtaLoginPage
  appName='Varlık360 Admin'
  t={t}
  onSubmit={async ({ email, password }) => {
    const { isSuccess } = await dispatch(login({ email, password })).unwrap();
    if (isSuccess) navigate('/dashboard');
  }}
  forgotPasswordHref='/forgot-password'
  onToggleLanguage={() => i18n.changeLanguage(i18n.language === 'en' ? 'tr' : 'en')}
  onToggleTheme={() => dispatch(toggleTheme())}
  themeMode={mode}
/>
```

- Proje başına: `appName`, `logo` (varsayılan `Sync`), renk temadan (`primary`), `onSubmit`, `loading` (global loading), `error` (form üstü uyarı, ör. rol reddi), `forgotPasswordHref` / `onForgotPassword` (ikisi yoksa bağlantı yok), `headerActions`.
- "Beni hatırla": e-posta `localStorage['remembered_email']`'de (Varlik360'ın eski anahtarı; `rememberStorageKey` ile değişir, `false` → kutu yok). Şifre hiç saklanmaz.
- API hatası host interceptor'ünün işidir (sözleşme §7); form yalnız alan doğrulamasını gösterir.
- Playground: `http://localhost:5191/?login` (dil / tema düğmeleri çalışır).

## Geliştirme

```bash
cd packages/admin-base && npm install && npm run typecheck && npm test && npm run build
```

Playground: `npm run playground` (port 5191; `.claude/launch.json` → `admin-base-playground`). Paket hatası önce playground'da yeniden üretilir, sonra host'ta doğrulanır.

## Yayın

npm'de herkese açık: `@atakanimo/ata-admin-base` (`publishConfig.access: public`). Yayın `packages/admin-base` içinde `npm run release` (`scripts/publish.sh`):

1. `package.json` sürümü npm'de varsa durur (önce sürüm artırılır).
2. `npm whoami` başarısızsa (token yok / süresi dolmuş) `npm login --auth-type=web`: giriş tarayıcıda yapılır, token `~/.npmrc`'ye yazılır.
3. `npm publish`; önce `prepublishOnly` (typecheck + test + build) koşar. 2FA onayı da tarayıcıda.

Host'lar paketi npm sürümüyle kullanır; yeni sürümden sonra host'ta sürüm güncellenip lock dosyası yeniden üretilir.

Henüz yok: sayfalar arası "tümünü seç", kaydedilmemiş değişiklik uyarısı, iç içe (iki seviye) populate.
