# `@atakanimo/ata-admin-base` paketi

`packages/admin-base`: Generator'ın ürettiği admin config'ini çalıştıran React + MUI paketi. Ayrıntılı dokümanlar paketin içinde: [`packages/admin-base/docs/`](../packages/admin-base/docs/README.md) (mimari, config, host kurulumu, geliştirme). Bu dosya Generator tarafından bakışla kısa özettir.

## Yapı

| Klasör | İçerik |
| --- | --- |
| `src/contract` | Sözleşme tipleri (`IApiResponse`, `ListBody`, `PaginatedList`) |
| `src/data` | `createAtaRestProvider`, resource API, axios bayrakları (`skipLoading`, `skipSuccessToast`), QueryClient |
| `src/schema` | `defineResourceSchema`, `extendResource`, alan tipleri, ilişki ve yazma body'si (`toWriteBody`) |
| `src/react` | `AtaAdminProvider`, TanStack Query hook'ları |
| `src/ui` | `ResourcePage`, form drawer, filtre çubuğu, tablo hücreleri, `createAdminRoutes`, metinler |
| `playground/` | Sahte BE ile geliştirme ortamı |

## Davranış

- Liste: sunucu sayfalama ve sıralama, filtre çubuğu (taslak / uygulanan), satır ve toplu aksiyonlar, silme onayı.
- Form: sağdan açılan drawer; react-hook-form; kurallar config'ten türer (zod yok, son söz BE'de). Update body'si formdaki yazılabilir alanların tamamıdır; ilişkiler id'ye iner.
- Alan türleri: relation autocomplete, enum, tarih (dayjs), iç içe obje, obje dizisi, map, JSON, resim URL'i, decimal (metin olarak gönderilir).
- Dinamik create varsayılanı: `default: { dynamic: 'now' | 'uuid' | 'currentUserId' }`; kullanıcı id'si `AtaAdminProvider getCurrentUserId`'den.
- Obje / dizi hücreleri okunur özet gösterir, tıklayınca JSON penceresi açılır.
- Metinler host'un i18next `t`'sinden; Türkçe varsayılanlar `adminBaseTexts`. DataGrid metinleri MUI `trTR`.
- QueryClient: `retry: false`, `refetchOnWindowFocus: false`, liste önceki veriyi tutar. Mutation'lar liste yenilemesini beklemez.
- Paket kendi hata ya da toast'unu göstermez; bunlar host interceptor'ındadır ([api-contract.md](api-contract.md) §7).

## Host kurulumu

1. Bağımlılık: geliştirmede `file:` ile (`"@atakanimo/ata-admin-base": "file:<göreli yol>/Generator/packages/admin-base"`). Peer: React, MUI, emotion, `@tanstack/react-query`, axios.
2. Vite `resolve.dedupe`: `react`, `react-dom`, `@mui/material`, `@emotion/react`, `@emotion/styled`, `@tanstack/react-query`, `axios`. Gerekirse tsconfig `paths` ile axios host'unkine yönlendirilir.
3. `AtaAdminProvider` + `createAtaRestProvider({ http: API })`, `t`, `dateLocale='tr'` (`dayjs/locale/tr` import edilir).
4. Interceptor sözleşme §7'ye uyar.
5. Route + menü: `[...elleYazilanRoutes, ...createAdminRoutes(resources)]`.
6. Kök `<html lang="tr">` (CSS büyük harf dönüşümü `SİL` versin diye).

## Geliştirme

```bash
cd packages/admin-base && npm install && npm run typecheck && npm test && npm run build
```

Playground: `npm run playground` (port 5191; `.claude/launch.json` → `admin-base-playground`). Paket hatası önce playground'da yeniden üretilir, sonra host'ta doğrulanır.

## Yayın

`private: true`, sürüm 0.1.0, yayınlanmadı. Host CI'da `file:` bağımlılığı çözülemez; paket private registry'ye yayınlanmalı ya da vendorlanmalı, ardından host lock dosyası yeniden üretilmeli.

Henüz yok: sayfalar arası "tümünü seç", kaydedilmemiş değişiklik uyarısı, iç içe (iki seviye) populate.
