# AlphaTerminal + Varlik360 + CeyizDefterim + SharedFrame: kalan işler

Son güncelleme 10.11.2026.

Kurallar ortak `.cursor/rules` dosyalarında: kaynak `src/generator-assets/cursor-rules/`, dağıtım `node scripts/rules-sync.mjs --apply`. Testler: tam koşu sorulmadan çalıştırılmaz; yalnız kırık / değişen testler. StockExchange artık AlphaTerminal.

# Açık işler

## D. Projeler

| # | İş |
| --- | --- |
| D3 | Varlik360 admin'inde 5 sahipsiz G dosyası (`drift-check --generated`): `components/Core/AdminTable/index.tsx`, `components/Core/Text/{index.tsx,scale.ts}`, `hooks/useAdminServerPagination.ts`, `services/users.service.ts`. Eski Generator üretmiş, bugünkü üretmiyor; elle yazılmış Logs ve Bildirim Gönder sayfaları kullanıyor. Karar: damga kaldırılıp K yapılır ya da sayfalar admin-base'e taşınıp dosyalar silinir |

## E. Commit

| # | Repo | Bekleyen |
| --- | --- | --- |
| E0 | Hepsi | Her host commit'inden önce `node scripts/drift-check.mjs <host> --generated` çıkış 0 olmalı (bugün SharedFrame, AlphaTerminal, CeyizDefterim 0; Varlik360 D3 yüzünden 1) |
| E1 | Generator | `6ff9513` sonrası: CRLF dışı her şey (TDZ, yorum temizliği, Express `requiresAuth`, logging asset'i, .NET mesaj / `ApiSetup` / rate limit, Express / Python rate limit, `errorData.field` (Python / Express), .NET auth G / K (B2), transaction soyutlaması (B3), `drift-check` + `assets-sync --check` + sahipsiz G dosyası (B4), sağlık ucu (D1 A1: G `HealthEndpoints.cs`, iskelet `MapHealth()`, `useHealthEndpoint` migration), bakım (C: betiklerde AlphaTerminal adı, `rules-sync` kardeş klasörler + CRLF, `test-core-assets` / `express-bootstrap` Windows'ta, OTP log okuyucu, `tsc` 0 hata), dokümanlar, AlphaTerminal adı) |
| E2 | SharedFrame | web / admin generated dosyalar, backend çekirdek sync + K dosyaları (`Messages.Custom.cs`, `IAppDbContext.Custom.cs`, `ApiSetup.Custom.cs`, `RateLimitPolicies.cs`), kaynak dosyaları, auth sync (G auth dosyaları, K `BcryptPasswordHasher.Custom.cs` / `AuthInfrastructure.Custom.cs` / `QueuedMailSender.cs`, `AuthMessages*.resx`, `PasswordHasherTests.cs`), transaction soyutlaması (`AppDbContext.Database.cs`, `IAppDbContext.Custom.cs` sadeleşti, 5 servis), env / compose / dokümanlar, testler; `tests/e2e/` stage'de; `.cursor/rules` (`rules-sync`, C2); D1: `HealthEndpoints.cs` + `Program.cs`, `JobsSetup.RecurringJobIds` / `JobsApi.cs`, `HealthEndpointTests.cs`, web profil ad düzenleme (`Profile/index.tsx`, `auth.service.ts`, `auth.thunk.ts`, `auth.slice.ts`, locales) |
| E3 | Varlik360 | generate çıktısı (admin config, client-http, logging asset'i), manifest `native`, ortak rate limit (`src/core/rate-limit/`, `express-rate-limit` kalktı), `errorData.field` (`api-contract.ts`, `response.helper.ts`, `validate.middleware.ts`); kullanıcının `yarn.lock` ve `tests/e2e/` değişiklikleri ayrı; `.cursor/rules` (`rules-sync`, C2); D2: `core/middleware/error.middleware.ts`, `index.ts`, `app.ts`, locales `invalidJson` |
| E4 | AlphaTerminal | generate çıktısı (TDZ fix + damgalar), ortak rate limit ve `errorData.field` (`core/http/{rate_limit,client_ip,rate_limit_policies,contract}.py`, `core/errors/app_error.py`, auth router, `slowapi` / `uv.lock`, config, compose, `.env.example`, `documents/security.md`, testler); `.cursor/rules` (`rules-sync`, C2) |
| E5 | CeyizDefterim | Generator'la eşitleme (B5): core + auth asset'leri, generate (`Localization:Cultures`), K `QueuedMailSender.cs` + `AuthInfrastructure.Custom.cs`, projenin `IAppDbContext.Transactions.cs` / `AppDbContext.Transactions.cs`'i silindi (G `AppDbContext.Database.cs` aynı imzayla), `.env.example` / `docker-compose.yml` `RATE_LIMIT_*` + `TRUSTED_PROXY_CIDRS`, testler (`RATE_LIMIT_ENABLED=false`, `EnsureAdminAsync`), `tests/e2e/test-scenarios.md`; admin / mobil `client-http` + generate (TDZ, yorum), admin config damgaları; `.cursor/rules` (`rules-sync`, C2); `HealthEndpoints.cs` + `Program.cs` |

## F. Test (commit sonrası, ayrı agent)

Commit'ten sonra testleri ayrı bir agent koşar ve sonuçları her projenin `tests/e2e/test-scenarios.md` "Sonuç" sütununa yazar. Test agent'ı uygulama kodunu değiştirmez; kırık testi senaryo no, beklenen ve gelen ile raporlar, düzeltme ayrı işte yapılır (`general.mdc` "Testing").

**F1 SharedFrame e2e yeniden koşusu**

- E2E yeniden koşulur ve `tests/e2e/test-scenarios.md` güncellenir: TDZ'li ~20 web / admin senaryosu (fix generate ile geldi), limit 1–100 (senaryo A4, artık 400). Koşuda anonim istekler `general` 120 / dk'ya takılabilir: gerekirse `RATE_LIMIT_GENERAL=0` (B23 için `RATE_LIMIT_AUTH` açık kalır)

**F2 Playwright / Maestro**

| Proje | Senaryolar | Kod |
| --- | --- | --- |
| SharedFrame | `SharedFrame/tests/e2e/test-scenarios.md` (A–I) | ✅ yazıldı; F1 ile yeniden koşulacak |
| AlphaTerminal | `AlphaTerminal/tests/e2e/test-scenarios.md` (A–J, admin I, partner H) | ⏳ |
| Varlik360 BE + admin | `Varlik360/tests/e2e/test-scenarios.md` (A–I, admin H, webhook G) | ⏳ Önce: OTP maili Gmail'e sabit (Mailpit için env). Tam koşuda API `RATE_LIMIT_GENERAL=0` |
| Varlik360 mobil (ayrı repo) | `Varlik360/apps/mobile/tests/e2e/test-scenarios.md` (A–I, Maestro) | ⏳ |
| CeyizDefterim BE + admin | `CeyizDefterim/tests/e2e/test-scenarios.md` (A–J, admin I) | ⏳ |
| CeyizDefterim mobil | `CeyizDefterim/apps/mobile/tests/e2e/test-scenarios.md` (A–I, Maestro) | ⏳ |

**F3 Genel kontroller (her proje)**

- Her uygulamada `tsc` + `eslint`. Bu makinede yapılamayanlar: Varlik360 mobil (`node_modules` yok), AlphaTerminal tam `pytest` (`uv` yok; rate limit için `uv sync` ile geçici ortamda auth / audit / ip_blacklist / security / admin testleri 82 / 82 geçti; tam paket hatasız toplanıyor, 1645 test), AlphaTerminal `packages/format` (`dayjs` kökte kurulu değil).
- `grep` ile `envelope|unwrapData|apiLocalRequest|parseLocalResponse|thunkCatch|PageMeta` boş çıkmalı.
- `client-auth` ikinci kez çalıştırıldığında hiçbir şey yazmamalı.

**F4 Tarayıcı ve cihaz turu** (şimdiye kadar hiçbir panel tarayıcıda açılmadı)

- Admin (her proje, çalışan backend ile): giriş, admin olmayanın reddi, Dashboard, Jobs, bir liste sayfası (sayfalama, filtre, form), tema kalıcılığı.
- Alpha web: giriş, Google ile giriş, plan rozeti, 461 kota, kayıt + OTP.
- Varlik360 mobil: Alpha listeleri (kaydırma), deep-dive, giriş + OTP.
- Ceyiz admin: giriş, liste / form, Dashboard.
- Ceyiz mobil: giriş, kayıt + OTP, Google / Apple, şifremi unuttum, hesap silme, bir liste ekranı.

## G. Deploy (sunucuda, en son, testler geçtikten sonra)

Adımlar sırayla, tek tek yapılır; her adımın "Kontrol" sütunu bitmeden sonrakine geçilmez.

| # | İş | Kontrol |
| --- | --- | --- |
| G0 | **Deploy öncesi:** F bölümü testleri geçmiş olmalı. AlphaTerminal testleri Python 3.12 ile koşar (`lxml` 5'in 3.14 Windows tekeri yok; `uv sync --python 3.12`), Mongo `ALPHA_TEST_MONGO_URI` ile verilebilir | Testler yeşil |
| G1 | **Alpha web Google girişi:** `VITE_GOOGLE_CLIENT_ID` sunucudaki git dışı `apps/web/.env`'e, `GOOGLE_CLIENT_IDS` kök `.env`'e. Google Cloud'da web client'ın "Authorized JavaScript origins"ına prod alan adı eklenir | Web'de Google ile giriş |
| G2 | **Alpha migration:** deploy'dan önce `scripts/migrations/2026_shared_auth.py` (`authProviders` / `googleId` → `provider` / `providerUserId`). Sıra: migrate, sonra Jenkins | Eski kullanıcı şifre ve Google ile girer |
| G3 | **Alpha rate limit env:** sunucu `.env`'den `RATE_LIMIT_DEFAULT`, `RATE_LIMIT_STORAGE_URI`, `RATE_LIMIT_HEADERS_ENABLED`, `AUTH_RATE_LIMIT_PER_MINUTE`, `TRUST_X_FORWARDED_FOR` silinir. Önce `RATE_LIMIT_STORAGE_URI`'de Redis var mı bakılır: varsa artık kullanılmaz, sayaç bellekte (tek API worker). Yeni `RATE_LIMIT_*` varsayılanları yeter (`auth` 10/60, `general` 120/60, admin 600/900 ve 120/900) | `docker compose config` çıktısında eski adlar yok |
| G4 | **Alpha istemci IP'si:** compose `api` servisi `TRUSTED_PROXY_CIDRS=172.16.0.0/12` alır (eski config varsayılanındaki Docker ağı). Docker ağı farklıysa (`docker network inspect`) değer `.env`'den verilir. Yanlışsa bütün istekler Docker gateway IP'sinden gelir ve tek sayacı paylaşır | Deploy sonrası `logs/<tarih>/api.jsonl`'da `ip` gerçek istemci adresi; iki farklı ağdan login denemesi ayrı sayılır |
| G5 | **Varlik360 auth geçişi (sert):** yeni BE açılmadan önce `scripts/migrate-shared-auth.ts` (kuru çalıştırma varsayılan, `--apply` yazar; şifre / sağlayıcı alanları, `ADMIN_USER_IDS` → `role: admin`, tekil e-posta index'i). Sunucu `.env`: `GOOGLE_CLIENT_IDS`, `APPLE_CLIENT_IDS` (+ `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`), `JWT_ACCESS_TTL_MINUTES`, `JWT_REFRESH_TTL_DAYS`. Yeni mobil sürüm aynı anda + `app-version-configs` zorunlu güncelleme; herkes bir kez yeniden giriş yapar | Mobil ve admin'de giriş |
| G6 | **Varlik360 rate limit env:** sunucu `.env`'den `AUTH_RATE_LIMIT_PER_MINUTE` silinir; `RATE_LIMIT_ENABLED=true`, `RATE_LIMIT_AUTH=10/60`, `RATE_LIMIT_GENERAL=120/60`, `RATE_LIMIT_ADMIN_READ=600/900`, `RATE_LIMIT_ADMIN_WRITE=120/900` eklenir. `express-rate-limit` kalktığı için sunucuda `yarn install` (pm2 restart'tan önce). API pm2 ile nginx'in arkasında aynı makinedeyse `TRUSTED_PROXY_CIDRS` varsayılanı (loopback) yeter; nginx başka makinedeyse onun adresi yazılır | pm2 log'unda IP'ler gerçek istemci; 11. hatalı login 429 + `Retry-After` |
| G7 | **CeyizDefterim ilk yayın:** tek `Initial` migration'ı (5 migration birleştirildi, prod'a hiç çıkmamıştı); env `Auth__GoogleClientIds`, `Auth__Apple*`, `Jwt__AccessTtlMinutes`, `Jwt__RefreshTtlDays`, `RATE_LIMIT_*`, `TRUSTED_PROXY_CIDRS` (eski `Google__ClientId`, `Jwt__ExpiresMinutes`, `Admin:Email/Password`, `Auth__RateLimitPerMinute` kalktı). `appsettings` `Localization:Cultures`. Mobil sürüm BE ile birlikte | Mobil giriş, admin paneli |
| G8 | **SharedFrame env:** sunucu `.env`'den `Auth__RateLimitPerMinute` silinir; `RATE_LIMIT_*` ve `TRUSTED_PROXY_CIDRS` compose varsayılanlarıyla gelir (prod değerleri). Diller `appsettings` `Localization:Cultures` (en, tr, de) | Misafir sayfası açılıyor, `/api/health` 200 |
| G9 | **İlk admin e-postası:** prod'da admin zaten varsa kaydın e-postası veritabanında elle `atabeyogluatakan.dev@gmail.com` yapılır (seed yalnız boş veritabanında çalışır) | Admin bu e-postayla giriş yapar |

# Tamamlananlar

| Konu | Sonuç | Ayrıntı |
| --- | --- | --- |
| Ortak auth ve sözleşme | G-wraps-K auth, tek cevap sözleşmesi (`{ isSuccess, data, uiMessage, errorData, traceId }`), envelope katmanı yok; ilk admin dört projede `atabeyogluatakan.dev@gmail.com`; Alpha login aktörü activity log'a yazılıyor | [docs/api-contract.md](docs/api-contract.md), [docs/backend/auth.md](docs/backend/auth.md) |
| İstemci TDZ hatası | `auth.generated.ts` token anahtarlarını geç okuyor, `platform.generated.ts` Toast'ı barrel'dan değil doğrudan alıyor; web / admin production build açılıyor | `client-http` asset'leri |
| Windows CRLF | `entityParser`, `authBlocks`, `tidyPython`, Express route bağlama satır sonuna dayanıklı (alan kaybı hatası); `6ff9513` | — |
| Varlik360 generate farkları | `Transactions` model adı ve `userAssetCategories` koleksiyonu manifest `native`'de; Express route modelin `api.requiresAuth`'una uyuyor; Varlik360 logging'i Generator asset'i oldu (`pino-pretty` iskelette) | [docs/backend/express-mongoose.md](docs/backend/express-mongoose.md) |
| .NET mesaj yapısı | Anahtar + `.resx`: G `Messages` (`partial`) + `CommonMessages*.resx`, auth `AuthMessages*.resx` (`Auth.` önekli), proje K `Messages.Custom.cs` + `Messages*.resx`; argüman ayırıcısı `\u001F`; çeviri cevapta (`ResultExtensions`), istek dışında `Localize(text, language)`; nötr dil `en` (G `NeutralResourcesLanguage.cs`); diller `appsettings` `Localization:Cultures` | [docs/backend/dotnet-efcore.md](docs/backend/dotnet-efcore.md) |
| .NET hata ve sonuç | `errorData.field` (doğrulama, JSON hatası), `Error.Forbidden(message)`, `Result` için de `Error`'dan örtük dönüşüm (`Result<T>`'de zaten vardı) | [docs/api-contract.md](docs/api-contract.md) |
| .NET `ApiSetup` | G + K hook'ları (`ApiSetup.Custom.cs`: `AddCustomServices`, `ConfigureCustomCors`); `Content-Disposition` / `Retry-After` açık, rota 404'ü `RouteNotFound`. Eski host'ların K dosyalarını generate tamamlar: `Localization`, çift `UseRateLimiter`, `IDbErrorClassifier` kaydı, Postgres null sıralaması | [docs/backend/dotnet-efcore.md](docs/backend/dotnet-efcore.md) |
| .NET rate limit | G `RateLimitSetup.cs`: `auth` 10/60, `general` 120/60, `admin-read` 600/900, `admin-write` 120/900, env `RATE_LIMIT_*`, yalnız `/api/…`, policy'li uç `general`'e girmez, 429 + `Retry-After`, `TRUSTED_PROXY_CIDRS` (varsayılan loopback); proje policy'leri K `RateLimitPolicies.cs` | [docs/backend/rate-limit.md](docs/backend/rate-limit.md) |
| SharedFrame backend | Generator çekirdeğiyle eşit: `assets-sync` farklı 0 (49 / 49), `dotnet build` temiz, `dotnet test` 104 / 104 (Postgres, Docker `dotnet/sdk:10.0`); web / admin build | — |
| Yorum temizliği | `client-http` asset'leri, .NET pagination asset'leri ve `client-redux` şablonları açıklama yorumsuz (damga ve işaretçiler kalır); backend şablonlarındaki yorumlar şimdilik kalıyor | — |
| Express rate limit | G `core/rate-limit/rate-limit.ts` (`createRateLimitMiddleware`, `trustedProxies`): .NET'le aynı profiller, env ve 429; policy'ler yol + metotla eşleşir (`auth` G'de), proje policy'leri K `rate-limit.policies.ts`; auth route'larındaki `authRateLimit` ve `AUTH_RATE_LIMIT_PER_MINUTE` kalktı. Varlik360: `express-rate-limit` ve 14 route bağlaması kalktı, `tsc` temiz, auth / genel / admin / başlık anahtarı / kapatma elle denendi | [docs/backend/rate-limit.md](docs/backend/rate-limit.md) |
| Python rate limit | G `core/http/rate_limit.py` (`RateLimitMiddleware`) + `client_ip.py`: .NET / Express'le aynı profiller, env ve 429; policy yolu `API_PREFIX`'ten sonra eşleşir; K `rate_limit_policies.py`. AlphaTerminal: `slowapi` kalktı, ruff / import-linter temiz, ilgili testler 82 / 82 | [docs/backend/rate-limit.md](docs/backend/rate-limit.md) |
| `errorData.field` (Python, Express) | Gövde doğrulamasında ilk hatanın JSON yolu (`items[0].name`); query / path hatası taşımaz. Python G `contract.py` (`error_response(…, field)`, `AppError(field=…)`), Express G `api-contract.ts` / `response.helper.ts` + iskelet `validate.middleware.ts`. AlphaTerminal: sync, sözleşme testleri 112 / 112; Varlik360: sync + `validate.middleware.ts` elle, `tsc` temiz, login'de denendi | [docs/api-contract.md](docs/api-contract.md) |
| .NET auth G / K (B2) | Auth dosyaları `assets-sync` planında: `*.Custom.cs` / `AuthHooks.cs` K, ötekiler G (`renderDotnetAuthFiles`, manifest `workspace.auth.modules`); yeni host'ta G dosyalar G damgasıyla (core asset'ler de). Genel hook'lar: `AddCustomAuthServices`, `VerifyLegacyHash`, `IPasswordHasher.NeedsRehash` (girişte yeniden hash). SharedFrame: auth Generator'la eşit (`assets-sync` farklı 0, 72 / 72), PBKDF2 geçişi K `BcryptPasswordHasher.Custom.cs`, kuyruklu mail K `QueuedMailSender.cs` + `AuthInfrastructure.Custom.cs`, `AuthMessages.de.resx`, `Messages.de.resx`'e `TooManyRequests*`; `dotnet test` 107 / 107 (yeni `PasswordHasherTests`). Örnek host bootstrap + build 0 uyarı | [docs/backend/auth.md](docs/backend/auth.md) |
| Transaction soyutlaması (B3) | G `IAppDbContext`: `BeginTransactionAsync` → `IAppTransaction`, `ClearTracking`, `OriginalValue`; gerçekleştirme G `AppDbContext.Database.cs`. SharedFrame: `IAppDbContext.Custom.cs`'ten `Database` / `ChangeTracker` kalktı; `MediaUploadService`, `OrderFulfillmentService`, `OrderRefundService`, `OrderCheckoutService`, `EventHooks` yeni üyelerle; build 0 uyarı, `dotnet test` 107 / 107. Örnek host Postgres ve MongoDB 0 uyarı | [docs/backend/dotnet-efcore.md](docs/backend/dotnet-efcore.md) |
| Kayma kontrolü (B4) | `scripts/drift-check.mjs <host> [--generated]`: asset'ler (kök + `apps/*`, `assets-sync --check`) ve generate çıktısı (geçici kopyada asset sync / generate / admin-config / client, G damgalı dosyalar host'la karşılaştırılır; sahipsiz G dosyası: kopyada işaret satırı eklenir, yeniden yazılmayan dosya Generator'ın artık üretmediği dosyadır; host'a yazmaz). Kopyada bozulan .NET ve admin G dosyası yakalandı. SharedFrame, AlphaTerminal, Varlik360: 0 fark. Commit öncesi kural host kurallarında (`AtaProjectCommon.mdc`, dağıtım C2) | [docs/verification.md](docs/verification.md) |
| CeyizDefterim eşitleme (B5) | Auth farkları SharedFrame'deki gibi: Generator yeniydi (rate limit, `NeedsRehash`, resx mesajlar, mail çevirisi), projeye özel olan yalnız Hangfire kuyruklu mail → K. Core G dosyalarında elle değişiklik yoktu. Projenin kendi transaction soyutlaması G'ninkinin alt kümesiydi, silindi. Önceden kırık 3 test (eski `Admin:Email/Password` seed'ine bağlı admin girişi) test fabrikasının kendi admin'iyle düzeldi. Build 0 uyarı, `dotnet test` 21 / 21, `drift-check --generated` 0. Admin / mobil `tsc` koşmadı (`node_modules` yok); değişiklik yalnız TDZ düzeltmesi ve yorum silme | — |
| Generator bakımı (C) | C1: doğrulama betikleri ve `.claude/launch.json`'da StockExchange → AlphaTerminal (`--no-alphaterminal`, `ALPHATERMINAL_ROOT` tek env adı), `docs/verification.md`. C2: `rules-sync` host'ları Generator'ın yanındaki klasörlerden bulur (Varlik360 için `Varlik360` / `Varlik360-Backend-Admin`), CRLF'i normalize eder; dört host'a uygulandı (20 dosya, işaretin altındaki proje kısımları aynı). C3: `test-core-assets` `mongoose`'u Varlik360'tan alır (`VARLIK360` ya da kardeş klasör) 24 / 24; `express-bootstrap` Windows'ta `npm` (shell) ve çok satırlı log'dan OTP okuma (`auth-scenarios.mjs`) ile hepsi PASS. C4: Generator `tsc` 0 hata (iki kullanılmayan import, `debug` log satırı, `modelMerge` bileşen tipi), `build:electron` başarılı | [docs/verification.md](docs/verification.md) |
| Proje düzeltmeleri (D) | D1 A1 `GET /api/health`: .NET'te Generator hatasıydı (gövdesiz 200); G `HealthEndpoints.cs` zarflı `{ status, environment, databaseConnected }`, iskelet ve eski host'ların `Program.cs`'i `MapHealth()` (SharedFrame worker modu dahil, CeyizDefterim). D14: `JobsSetup.RecurringJobIds` tek liste, `POST /api/jobs/{id}/trigger` ona bakar (`expire-pending-orders` dahil beş iş). G1: web `/profile`'da ad düzenleme (K `auth.service.ts` `updateName`, `auth.thunk.ts` `updateNameAsync`, `auth.slice.ts` başarıda `user.name`; tr / en / de). D2 Varlik360: iskeletin `error.middleware.ts`'i (`notFoundHandler`, `errorHandler`) `app.ts`'in sonunda, `common.invalidJson`; JSON ayrıştırma istek bağlamından sonra (`traceId` hata cevabında). SharedFrame `dotnet test` 108 / 108 (yeni `HealthEndpointTests`), CeyizDefterim 21 / 21, web `tsc -b` + eslint temiz, Varlik360 `tsc` temiz ve elle denendi, örnek host Postgres / MongoDB 0 uyarı, `drift-check --generated` dört host'ta 0. Web profil formu tarayıcıda denenmedi (F1) | — |
| Misafir rate limit (SharedFrame) | `public-guest`: `X-Guest-Key` başına 120/60, IP tavanı 3000/60, `/api/public` grubu; uydurma anahtar tavanı aşamaz, anahtarsız yeni misafirler yalnız tavana sayılır. Generator'da genel: `RateLimitKey.Header` + `ipCeiling` | [docs/backend/rate-limit.md](docs/backend/rate-limit.md) |
