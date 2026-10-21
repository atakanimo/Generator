# Doğrulama

Betikler `scripts/verify/` altında. Generator'ın arayüzle aynı çağrılarını esbuild ile paketleyip headless çalıştırırlar (`_*-entry.ts` paket girişleri). Çıktılar `scripts/verify/out/` altına yazılır (gitignore). Model ayarları `scripts/verify/fixtures/varlik360.manifest.v3.json`'dan gelir.

## Golden set

Varlik360 BE: `/Users/atakanatabey/Projects/VarlikALL/Varlik360/src/modules/**/*.model.ts`. Her model crash'siz parse edilmeli ve dolu `fields` üretmeli (boş `fields` = hata).

15 modül: `app-version-configs`, `audit-log`, `daily-fx-rates`, `daily-portfolio`, `fund-daily-metrics`, `ip-blacklist`, `notifications`, `subscriptions`, `symbol-types`, `symbols`, `transactions`, `user-asset-categories`, `user-subscriptions`, `user-watch-list`, `users`.

**Gerçek Varlik360 klasörüne yazılmaz.** Regen betikleri kopya üzerinde çalışır (`out/regen/<etiket>/`). İstisna: `admin-config-check` `apps/admin` içinde geçici bir klasör açıp siler; `migrate-module` bilerek Varlik360'a yazar (yalnızca taşıma işinde).

## Betikler

| Komut | Kontrol | Süre |
| --- | --- | --- |
| `node scripts/verify/test-core-assets.mjs` | Core asset birim testleri (`toWire`, `extractListPagination`, id / sort eşlemesi, gizli alan strip, auth scope) | saniyeler |
| `node scripts/verify/smoke-varlik360.mjs` | Golden set: parse → field kind → model editörü taslağı → `model.hbs` | saniyeler |
| `node scripts/verify/admin-config-check.mjs [--keep]` | Bütün modeller → admin config, `apps/admin` içinde `tsc` + eşleme kontrolleri | ~1 dk |
| `node scripts/verify/regen-varlik360.mjs --manifest` | Manifest v3 round trip; eski manifest yok sayılır, tercihler korunur, bir kez yedeklenir | saniyeler |
| `node scripts/verify/regen-varlik360.mjs --p5` | Model başına `api` + hidden / adminOnly round trip, dosyadan API tespiti, yeni model route kuralları, enum / default | saniyeler |
| `node scripts/verify/regen-varlik360.mjs --resave-models [etiket]` | Model editörü yolu (`loadModelDraft` → `updateModel`) | dakikalar |
| `node scripts/verify/regen-varlik360.mjs <etiket> --planned --core-overlay` | Kopyaya 15 modül update mode'da üretilir, Varlik360'a göre drift, kopyada `tsc --noEmit` | uzun; arka planda çalıştır |
| `node scripts/verify/regen-varlik360.mjs --compare <sol> <sağ>` | İki regen etiketi arasında dosya farkı (`<sol>..<sağ>.patch`); 0 = aynı | saniyeler |
| `node scripts/verify/regen-varlik360.mjs --core-assets <etiket> [assetDir]` | Host kopyasında core asset'ler değiştirilip `tsc` | dakikalar |
| `node scripts/verify/migrate-module.mjs <m> --ops list,getOne,… [--no-admin] [--no-auth] [--be-only\|--fe-only]` | Bir modülü arayüzle aynı çağrılarla taşır (manifest kaydı + BE + FE config). **Varlik360'a yazar** | saniyeler |

`--planned`: plandaki işlem setleri, gizli alanlar ve `users` için `self` + adminOnly birleşik modele uygulanır. `--core-overlay`: güncel şablonların istediği core asset'ler kopyaya önce kopyalanır. `out/regen/` altında karşılaştırma tabanı olarak son geçerli etiket saklanır (bugün `gate7`).

## Kapılar

| Değişiklik | Kapı |
| --- | --- |
| Her değişiklik | Generator `npx tsc --noEmit -p tsconfig.json`: `src/generator-assets` dışı hata sayısı artmaz (bugün 3). `npm run build:electron` başarılı |
| Parser, `modelCreator`, `mongooseModelContext`, field kind / token, `normalizedModel*`, `modelMerge`, manifest | smoke 15 / 15, `--manifest`, `--p5`, `--resave-models` + `--compare` |
| BE şablonları / `BackendGenerator` | regen `--planned --core-overlay` → tabana göre `--compare` yalnızca beklenen fark, kopyada `tsc` artmaz, custom blok içerikleri birebir |
| Core asset'ler | `test-core-assets` + `--core-assets` |
| Admin config | `admin-config-check` |
| `packages/admin-base` | `npm run typecheck`, `npm test`, `npm run build` |
| .NET üreticisi (`dotnet-efcore/`, şablonlar, asset'ler, parser, `dotnetBackend.ts`) | `regen-dotnet.mjs`, sonra `dotnet-e2e.mjs` (arka planda) |
| Arayüz | Electron / tarayıcı kontrolü, **en son** |

Kasıtlı bir bozulma varsa (safe degrade) kapı sonucu ile birlikte belgelenir.

## Sıra

Önce ucuz kontroller (tsc, birim testleri, smoke), sonra regen ve config kapıları, tarayıcı / Electron kontrolü en son ve toplu.

## Yerel BE test ortamı (Varlik360)

Atlas'a asla bağlanılmaz.

- Mongo: `orb start`, ardından `docker run -d --rm --name gen-symboltypes-mongo -p 27099:27017 mongo:7.0.14` (DB `generator_symboltypes_test`; `--rm` olduğu için OrbStack kapanınca veri gider).
- BE (Varlik360 kökü): `MONGODB_URI=mongodb://127.0.0.1:27099/generator_symboltypes_test ADMIN_USER_IDS=<admin userId> PORT=3999 npm start`. `.env` değiştirilmez.
- Admin: `.claude/launch.json` → `varlik360-admin-localbe` (port 5194).
- Token: `.env` `JWT_SECRET` ile `{ userId }` imzalı kısa ömürlü JWT; secret ekrana basılmaz, token dosyası iş bitince silinir.

## .NET EF Core

Ayrıntı: [backend/dotnet-efcore.md](backend/dotnet-efcore.md). Çıktılar `scripts/verify/out/dotnet/<etiket>/`. Model kaynakları `scripts/verify/fixtures/dotnet/models.json` (EventTypes, Documents, MembershipPlans, Templates, Users, UserNotes: bütün kind'lar, ilişkiler, ownership) ve golden set (`varlik360.manifest.v3.json`).

| Komut | Kontrol | Süre |
| --- | --- | --- |
| `node scripts/verify/regen-dotnet.mjs [etiket]` | Boş host, fixture ve golden set: `dotnet build` 0 uyarı 0 hata, `dotnet test`, ikinci generate hiçbir şey yazmaz; parser gidiş-dönüşü; uygulama akışı (bootstrap → tarama → model editörü → generate → notlar → admin uç yolu → ilişki alanları); .NET modellerinden admin config + admin-base tiplerine karşı `tsc` | ~1 dk |
| `node scripts/verify/dotnet-e2e.mjs [etiket] [--no-parity] [--skip-regen]` | `regen-dotnet` + fixture host'a migration + `dotnet run` → D2 / D3 / D4 / D0 smoke'ları; Docker'da Mongo + Varlik360 HTTP uygulaması ile golden host arasında `contract-parity.mjs` | ~3–4 dk; arka planda |
| `node scripts/verify/dotnet-d0-smoke.mjs` (ve `-d2-documents`, `-d3-relations`, `-d4-ownership`) | Çalışan bir host'a karşı tek tek (`API_BASE`, `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`); D2–D4 boş tablo bekler | saniyeler |
| `node scripts/verify/contract-parity.mjs` | Aynı senaryolar Express ve .NET'te; şekil karşılaştırması, bilinen farklar betikte gerekçeli | saniyeler |

Gerekenler: .NET 10 SDK, yerel Postgres (`PG_HOST`, varsayılan `/tmp` soketi; kullanıcının veritabanı oluşturma yetkisi), eşlik için Docker (OrbStack) ve `node_modules`'lı Varlik360 (`VARLIK360`). Express tarafı `scripts/verify/fixtures/express-parity-host.ts` ile yalnızca HTTP uygulaması olarak açılır (job, Firebase, gerçek `.env` yok); Varlik360 kaynağına yazılmaz. `regen-dotnet`'in admin config adımı, `admin-config-check` gibi Varlik360 `apps/admin` içinde geçici bir klasör açıp siler.

Bilinen: `regen-varlik360 --p5` iki tespit senaryosunda FAIL (Symbols, AppVersionConfigs); HEAD'de de aynı, .NET işinden bağımsız.

## İstemci veri katmanı

Ayrıntı: [frontend/client-data-layer.md](frontend/client-data-layer.md).

| Komut | Kontrol | Süre |
| --- | --- | --- |
| `node scripts/verify/regen-client.mjs [--adopt] [--keep]` | Varlik360 manifest'i + model dosyaları → mobile'ın 8 modülü (`redux-rn`), Varlik360 `apps/mobile` içinde geçici kopyada (`.gen-client-check/`, iş bitince silinir): operasyonlar = `resolveNormalApi`, var olan dosyalara dokunulmaz, ikinci generate hiçbir şey yazmaz, mobile `tsc` tabanı (2) artmaz, uzantı sözleşmesi derlenir (genişletilmiş state, kendi thunk'ını dispatch eden hook), reducer'lar gerçek store'da sahte `API` ile (append, update merge + populate korunur, delete `meta.arg`, hata state'i bozmaz). Üretilenler `scripts/verify/out/client/`. `--adopt`: eski üretilmiş servis / thunk / slice'lar stub'la değişince ekranlarda kalan `tsc` hataları (bilgi; C3 iş listesi) | ~15 sn |
