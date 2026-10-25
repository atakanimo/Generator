# Geliştirme

## Komutlar (`packages/admin-base`)

| Komut | İş |
| --- | --- |
| `npm install` | Bağımlılıklar (peer'lar dev olarak da kurulu) |
| `npm run typecheck` | `tsc -p tsconfig.json` (src + test + playground) |
| `npm test` | vitest (`test/*.test.ts`) |
| `npm run build` | `tsc -p tsconfig.build.json` → `dist/` (host bunu kullanır) |
| `npm run playground` | Vite, http://localhost:5191 (Generator `.claude/launch.json` → `admin-base-playground`) |

Bir değişiklik bitince üçü de temiz olmalı: typecheck, test, build. Host `file:` ile bağlıysa `build` sonrası host dev sunucusu yeni `dist/`'i alır.

## Playground

- `playground/mockBackend.ts`: sözleşmedeki uçları bellekte uygulayan axios adapter'ı; host interceptor'ını (resolve / reject, toast, loading) taklit eder.
- `playground/resources.tsx`: örnek config + `extendResource` örnekleri. Yeni alan türü ya da davranış önce buraya eklenir.
- Hata önce playground'da yeniden üretilir, düzeltilir, sonra host'ta doğrulanır.

## Testler

| Dosya | Kapsam |
| --- | --- |
| `test/schema.test.ts` | `toWriteBody`, ilişki yardımcıları |
| `test/restProvider.test.ts` | Uç yolları, body'ler, istek bayrakları |
| `test/ui.test.ts` | Filtre body'si, form değerleri, doğrulama, `createAdminRoutes`, `humanize`, json, dinamik varsayılanlar |
| `test/format.test.ts` | `valueSummary` |
| `test/types.test.ts` | Tip çıkarımı (`tsc` ile doğrulanır) |
| `test/fixtures.ts` | Ortak örnek resource'lar |

## Yeni alan türü / özellik ekleme

1. `src/schema/fields.ts`: tip + `BaseValue` çıkarımı.
2. Gerekirse `src/schema/write.ts` (body) ve `src/ui/form/values.ts` / `rules.ts` (form).
3. Hücre `src/ui/table/cells.tsx`, form alanı `src/ui/form/FormFields.tsx`, filtre `src/ui/filters/`.
4. Test + playground örneği.
5. Generator tarafı: `src/main/generators/adminResourceConfig.ts` eşlemesi ve `node scripts/verify/admin-config-check.mjs` (Generator kökünden).
6. Sözleşmeyi etkiliyorsa önce Generator `docs/api-contract.md` güncellenir, `src/contract/api.ts` ona uyar.

## Kurallar

- Paket hata / toast göstermez; host interceptor'ı gösterir.
- Yol türetilmez; BE / DB bilgisi pakete girmez.
- Metinler `texts.ts`'e (`ataAdmin.*`) eklenir, bileşende sabit metin yazılmaz.
- Eski config şekli için uyumluluk kodu yazılmaz; kırıcı değişiklikte `RESOURCE_SCHEMA_VERSION` artar ve Generator aynı anda güncellenir.

## Yayın

npm'de herkese açık: `@atakanimo/ata-admin-base` (`publishConfig.access: public`). Yayın `packages/admin-base` içinde `npm run release` (`scripts/publish.sh`):

1. `package.json` sürümü npm'de varsa durur (önce sürüm artırılır).
2. `npm whoami` başarısızsa (token yok / süresi dolmuş) `npm login --auth-type=web`: giriş tarayıcıda yapılır, token `~/.npmrc`'ye yazılır.
3. `npm publish`; önce `prepublishOnly` (typecheck + test + build) koşar. 2FA onayı da tarayıcıda.

Host'lar paketi npm sürümüyle kullanır; yeni sürümden sonra host'ta sürüm güncellenip lock dosyası yeniden üretilir.

Henüz yok: sayfalar arası "tümünü seç", kaydedilmemiş değişiklik uyarısı, iki seviye populate.
