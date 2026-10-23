# Plan: Python + FastAPI backend

Durum (2026-10-23): kararlar kapandı. StockExchange tarafında **PY2 ve PY2b yapı olarak bitti**; Generator'a geçmeye engel yok, açık işler §7'de. Generator'da **PY1** kodu ve kapıları bitti, kalanlar §7.3; sıradaki StockExchange'te **PY3**. StockExchange'te hiçbir şey commit edilmedi (çalışma `main`'de, yedek dal `backup` = `937793a`).

**Tek kaynak bu dokümandır.** StockExchange `documents/py2-restructure-plan.md` adım adım ölçüm ve ayrıntı kaydı olarak kalır; plan ve açık işler buradan izlenir. Kod kuralları: StockExchange `documents/py2-rules.md`. Model alınan plan: [.NET planı](backend-dotnet-efcore.md). Aynı yol izlenir: önce elle yazılmış örnek, sonra şablon.

## 1. Hedef

- Aynı girdi (NormalizedModel v2 + manifest v3), aynı HTTP davranışı ([api-contract.md](../api-contract.md)). `@atakanimo/ata-admin-base` arkadaki stack'i bilmez.
- **Bütün backend'lerde yapılan işlemler ortaktır.** Üç stack'te aynı kavramlar ve adlar: CRUD servis tabanı, hook seti, liste gövdesi, filtreler, sayfalama, hata zarfı, `traceId` (§3). Bir stack'e eklenen ortak davranış diğerlerine de eklenir.
- Python 3.12+, FastAPI, Pydantic v2, MongoDB (async sürücü, K5).
- **Kapsam: yalnızca admin API.** Normal (web / mobil) API, ownership ve `normalOperations` admin geçişi bitince ayrı plan.

## 2. Hedef Python yapısı

Modüler monolit. API ve job'lar aynı uygulamanın iki giriş noktasıdır, aynı modülleri (servis + repository) kullanır.

Modül klasörü **entity başına**dır (`modules/<entity_snake>/`, collection adıyla aynı), Generator'ın diğer stack'leriyle aynı kural. Entity'ye bağlı olmayan elle yazılmış işler **özellik modüllerinde** durur; onlarda G dosyası olmaz (K19). Çok dosyalı özellik modüllerinde aynı adlar paket olur (`model/`, `repository/`, `service/`, `router/`, `jobs/`).

```
pyproject.toml              tek, kurulabilir paket (uv + uv.lock)
src/<app>/                  StockExchange: alpha_terminal
  core/                     altyapı: config, db, loglama, i18n, hata kodları, yanıt zarfı, auth
    crud/                   asset: ListBody, filtreler, sayfalama, CrudService, ServiceHooks, toWire
    http/                   asset: zarf, exception handler, traceId middleware
    errors/                 asset: ortak hata kodları (K9), AppError (K18)
  integrations/             dış servisler (veri sağlayıcılar, LLM, e-posta)
  engine/                   saf hesaplama, IO yok
  modules/<entity_snake>/
    model.generated.py          (G) Pydantic doküman modeli
    model.py                    (K) re-export + elle eklenenler
    repository.generated.py     (G) CRUD, liste, filtre, sayfalama
    repository.py               (K) entity'ye özel sorgular (generated tabanın alt sınıfı)
    schemas.generated.py        (G) Create / Update / Row / Filters
    service.generated.py        (G) CrudService'i bu modüle bağlar
    hooks.py                    (K) ServiceHooks alt sınıfı (§3)
    service.py                  (K) iş kuralları; API ve job'lar bunu çağırır
    admin_router.generated.py   (G) admin CRUD uçları
    admin_router.py             (K) CRUD dışı admin uçları
    router.py                   (K) public API
    jobs.py                     (K) bu modülün job'ları
  modules/<özellik>/            elle yazılır, G dosyası yok
  api/
    main.py                     (K) create_app(): middleware + router'lar
    routers.generated.py        (G) modüllerin admin router listesi
    deps.py                     (K) auth / yetki dependency'leri
  worker/
    main.py                     (K) scheduler; modüllerin jobs'larını kaydeder (`python -m <app>.worker`)
tests/                          src ile aynı ağaç (tests/core, tests/engine, tests/modules/<m> …)
```

Bağımlılık kuralları `import-linter` ile denetlenir (`pyproject.toml`):

```
api/, worker/  ──►  modules/  ──►  engine/, integrations/, core/
```

- `api/` ve `worker/` incedir, iş kuralı içermez.
- Modüller birbirinin yalnızca `service` / `model`'ini import eder; `repository`, `router`, `admin_router`, `jobs` yasak.
- `engine/` IO import etmez.
- Deploy: tek imaj, iki komut (`api`, `worker`).

## 3. Stack'ler arası ortak yapı

| Kavram | .NET (`Application/Common`) | Express (`@core`) | Python (`core/crud`, `core/http`) |
| --- | --- | --- | --- |
| CRUD servis tabanı | `ICrudService<…>` + `CrudServiceBase<…>` | üretilen `service(.admin).ts` | `CrudService[TDoc, TRow, TCreate, TUpdate, TFilters]` |
| Hook arayüzü | `IServiceHooks<…>` + `abstract ServiceHooks<…>` | `<E>ServiceHooks` (opsiyonel metotlar) | `ServiceHooks[…]` (boş `async` varsayılanlar) |
| Liste gövdesi | `ListBody<TFilters>` + `ListBodyValidator` | `ListPaginationBody` | Pydantic `ListBody[TFilters]` (strict) |
| Filtre / sayfalama | `Filtering/*`, `Pagination/*` | `pagination.helper` | `core/crud/filters.py`, `pagination.py` |
| Hata | `Result` / `Error` + `ErrorCodes` | hata yanıtı (`IApiResponse`) | `AppError(code)` + handler (K18) |
| Zarf | `ApiResponse`, `EnvelopeExceptionHandler` | `api-contract.ts` | `core/http/envelope.py` |
| Bağımlılık | DI (`DependencyInjection(.Generated).cs`) | modül import'u | FastAPI `Depends` + `api/routers.generated.py` |

Katman karşılıkları aynıdır; .NET'te katman önce, Python'da modül (entity) önce gruplanır. .NET'te katman kuralını derleyici, Python'da `import-linter` korur.

| .NET katmanı | Python (`modules/<entity_snake>/`) |
| --- | --- |
| Domain (`<Entity>.cs` G + `.Custom.cs` K) | `model.generated.py` + `model.py` |
| Infrastructure (persistence) | `repository.generated.py` + `repository.py` |
| Application (servis, DTO, hook) | `schemas.generated.py`, `service.generated.py`, `hooks.py`, `service.py` |
| Api (endpoint) | `admin_router.generated.py` + `admin_router.py` |

### Ortak hook seti (üç stack)

| Hook | Ne zaman | Dönüş | Bugün |
| --- | --- | --- | --- |
| `defaultSort` | liste, istekte `sortBy` yoksa | sıralama ya da yok (varsayılan `createdAt desc, id desc`) | .NET, Express |
| `beforeList` | liste sorgusundan önce | değiştirilmiş sorgu / filtre | .NET, Express |
| `beforeGetById` | getOne'dan önce | hata ya da devam | .NET, Express |
| `beforeCreate` / `beforeUpdate` / `beforeDelete` | yazmadan önce | hata → işlem durur | .NET, Express |
| `afterCreate(row)` / `afterUpdate(row)` | yazdıktan sonra | — | .NET, Express (PY1) |
| `afterDelete(row)` | sildikten sonra (cascade, cache temizliği) | — | .NET, Express (PY1) |
| `mapRows(rows)` | list sayfasının bütün satırları (getOne'da tek satır), tek çağrıda, async | aynı sırada değiştirilmiş satırlar (ör. canlı fiyat) | .NET, Express (PY1) |

Kural: `after*` geri alınamaz. Hook hata fırlatırsa cevap hata olur ama yazma geri alınmaz; tutarlılık gerekiyorsa kontrol `before*`'a yazılır.

## 4. Kararlar

| # | Konu | Karar |
| --- | --- | --- |
| K1 | Model kaynağı | Generator manifest'i. Python parser'ı yalnızca **bir kez içe aktarmak** için: mevcut Pydantic sınıfı manifest'e okunur, sınıf `model.generated.py`'ye geçer, sonra düzenleme Generator'da. Enum `StrEnum` yazılır; içe aktarmada `Literal[...]` da okunur |
| K2 | Kimlik | Her zaman `id` = Mongo `_id` (ObjectId hex). Doğal anahtarlar (`marketCode`, `code`, `ip`) sıradan unique alan |
| K3 | Zarf ve sayfalama | Sözleşme zarfı. Tek sayfalama yapısı: `data` içinde `PaginatedList { items, total, hasMore, currentPage, currentLimit }`; `meta` kullanılmaz. StockExchange'in `meta` dolduran 5 public ucu ve web'in parse katmanı web fazında döner |
| K4 | `traceId` | Sözleşmeye opsiyonel `traceId`; üç stack'te middleware doldurur; admin-base `ApiResponse.traceId?` |
| K5 | Mongo sürücüsü | Hedef PyMongo Async (Motor deprecated). **Geçiş en son adım (PY2c):** testlerin sahte DB'si `mongomock-motor` PyMongo Async ile çalışmaz, geçiş gerçek Mongo'lu test altyapısıyla birlikte yapılır. O zamana kadar kod ve asset'ler yalnızca `core/db.py`'deki `Database` takma adına ve iki sürücüde ortak API'ye (`find`, `to_list(length=…)`, `insert_one` …) göre yazılır; `motor` yalnız `core/db.py`'de |
| K6 | Admin route | Geçişte üretilen uçlar `/api/v1/admin-crud/<resource>`; eski uçlar FE geçene kadar `/api/v1/admin/<resource>`. Eski uçlar silinince üretilenler `/api/v1/admin/<resource>`'a taşınır, `admin-crud` kalkar |
| K7 | Dosya sahipliği | .NET ile aynı. G dosyaları `*.generated.py`, başlıkla başlar (`# <auto-generated by Generator />`), her generate'te yeniden yazılır. Başlıksız dosya kullanıcınındır, atlanır ve notta listelenir. K dosyaları ve asset'ler yalnızca yoksa yazılır |
| K8 | Asset'ler | `core/crud`, `core/http`, `core/errors` Generator asset'i. Projeye özel (K): `api/deps.py`, `api/main.py`, `core/config.py` |
| K9 | Hata kodu | `errorData.code` sözleşmedeki HTTP benzeri kod (400, 401, 403, 404, 408, 409, 422, 429, 463, 500, 503) + projeye özel alt kodlar: 4xx türü **460–479**, 5xx türü **560–579** (Varlik360 `PREMIUM_REQUIRED: 460`; StockExchange 460–469, 560–561). HTTP status aynı kalır. StockExchange'te uygulandı (BE + iki FE) |
| K10 | Başarı mesajı | Yazma uçları yerelleştirilmiş `uiMessage` döner; list / getOne'da boş olabilir |
| K11 | Hook seti | §3, üç stack'te aynı adlarla (Python'da snake_case) |
| K12 | Testler | Stack `contract-parity` betiğini geçer. Host'ta pytest; parity için gerçek Mongo (K15) |
| K13 | Yeni tip bilgileri (Generator geneli) | `number` → `numberFormat: 'int' \| 'float'` (varsayılan `float`; editörde C# / Python'da görünür). `date` → `dateFormat: 'datetime' \| 'date'`. `string` → `format: 'email'`. Sayısal enum (`IntEnum`). `Decimal`, `UUID`, `timedelta`, `bytes` ihtiyaç olunca |
| K14 | Alan kısıtları (Generator geneli) | `minLength`, `maxLength`, `min`, `max`, `pattern`; BE şemasında aynen, FE formunda kural |
| K15 | Parity ortamı | Yerel Docker (`ops/docker-compose.yml`: `alpha-mongo`, `alpha-api` :8765, `alpha-jobs`). Parity `parity` profilinde: aynı Mongo'da `alpha_parity` veritabanı + :8766'da API. Test kendi verisini oluşturur ve siler |
| K17 | Job'lar | `modules/<modül>/jobs.py` (ya da `jobs/`), `worker/main.py` kaydeder; API ile aynı servis ve repository |
| K18 | Hata modeli (Python) | Servis `AppError(code, message, status)` fırlatır, `core/http` handler'ı zarfa çevirir |
| K19 | StockExchange modülleri | **Entity:** `users`, `user_subscriptions`, `subscription_plans`, `ip_blacklist`, `audit_logs`, `markets`, `providers`, `symbols`, `scheduled_reports`, `daily_report_watchlist`, `deep_dive_reports`, `deep_dive_prompts`, `market_pulse_items`, `ohlcv_discontinuity_alerts`, `user_watch_lists`. **Özellik:** `auth`, `market_data`, `universe`, `funds`, `analysis`, `lists`, `nightly`, `ops`. Bir entity'nin iş mantığı kendi modülünün `hooks.py` / `service.py`'sinde |
| K20 | Sembol verisi (StockExchange) | **`markets`** (eski `market_configs`): kimlik alanları üstte, pipeline ayarları iç içe; `tickerNormalize: none \| dot_to_dash \| alnum`. **`symbols`**: `marketId`, `assetType` (`stock \| etf \| fund`), `ticker`, `name`, `indices`, `exchange`, `aum`, `avgDollarVolume`, `enabled`, `sortOrder`; unique `(marketId, assetType, ticker)`. CSV evren listelerinin yerine tek kaynak; okuma `symbols/service.py`'deki bellek görüntüsünden (API'de 60 sn'de bir yenilenir), yazma önce DB sonra görüntü. Makro listeler `symbols`'a girmez (`market_data`'da kalır). Mevcut 4 admin sayfası ve 24 uç aynı kalır (ince sarmalayıcı); ek `GET /api/v1/admin/symbols` + yeni `/symbols` sayfası |
| K21 | Adlandırma | Entity **çoğul PascalCase**, route `kebab-case(entity)`, collection `snake_case(entity)`; Generator'a path / ad ayarı eklenmez. İç içe tipler ve cache collection'ları değişmez. StockExchange'te uygulandı (§4.1) |

### 4.1 Adlandırma tablosu (K21)

| Eski model | Eski collection | Entity | Route | Collection |
| --- | --- | --- | --- | --- |
| `SubscriptionPlan` | `subscription_plans` | `SubscriptionPlans` | `/subscription-plans` | `subscription_plans` |
| `UserSubscription` | `user_subscriptions` | `UserSubscriptions` | `/user-subscriptions` | `user_subscriptions` |
| `User` | `users` | `Users` | `/users` | `users` |
| `IpBlacklistEntry` | `ip_blacklist` | `IpBlacklist` | `/ip-blacklist` | `ip_blacklist` |
| `ActivityEntry` | `activity_log` | `AuditLogs` | `/audit-logs` | `audit_logs` |
| `MarketConfig` | `market_configs` | `Markets` | `/markets` | `markets` |
| `ProviderConfig` | `provider_configs` | `Providers` | `/providers` | `providers` |
| market kopyaları + CSV | — | `Symbols` | `/symbols` | `symbols` |
| `ReportRun` | `report_runs` | `ScheduledReports` | `/scheduled-reports` | `scheduled_reports` |
| `DailyReportWatchlistEntry` | `daily_report_watchlist` | `DailyReportWatchlist` | `/daily-report-watchlist` | `daily_report_watchlist` |
| `DeepDiveReport` | `deep_dive_reports` | `DeepDiveReports` | `/deep-dive-reports` | `deep_dive_reports` |
| `DeepDivePromptDoc` | `deep_dive_prompts` | `DeepDivePrompts` | `/deep-dive-prompts` | `deep_dive_prompts` |
| `MarketPulseItem` | `market_pulse_items` | `MarketPulseItems` | `/market-pulse-items` | `market_pulse_items` |
| `OhlcvDiscontinuityAlert` | `ohlcv_discontinuity_alerts` | `OhlcvDiscontinuityAlerts` | `/ohlcv-discontinuity-alerts` | `ohlcv_discontinuity_alerts` |
| `WatchlistEntry` | `watchlists` | `UserWatchLists` | `/user-watch-lists` | `user_watch_lists` |

Route'lar resource üretilirken değişir; bugünkü admin URL'leri aynı.

## 5. Aşamalar

| Aşama | İş | Sonuç | Durum |
| --- | --- | --- | --- |
| PY0 | Kararların son hali | Bu doküman onaylı | ✅ |
| PY1 | **Generator geneli:** `traceId` (K4), tip bilgileri (K13), alan kısıtları (K14), `after*` + `mapRows` (§3) — NormalizedModel, editör, Express ve .NET emitter / asset'leri, admin config, admin-base (form kuralları, `ApiResponse.traceId`) | Express ve .NET golden set yeni bilgilerle üretilir, parity geçer; admin-base yeni sürüm; Varlik360 ve SharedFrame asset'leri elle güncellenir, generate + smoke | 🟡 kod + kapılar bitti (2026-10-23), açıklar §7.3 |
| PY2 | **StockExchange yeniden yapılanma** (§2) | §6.1 | ✅ yapı bitti, açıklar §7.1 |
| PY2b | **Sembol verisi** (K20) | §6.2 | ✅ T1–T5; T6 FE ve T7 kısmi, açıklar §7.2 |
| PY3 | **Elle yazılmış örnek** (StockExchange, `SubscriptionPlans`): `core/crud` (`CrudService`, `ServiceHooks`, `ListBody`, filtreler, sayfalama, `toWire`) + `modules/subscription_plans/` G/K dosyalarının elle yazılmış hali, `/api/v1/admin-crud/subscription-plans` | `contract-parity` geçer; plan iş mantığı (varsayılan planlar, `code` eşlemesi) hook / servis'te korunur | ⬜ sıradaki |
| PY4 | Asset'ler + iskelet: PY3'teki `core/crud`, `core/http`, `core/errors` → `generator-assets/python-fastapi`; `_skeleton`; manifest `workspace.backendStack: 'python-fastapi'` | Boş host'ta asset'ler kurulur, uygulama ayağa kalkar | ⬜ |
| PY5 | Şablonlar — basit alanlar: model, repository, schemas, service, admin_router (G) + hooks / service / repository / model (K) | Üretilmiş `SubscriptionPlans` PY3'ün testlerini geçer; PY3 dosyaları üretilmişleriyle değişir | ⬜ |
| PY6 | `reference`, `decimal`, `object` / `object[]`, `map`, `json`, `access` (readonly, hidden, adminOnly) | Golden set (Express / .NET ile aynı modeller); parity | ⬜ |
| PY7 | Python parser (K1) + tespit + IPC + arayüz | StockExchange'in bir modeli arayüzden içe aktarılır, generate edilir | ⬜ |
| PY8 | `regen-python.mjs`, `python-e2e.mjs`, `docs/backend/python-fastapi.md`, `.cursor/rules/backend-python-fastapi.mdc` | Yeni bir Python projesi dokümanla kurulabilir | ⬜ |
| PY2c | **Mongo sürücüsü** (K5), **en son**: testler gerçek Mongo'ya (`alpha_test` / testcontainers), Motor → PyMongo Async (`core/db.py` + asset), Motor'a özgü çağrılar | Test takımı ve nightly pipeline yeşil; `motor`, `mongomock-motor` kalkar | ⬜ en son |

## 6. StockExchange'te yapılanlar (özet)

Ayrıntı ve ölçümler: StockExchange `documents/py2-restructure-plan.md`.

### 6.1 PY2 — yeniden yapılanma (2026-10-22 / 23)

Davranış ve admin URL'leri değişmedi. Yöntem: `git mv` + libcst import codemod'u (`scripts/py2_codemod.py`, 298 eşleme, shim yok).

- **Taban (S0):** pytest 1528 passed, 1 skipped, 1 failed (bilinen kırmızı: `test_build_keep_tickers_from_csv_and_metadata`).
- **Paket:** `src/alpha_terminal/`, `pyproject.toml` + `uv.lock` (uv, editable); `requirements*.txt` silindi; Docker `python:3.12-slim` + `uv sync --frozen --no-dev`, `PYTHONPATH` yok.
- **Katmanlar:** `core/` (config, db + `Database` takma adı, logging, i18n, http, errors, auth, cache, export, ticker validation), `integrations/` (providers, mail), `engine/` (scoring, screening, backtest, trading, analytics, calendar, taxonomy; IO yok).
- **Modüller:** 15 entity, 8 özellik modülü (K19). 91 uçlu `routes/admin.py` modüllerin `admin_router.py`'lerine bölündü; kalan ops kısmı `ops/admin_router.py`.
- **Giriş noktaları:** `api/main.py` (`alpha_terminal.api.main:app`), `worker/main.py` (`python -m alpha_terminal.worker`), `worker/runtime/`. `jobs/`, `services/`, `packages/analysis_core/`, `stock_exchange/` silindi.
- **Adlandırma (S8):** 14 model sınıfı K21'e göre; 5 collection yeniden adlandırıldı, migration `scripts/migrations/2026_py2_rename_collections.py` (idempotent, `--apply`). Yerelde çalıştı.
- **Hata kodları (S9):** `core/errors/codes.py` K9'a göre; `apps/admin` ve `apps/web` `errorCodes.ts` aynı değerler.
- **Kurallar / CI (S10):** `import-linter`'a 24 sözleşme; Jenkins'e `Test` aşaması (geçici konteynerde `uv sync --frozen` + `pytest -q`; hiç koşmadı).
- **Testler (S11):** `tests/` src ağacına göre bölündü; `pytest --collect-only`: 1543 test, hata yok.
- **Yolda düzeltilen hatalar:** gölgelenen `DELETE /usetf/funds/{ticker}`, `_normalize_trfund_code` NameError, taşınan dosyalarda yanlış `parents[N]` repo kökü (`core.config.REPO_ROOT`'a bağlandı).
- **Dikkat:** S6'da `list_query/` ve `reporting/` içindeki commit edilmemiş değişiklikler kayboldu; import'lar yeniden üretildi, elle yapılmış başka değişiklik varsa yeniden yapılmalı.

### 6.2 PY2b — sembol verisi

- **T1:** `modules/symbols/model.py` + `repository.py` (unique `(marketId, assetType, ticker)`, `sortOrder`); `Markets.tickerNormalize`.
- **T2:** `scripts/migrations/2026_py2b_import_symbols.py`: 6 CSV → `symbols` (US 1.401, US ETF 900, TR 198, UK 102, JP 230, TR fon 2.502; idempotent). Yerelde çalıştı, sayılar eşleşti.
- **T3:** 5 market kopyası `symbols/service.py`'ye indi (`StockMarketSymbols`, tek `normalize_ticker(value, suffix, rule)`).
- **T4:** CSV okuyan her yer `symbols` bellek görüntüsünden okuyor (`symbol_rows` / `symbol_tickers`, anahtarlar `US`, `USETF`, `TR`, `UK`, `JP`, `TRFUND`). Okuyucuların 32 çıktısı önce/sonra karşılaştırıldı, export çıktısı bayt bayt aynı.
- **T5:** market başına job'lar birleşti: `refresh_today(market)`, `backfill_symbols(market)`; job adları ve loglar aynı.
- **T6 (BE):** `GET /api/v1/admin/symbols` (`market`, `assetType`, `q`, `skip`, `limit`); 24 eski uç `symbols` servisini kullanıyor.
- **T7 (kısmi):** CSV okuyan ölü kod silindi; CSV dosyaları duruyor.

## 7. Açık işler

### 7.1 PY2 kalanları (StockExchange)

1. **import-linter:** 25 sözleşmeden 16'sı kırık (`core.auth` → `modules.users`, `engine` → `modules.analysis.model`, `integrations` → `modules`, `modules.ops` → `worker.runtime`, modüller → `api.deps` …). Düzelince Jenkins `Test` aşamasına `lint-imports` eklenir.
2. **Router'lar `ops.admin_router`'ın özel yardımcılarını kullanıyor** (`_append_admin_job_jsonl`, `_require_quote_service`, `_ADMIN_SUPPORTED_MARKET_CODES`; `symbols`, `daily_report_watchlist`, `universe`, `analysis`). `ops/service` ya da `core/`'a inmeli. `ops/admin_router.py`'deki `_TR_STOCK_*` vb. sabitler muhtemelen ölü.
3. **Ruff borcu:** birleştirilmiş servislerde E402 / F811, kullanılmayan import'lar, eski `python -m jobs.…` docstring'leri. TC001 / TC003 bilerek kalır (FastAPI çalışma anında okuyor).
4. **Eski yollar:** README, `py2-rules.md`, `.cursor/rules` güncellenmeli.
5. **Doğrulama yapılmadı:** Docker'da `api` / `jobs` ayağa kaldırılmadı (S4'ten beri); route listesi ve `worker/main.py` cron'ları S0 ile karşılaştırılmadı; pytest çalıştırılmadı (yalnızca `--collect-only`); Jenkins `Test` aşaması hiç koşmadı.
6. **`scripts/py2_codemod.py` git'e eklenmeli** (izlenmiyordu, bir kez boşalıp yeniden yazıldı).
7. **Commit:** StockExchange'te hiçbir şey commit edilmedi.

### 7.2 PY2b kalanları (StockExchange)

1. **VPS migration'ları:** S8, sonra T2, `--apply` ile; deploy'dan önce (kod yeni collection adlarını okuyor).
2. **T7:** VPS'te T2 çalıştıktan sonra CSV'ler (makrolar hariç) silinir; `ops/docker-compose*.yml` `../data/raw` mount'u gözden geçirilir.
3. **T6 FE:** `/symbols` sayfası + sidebar, admin-base entegrasyonuna bırakıldı (StockExchange `documents/admin-base-integration-plan.md`, sondaki `/symbols` eki).
4. **`CLM`:** hem US hisse hem US ETF listesinde; iki listeden ve `symbols`'tan kaldırılacak.
5. **Canlı karşılaştırma:** public liste uçları (`/stocks`, `/etfs`, `/trfund`) ve nightly evreni canlı API'de önce/sonra karşılaştırılmadı; birleşen job'lar elle tetiklenmedi.
6. **ETF pin dosyası** (`us_etf_admin_pins.csv`) hâlâ dosya; `symbols`'a alınmalı ya da kaldırılmalı.
7. **Testler:** CSV fixture'larına dayanan ~14 test dosyası `symbols` görüntüsüne göre güncellenmeli; `symbols` birim testi yok.
8. **`tickerNormalize`:** market dokümanlarında set edilmedi; kurallar servis içinde sabit. `symbols` `ensure_indexes` `app_state`'e bağlı değil.

### 7.3 Generator

1. **PY1 kalanları.** Kod yazıldı ve kapılar yeşil (2026-10-23): tsc (taban 3), `build:electron`, `test-core-assets` 22/22, smoke, admin-base 40 test + build, `admin-config-check` (15 model, tsc 0), `regen-client` (tsc 2 = taban), Varlik360 regen `--planned --core-overlay` (kopyada tsc 0), `dotnet-e2e` (PY1 formats 17, D0 46, `contract-parity` hepsi PASS), `express-py1-e2e` (Express'te aynı 17 senaryo). Kalan:
   - admin-base **0.1.7** npm'e yayınlanmadı (npm'de 0.1.5).
   - Varlik360 (`src/core`) ve SharedFrame (`Common/`) asset'leri elle güncellendi; host'larda generate + smoke ve commit yapılmadı.
   - ✅ Electron'da model editörü kontrol edildi (2026-10-23, .NET fixture host kopyası, `Reminders`): sayısal enum (10, 20), `int`, sadece tarih dosyadan yükleniyor; kısıtlar ve e-posta (entity'de tutulmaz) editörden girilip kaydedilince manifest'e ve validator'lara yazılıyor, yeniden açınca geri geliyor; `Number format` C# host'ta görünüyor, dizi alanında kısıt yok.
   - Generator'da hiçbir şey commit edilmedi.
   - Kapıda görülen iki PY1 dışı sorun düzeltildi (2026-10-23): route artık router bağlayan app dosyasına (`findBackendAppFile`; Varlik360 `src/app.ts`) ekleniyor; CRUD mesajları host'ta tek `crud.*` setinde (Varlik360 `en.ts` / `tr.ts`'e eklendi, `base-crud.service.ts` güncellendi). Varlik360'ta modüller yeniden üretilince 13 `crud.ts`'ten modül mesajları kalkar; eski locale blokları sonra silinebilir.
2. Alt kod aralıkları (K9: 460–479, 560–579) [api-contract.md](../api-contract.md) §1'e "projeye özel aralıklar" olarak yazılır.
3. PY4–PY8 (§5), ardından resource döngüsü (§8), en son PY2c.

## 8. StockExchange geçişi

Hatlar:

1. **FE (bağımsız):** StockExchange `documents/admin-base-integration-plan.md`; sayfalar adapter ile `ResourcePage`'e, `/symbols` sayfası dahil.
2. **Generator:** PY1, sonra PY4–PY8.
3. **StockExchange BE:** PY3 (`SubscriptionPlans` elle) → resource döngüsü → PY2c.

| Grup | Resource'lar | Yaklaşım |
| --- | --- | --- |
| A — gerçek CRUD | SubscriptionPlans (PY3), IpBlacklist, Symbols (lookup ve toplu ekleme aksiyon), Markets ve Providers (yalnızca update), DeepDivePrompts (yalnızca update; "varsayılana sıfırla" aksiyon; `revision` / `updatedBy` `before_update`'te), Users + UserSubscriptions (en son: şifre, rol, impersonate) | Tamamen üretilir; özel kurallar hook / servis'te |
| B — pipeline'ın yazdığı veri | AuditLogs, ScheduledReports, DailyReportWatchlist, DeepDiveReports, MarketPulseItems, OhlcvDiscontinuityAlerts | Liste + sil üretilir; cascade silme `after_delete`, canlı fiyat `map_rows`, CSV export `admin_router.py` |
| C — CRUD değil | metrics, jobs, screen, evren export'u, fundamentals, ohlcv-bars, dashboard, log sayfaları | İlgili özellik modülünün `admin_router.py`'sinde elle |

Resource başına döngü (her adım ayrı commit):

1. Pydantic modeli Generator'a içe aktarılır (K1; PY7 yoksa model editöründe elle girilir); entity adı §4.1'den; admin ayarları verilir.
2. Generate: G dosyaları; ilk seferde `model.py`, `repository.py`, `hooks.py` (K). FE: `<m>.generated.config.ts`.
3. Mevcut repository `repository.generated.py` tabanının alt sınıfına döner; CRUD tabana bırakılır, özel sorgular kalır; iş kuralları `hooks.py` / `service.py`'ye.
4. API ve job testleri; parity profili (K15).
5. FE: resource adapter'dan çıkarılır, `createAtaRestProvider`'a geçer; elle yazılmış config silinir.
6. CRUD'a geçen eski admin uçları, adapter girdisi ve Redux kodu silinir.

Bağımlılıklar:

```
PY1 (Generator geneli) ───────────────────┐
                                           ▼
PY2 ✅ ──► PY3 (elle örnek) ──► PY4 ──► PY5 ──► PY6 ──► PY7 ──► PY8 ──► A grubu ──► B grubu ──► PY2c (en son)
  └──► PY2b ✅
```

PY1 ve PY3 birbirine bağlı değil, paralel yürüyebilir; PY5, PY1'in tip bilgilerini ve kısıtlarını kullanır. §7.1 / §7.2 açıkları PY3'ü engellemez; VPS migration'ları (7.2 madde 1) StockExchange'in bir sonraki deploy'undan önce yapılmalı.
