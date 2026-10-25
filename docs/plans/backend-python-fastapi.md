# Plan: Python + FastAPI backend

Durum (2026-10-23): kararlar kapandı. StockExchange tarafında **PY2 ve PY2b yapı olarak bitti**; Generator'a geçmeye engel yok, açık işler §7'de. Generator'da **PY1** kodu ve kapıları bitti, kalanlar §7.3. **PY3** (elle yazılmış `SubscriptionPlans` örneği) bitti, Python ile .NET arasında `contract-parity` 47 / 47 PASS. **PY4** (asset'ler + iskelet + bootstrap) bitti (§6.4). **PY5** (şablonlar) bitti (§6.5): StockExchange'te `subscription_plans`'ın G dosyaları Generator çıktısı. **PY6** (reference, decimal, map / json, access) kod ve kapılarıyla bitti (§6.6); update'te `null` kuralı karara bağlandı ve üç stack + admin-base 0.1.8'de uygulandı (JSON Merge Patch, api-contract §5; §7.3 madde 10). **PY7** (Pydantic içe aktarma, tarama, IPC, arayüz, fazladan alan raporu) kod ve kapısıyla bitti (§6.7; 2026-10-24); Electron'da denenmedi, StockExchange'te gerçek içe aktarma yapılmadı (veri ve K dosyası hazırlığı §7.3 madde 11). **PY8** (giriş kapısı `python-e2e`, stack dokümanı, kural dosyası, modül test şablonu, komut satırı kurulumu) bitti (§6.8; 2026-10-24). StockExchange'te hiçbir şey commit edilmedi (çalışma `main`'de, yedek dal `backup` = `937793a`).

**Tek kaynak bu dokümandır.** StockExchange `documents/py2-restructure-plan.md` adım adım ölçüm ve ayrıntı kaydı olarak kalır; plan ve açık işler buradan izlenir. Kod kuralları: StockExchange `documents/py2-rules.md`. Model alınan plan: [.NET planı](backend-dotnet-efcore.md). Aynı yol izlenir: önce elle yazılmış örnek, sonra şablon.

## 1. Hedef

- Aynı girdi (NormalizedModel v2 + manifest v3), aynı HTTP davranışı ([api-contract.md](../api-contract.md)). `@atakanimo/ata-admin-base` arkadaki stack'i bilmez.
- **Bütün backend'lerde yapılan işlemler ortaktır.** Üç stack'te aynı kavramlar ve adlar: CRUD servis tabanı, hook seti, liste gövdesi, filtreler, sayfalama, hata zarfı, `traceId` (§3). Bir stack'e eklenen ortak davranış diğerlerine de eklenir.
- Python 3.12+, FastAPI, Pydantic v2, MongoDB (async sürücü, K5). Veritabanı yalnız MongoDB (K22).
- **Kapsam: yalnızca admin API.** Normal (web / mobil) API, ownership ve `normalOperations` admin geçişi bitince ayrı plan.

## 2. Hedef Python yapısı

Modüler monolit. API ve job'lar aynı uygulamanın iki giriş noktasıdır, aynı modülleri (servis + repository) kullanır.

Modül klasörü **entity başına**dır (`modules/<entity_snake>/`, collection adıyla aynı), Generator'ın diğer stack'leriyle aynı kural. Entity'ye bağlı olmayan elle yazılmış işler **özellik modüllerinde** durur; onlarda G dosyası olmaz (K19). Çok dosyalı özellik modüllerinde aynı adlar paket olur (`model/`, `repository/`, `service/`, `router/`, `jobs/`).

```
pyproject.toml              tek, kurulabilir paket (uv + uv.lock)
src/<app>/                  StockExchange: alpha_terminal
  core/                     altyapı: config, db, loglama, i18n, hata kodları, yanıt zarfı, auth
    crud/                   asset: ListBody, filtreler, sıralama, sayfalama, CrudRepository, CrudService, ServiceHooks, to_wire, mesajlar
    http/contract.py        asset: sözleşme zarfı + ContractRoute (yalnız admin-crud router'ları)
    errors/                 asset: common_codes (sözleşme kodları), AppError (K18); projeye özel kodlar codes.py'de
  integrations/             dış servisler (veri sağlayıcılar, LLM, e-posta)
  engine/                   saf hesaplama, IO yok
  modules/<entity_snake>/
    model_generated.py          (G) Pydantic doküman modeli, StrEnum'lar, alt objeler
    model.py                    (K) re-export + elle eklenenler
    repository_generated.py     (G) collection adı + index'ler (CrudRepository alt sınıfı)
    repository.py               (K) entity'ye özel sorgular (generated tabanın alt sınıfı)
    schemas_generated.py        (G) Row / Create / Update / Filters / ListBody
    service_generated.py        (G) CrudService'i bu modüle bağlar (filtre / sıralama / unique alanlar, map_create) + hook tabanı
    hooks.py                    (K) hook tabanının alt sınıfı (§3)
    service.py                  (K) servis sınıfı + kurucu; iş kuralları; API ve job'lar bunu çağırır
    admin_router_generated.py   (G) admin CRUD uçları (`route_class=ContractRoute`)
    admin_router.py             (K) CRUD dışı admin uçları
    router.py                   (K) public API
    jobs.py                     (K) bu modülün job'ları
  modules/<özellik>/            elle yazılır, G dosyası yok
  api/
    main.py                     (K) create_app(): middleware + router'lar
    routers_generated.py        (G) modüllerin admin CRUD router listesi (ADMIN_CRUD_ROUTERS)
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
| Bağımlılık | DI (`DependencyInjection(.Generated).cs`) | modül import'u | FastAPI `Depends` + `api/routers_generated.py` |

Katman karşılıkları aynıdır; .NET'te katman önce, Python'da modül (entity) önce gruplanır. .NET'te katman kuralını derleyici, Python'da `import-linter` korur.

| .NET katmanı | Python (`modules/<entity_snake>/`) |
| --- | --- |
| Domain (`<Entity>.cs` G + `.Custom.cs` K) | `model_generated.py` + `model.py` |
| Infrastructure (persistence) | `repository_generated.py` + `repository.py` |
| Application (servis, DTO, hook) | `schemas_generated.py`, `service_generated.py`, `hooks.py`, `service.py` |
| Api (endpoint) | `admin_router_generated.py` + `admin_router.py` |

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
| K1 | Model kaynağı | Generator manifest'i. Python parser'ı yalnızca **bir kez içe aktarmak** için: mevcut Pydantic sınıfı manifest'e okunur, sınıf `model_generated.py`'ye geçer, sonra düzenleme Generator'da. Enum `StrEnum` yazılır; içe aktarmada `Literal[...]` da okunur |
| K2 | Kimlik | Her zaman `id` = Mongo `_id` (ObjectId hex). Doğal anahtarlar (`marketCode`, `code`, `ip`) sıradan unique alan |
| K3 | Zarf ve sayfalama | Sözleşme zarfı. Tek sayfalama yapısı: `data` içinde `PaginatedList { items, total, hasMore, currentPage, currentLimit }`; `meta` kullanılmaz. StockExchange'in `meta` dolduran 5 public ucu ve web'in parse katmanı web fazında döner |
| K4 | `traceId` | Sözleşmeye opsiyonel `traceId`; üç stack'te middleware doldurur; admin-base `ApiResponse.traceId?` |
| K5 | Mongo sürücüsü | Hedef PyMongo Async (Motor deprecated). **Geçiş en son adım (PY2c):** testlerin sahte DB'si `mongomock-motor` PyMongo Async ile çalışmaz, geçiş gerçek Mongo'lu test altyapısıyla birlikte yapılır. O zamana kadar kod ve asset'ler yalnızca `core/db.py`'deki `Database` takma adına ve iki sürücüde ortak API'ye (`find`, `to_list(length=…)`, `insert_one` …) göre yazılır; `motor` yalnız `core/db.py`'de |
| K6 | Admin route | Geçişte üretilen uçlar `/api/v1/admin-crud/<resource>`; eski uçlar FE geçene kadar `/api/v1/admin/<resource>`. Eski uçlar silinince üretilenler `/api/v1/admin/<resource>`'a taşınır, `admin-crud` kalkar |
| K7 | Dosya sahipliği | .NET ile aynı. G dosyaları `*_generated.py` (Python modül adında nokta olamaz; `model.generated.py` import edilemez), başlıkla başlar (`# <auto-generated by Generator />`), her generate'te yeniden yazılır. Başlıksız dosya kullanıcınındır, atlanır ve notta listelenir. K dosyaları ve asset'ler yalnızca yoksa yazılır |
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
| K22 | Veritabanı kapsamı (kilit) | Python yalnız MongoDB (`workspace.database: 'mongodb'`, `idType: 'objectid'`; manifest alanları PY10 / DB1'de gelir). SQLAlchemy Mongo desteklemez; SQL desteği `core/crud/repository.py` arkasında ikinci bir repository uygulaması (filtre, populate, silme kontrolü, migration) ister, ayrı plan olur ve PY2c'den önce başlamaz. Express de yalnız MongoDB (Mongoose). Seçilebilir veritabanı yalnız .NET'te (PY10) |

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
| PY3 | **Elle yazılmış örnek** (StockExchange, `SubscriptionPlans`): `core/crud` (`CrudService`, `ServiceHooks`, `ListBody`, filtreler, sayfalama, `toWire`) + `modules/subscription_plans/` G/K dosyalarının elle yazılmış hali, `/api/v1/admin-crud/subscription-plans` | `contract-parity` geçer; plan iş mantığı (varsayılan planlar, `code` eşlemesi) hook / servis'te korunur | ✅ 2026-10-23, §6.3 |
| PY4 | Asset'ler + iskelet: PY3'teki `core/crud`, `core/http/contract.py`, `core/errors/{app_error,common_codes}.py` → `generator-assets/python-fastapi`; `_skeleton`; manifest `workspace.backendStack: 'python-fastapi'` | Boş host'ta asset'ler kurulur, uygulama ayağa kalkar | ✅ 2026-10-23, §6.4 |
| PY5 | Şablonlar — basit alanlar: model, repository, schemas, service, admin_router (G) + hooks / service / repository / model (K) | Üretilmiş `SubscriptionPlans` PY3'ün testlerini geçer; PY3 dosyaları üretilmişleriyle değişir | ✅ 2026-10-23, §6.5 |
| PY6 | `reference`, `decimal`, `object` / `object[]`, `map`, `json`, `access` (readonly, hidden, adminOnly); alt alanda `reference` ve iç içe obje. **Ek (PY5'ten):** update'te opsiyonel alanı boşaltma kuralı. Bugün Python ve .NET'te `null` = değişmez; Express'in davranışı golden set parity'sinde ölçülür, üç stack için tek kural seçilir (kullanıcı kararı), sözleşmeye (api-contract §5) yazılır | Golden set (Express / .NET ile aynı modeller); parity; `null` kuralı üç stack'te aynı | ✅ 2026-10-23: alan türleri + golden set + parity bitti (§6.6); `null` kuralı (B, JSON Merge Patch) üç stack + admin-base'de uygulandı (§7.3 madde 10) |
| PY7 | Python parser (K1) + tespit + IPC + arayüz. **Ek (PY5'ten):** doküman ve alt obje sınıfları `extra="forbid"`; içe aktarılan eski collection'da modelde olmayan alan varsa satır okuma 500 verir. İçe aktarma, örnek dokümanlarda modelde olmayan alanları raporlar (alan olarak ekle ya da migration ile temizle) | StockExchange'in bir modeli arayüzden içe aktarılır, generate edilir; fazladan alan raporu | ✅ 2026-10-24 (§6.7): `IpBlacklist` uygulamanın içe aktarma yolundan StockExchange kopyasına üretildi, rapor gerçek veride çalıştı; Electron'da denenmedi (§7.3 madde 11) |
| PY8 | `python-e2e.mjs` (`regen-python.mjs` PY5'te geldi), `docs/backend/python-fastapi.md` (§7.3 madde 6–9'dan), `.cursor/rules/backend-python-fastapi.mdc`. **Ek (PY5'ten):** modül test şablonu (K, ilk sefer: `tests/modules/<m>/test_admin_crud.py`; bugün `regen-python` kendi fixture testlerini kopyalıyor) | Yeni bir Python projesi dokümanla kurulabilir; üretilen modülün testi kendiliğinden gelir | ✅ 2026-10-24 (§6.8): dokümandaki adımlarla boş klasörde host kuruldu, iki model üretildi, modül testleri kendi başına geçti; Electron'da denenmedi (§7.3 madde 12) |
| PY9 | **Yeni proje düğmeleri + bilgi ipucu** (Project Location kartı, `ProjectSelectPage.tsx`): mevcut "Yeni .NET projesi"nin yanına "Yeni Express projesi" ve "Yeni Python projesi". Express'in iskeleti yok: `generator-assets/express-mongoose/_skeleton` (`package.json`, `tsconfig`, `src/app.ts`, `src/index.ts`, config, i18n) + `project:bootstrapExpress` (iskelet + `ensureCoreBootstrapFiles`). Python: PY4 iskeleti + `project:bootstrapPython`. Üç düğmenin yanında bilgi ikonu; tıklanınca popover: klasör ağacı (G / K / asset ayrımıyla), teknolojiler (dil ve sürüm, framework, veritabanı, ORM / sürücü, doğrulama, test, paket yöneticisi), kurulumdan sonra çalıştırma komutları, ilgili `docs/backend/<stack>.md`. İçerik stack başına tek tanımda tutulur, dokümanla aynı. **Ek (PY5'ten):** Electron'da Python akışı uçtan uca: yeni proje → model ekle / düzenle (alt alan `numberFormat` dahil) → generate; bugün yol IPC'de bağlı, arayüzde denenmedi | Boş klasörde üç düğme de host kurar, ilk generate + smoke geçer; ipucu üç stack için doğru; Python akışı Electron'da denenmiş | ✅ kod + kapılar (2026-10-24, headless): `express-bootstrap.mjs` 44 PASS (iskelet, ilk model, Docker smoke, üç stack'in ipucu ağacı / sürümleri), `python-e2e.mjs --no-parity` 64 / 22 / 94 PASS. Electron'da yalnız düğme + popover'ın görsel denemesi kalmadı sayıldı: aynı IPC fonksiyonları `scripts/python-host.mjs` ile koşuyor (`list` / `preview` / `import` / `show` eklendi; StockExchange ekranları bununla tek tek üretilecek) |
| PY10 | **.NET'te seçilebilir veritabanı ve id tipi:** manifest `workspace.database` (`postgres` \| `sqlserver` \| `mongodb`) ve `workspace.idType` (`uuid-v7` \| `objectid`), "Yeni .NET projesi" penceresinde seçilir. EF Core korunur, sağlayıcı (`DotnetDbProvider`) ve asset üst katmanı değişir. Express ve Python yalnız `mongodb` (K22). Ayrıntı: [backend-dotnet-database-providers.md](backend-dotnet-database-providers.md) | Aynı model üç veritabanında da üretilir, .NET kapıları ve Mongo `contract-parity` geçer | 🟡 DB0–DB4 ve DB6 bitti (2026-10-24): PostgreSQL, SQL Server, MongoDB (uuid v7 / ObjectId) sağlayıcıları; üçü de `regen-dotnet` + `dotnet-e2e` geçiyor. Kalan: DB5'in Electron'da elle denenmesi. İkinci kod incelemesi (2026-10-25, [DbTests.md](DbTests.md) R9–R16) düzeltildi; kapılar o turda koşulmadı |
| PY11 | **StockExchange ayarları `config.env` → `.env`** (iskeletle aynı kural: `.env` git dışı, `.env.example` repoda): `core/config.py` `env_file` `.env`; `config.env` okuyan dosyalar `settings` üzerinden okur, dosya yolu bilmez; `Dockerfile` `COPY config.env` kalkar, compose `env_file: ../.env`, `docker-compose.dev.yml` mount'u kalkar, Jenkins `config.env` → `.env`, README / `ops/README.md` / `apps/web` notları, `.gitignore` | Uygulama ve job'lar yalnız `.env` + ortam değişkenleriyle açılır; imajda sır yok; VPS deploy'u `.env` ile geçer | ✅ 2026-10-25, §6.11 |
| PY12 | **Genel CSV export (admin, üç stack + admin-base):** model ayarı `api.adminOperations`'a `export` (Generator'da admin işlem kutularında "Export"). Seçiliyse üretilen admin router'a `POST {endpoint}/export` eklenir: gövde liste isteğiyle aynı (`filters`, `sortBy`, `sortOrder`) + `fields: string[]` (dışa aktarılacak kolonlar); cevap `text/csv` (UTF-8 BOM, başlık satırı alan etiketleri, `Content-Disposition` dosya adı `<resource>-<tarih>.csv`). Kurallar tek yerde (sözleşme §2'ye yeni satır): yalnız tabloda görünebilen alanlar (`hidden` / `writeOnly` hiç, `detailOnly` yalnız seçilirse), ilişki `display` değeri, enum etiketi, tarih ISO UTC, obje / dizi / JSON tek hücrede JSON, satır sınırı (ör. 50.000, aşılırsa 400 ve mesaj). admin-base: `operations` `export` içeriyorsa toolbar'da "Dışa aktar" → açılan pencerede tablo kolonları işaretli liste (varsayılan: tabloda görünenler), mevcut filtre ve sıralamayla indirir (blob, host interceptor'ı toast göstermez). Python / Express / .NET şablonları + modül testi + `contract-parity` senaryosu. **Sonra elle yazılmış export'lar silinir:** StockExchange `GET /admin/daily-report-watchlist/export` (`core/export/daily_report_watchlist.py`, admin `exportDailyReportWatchlist`, `lib/adminExport.ts`) ve `GET /admin/universe/export` (admin `exportUniverseCsv`, `UniverseCsvDownloadButtons`; evren CSV'sinin `Ticker,Name,Indices` biçimi başka bir yerde içe aktarılıyorsa önce o kontrol edilir) | Her admin ekranında export seçiliyse pencereden kolon seçip filtreli CSV iner; üç stack aynı CSV'yi verir; eski export uçları ve FE kodu yok | ⬜ (kullanıcı kararı 2026-10-25; AlphaFeTests AF12'nin CSV kısmı buraya taşındı) |
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

### 6.3 PY3 — elle yazılmış örnek (2026-10-23)

Referans: .NET `Application/Common` + `Api/Common`, Express `@core`; davranış .NET'in `python-parity` host'u ile aynı (parity 47 / 47 PASS).

- **Ortak katman (PY4'te asset):**
  - `core/crud/`: `ListBody` (strict, `page ≥ 1`), `filters.py` (id, reference, regex, eq, boolean, range, date-range, enum), `sort.py` (beyaz liste, `_id` ile kararlı), `pagination.py` (`limit` 50 / en çok 100), `wire.py` (`_id` → `id`, `UtcDateTime` `….fffZ`), `ids.py` (bozuk id yolda 404, gövde / filtrede 400), `hooks.py`, `repository.py` (`CrudRepository`), `service.py` (`CrudService`; sıra .NET ile aynı, yarışta unique ihlali 409), `messages.py` (tr / en).
  - `core/http/contract.py`: sözleşme zarfı (`meta` / `timestamp` yok) ve `ContractRoute`: istek dili (`lang` / `x-lang` / `accept-language`) ve `traceId` bağlamda; `AppError`, doğrulama (400), auth `HTTPException`'ı (401 / 403) ve beklenmeyen hata (500) zarfa çevrilir. Yalnız admin-crud router'ları kullanır; global handler'lar ve eski uçlar değişmedi.
  - `core/errors/app_error.py` (`AppError`), `common_codes.py` (sözleşme kodları); projeye özel kodlar `codes.py`'de kaldı.
- **Modül (`modules/subscription_plans/`):** G: `model_generated.py` (`SubscriptionPlansTier` StrEnum, alt objeler), `schemas_generated.py`, `repository_generated.py`, `service_generated.py` (filtre / sıralama / unique alanlar, `map_create` varsayılanları .NET `MapCreate` ile aynı), `admin_router_generated.py`; `api/routers_generated.py` (`ADMIN_CRUD_ROUTERS`, `api/main.py` bağlar). K: `model.py` (re-export, `PlanTier` = StrEnum), `repository.py` (eski sorgular; string `_id` dalları silindi; `upsert` artık `createdAt`'i `null`'la ezmiyor), `hooks.py` (varsayılan plan ve aktif aboneliği olan plan silinemez, 422), `service.py` (servis kurucusu, varsayılan plan kataloğu, `ensure_plan_catalog`). Eski `/api/v1/admin/plans` uçları duruyor (K6).
- **`code` eşlemesi:** yalnız eski string `_id`'li dokümanlar içindi (`_id: "free"` → `code`). Yerel veride bütün planların `_id`'si ObjectId; dal silindi, hook'a taşınacak kural kalmadı.
- **Veri:** yerelde 3 planın `createdAt`'i `null` (eski `upsert` hatası). Migration `scripts/migrations/2026_py3_plan_timestamps.py` (`createdAt` = ObjectId zamanı, idempotent, `--apply`); kuru çalıştırma 3 doküman gösterdi, **uygulanmadı**.
- **Testler:** `tests/core/crud/test_crud.py` (11), `tests/modules/subscription_plans/test_admin_crud.py` (4: zarf, auth, CRUD, doğrulama, 409, silme kuralları, dil, `traceId`).
- **Parity:** Generator `scripts/verify/fixtures/python/subscription-plans.models.json` → `regen-dotnet` `python-parity/` host'u; `contract-parity.mjs --suite subscription-plans` (Python ve .NET); `dotnet-e2e.mjs --python-only` StockExchange'i `.venv` python'uyla `alpha_parity`'ye açar (`scripts/parity_seed_users.py`). `ops/docker-compose.yml`'e `parity` profili (`api-parity`, :8766) eklendi; imaj burada build edilmedi.
- **Test ortamı düzeltmeleri:** `tests/conftest.py` lifespan'ı her testte mongomock'a bağlar (autouse) ve varsayılan `MONGO_URI` erişilemeyen porta gider; testler yerel Docker Mongo'ya hiç bağlanmaz. `api/main.py` lifespan'ında `load_symbol_snapshot` hatası diğer adımlar gibi loglanıp geçilir (60 sn'lik yenileme döngüsü toparlar).

### 6.4 PY4 — asset'ler + iskelet (2026-10-23)

Generator tarafı; StockExchange'te yalnız ortak dosyalar asset'le hizalandı.

- **Asset'ler** (`src/generator-assets/python-fastapi/core/`, host'ta `src/<pkg>/core/`; 18 dosya): `crud/` (11), `http/contract.py`, `http/middleware/trace.py`, `errors/app_error.py`, `errors/common_codes.py` ve boş `http/__init__.py`, `http/middleware/__init__.py`, `errors/__init__.py`. Yalnız yoksa yazılır, bayt bayt kopyalanır (token yok).
- **Karar — göreli import:** asset içi import'lar göreli (`from .filters import …`, `from ..errors.app_error import …`, `from ..db import Database`). Gerekçe: dosya paket adından bağımsız kalır, aynı bayt her host'ta (StockExchange dahil) çalışır; kopyalarken metin değiştirilmez, bayt karşılaştırması mümkün olur. Host kodu (modüller, testler, K dosyaları) asset'leri mutlak yolla import etmeye devam eder (`alpha_terminal.core.crud`). Göreli import yalnız asset'lerde; projeye özel dosyalarda mutlak import kuralı değişmez.
- **Karar — `core/db.py` K dosyası (iskelet):** bağlantı ömrü, ayarlar ve 503 davranışı projeye özel (StockExchange'inki kendi loglama / hata yardımcılarını kullanıyor); asset'ler yalnız `Database` takma adına bağlı (`crud/repository.py`, `TYPE_CHECKING` altında). K5'e uygun: sürücü yalnız bu dosyada, PY2c'de Motor → PyMongo Async yalnız `db.py`'yi (ve iskeletin bağımlılıklarını) değiştirir.
- **Karar — sürücü:** iskelet bugün **Motor** (`motor` + `pymongo`), test sahte DB'si `mongomock-motor`; StockExchange ile aynı. PyMongo Async'e geçiş PY2c'de iki yerde birlikte.
- **`trace.py`:** host ayarına (`settings.TRACE_ID_HEADER`) bağlılık kalktı; başlık adları modül sabiti (`TRACE_ID_HEADER = "X-Request-Id"`, `LEGACY_TRACE_ID_HEADER = "X-Trace-Id"`), CORS `expose_headers` bu sabitleri kullanır (StockExchange `api/main.py` güncellendi; `config.py`'deki iki ayar artık okunmuyor). `structlog` contextvars bağlaması korundu, iskeletin bağımlılığı.
- **İskelet** (`_skeleton/`, token `__app__` = paket, `__app_dist__` = dağıtım adı; 20 dosya): `pyproject.toml` (uv, hatchling, Python ≥ 3.12, FastAPI, Pydantic v2, pydantic-settings, Motor, PyJWT, structlog, APScheduler; dev: pytest, pytest-asyncio, httpx, mongomock-motor, ruff, import-linter; ruff ve katman sözleşmesi StockExchange'inkiyle aynı kurallar, TC001–TC003 FastAPI için kapalı), `.python-version` (3.12), `.env.example`, `.gitignore`; K: `core/config.py` (`Settings`, `require_jwt_secret`: en az 32 karakter, yoksa API açılmaz), `core/db.py`, `api/main.py` (`create_app()`: CORS + `TraceIdMiddleware`, `GET /api/v1/health` sözleşme zarfıyla `{status, environment, mongoConnected}`, `ADMIN_CRUD_ROUTERS` bağlanır; Mongo kapalıysa uygulama açılır, `get_db` 503), `api/deps.py` (JWT HS256, `sub` + `role` string ya da liste, issuer / audience ayarlıysa denetlenir, `exp` zorunlu; `UserDep`, `AdminDep` (`ADMIN_ROLE`, varsayılan `admin`), `DbDep`; 401 / 403 `ContractRoute`'ta zarfa döner), `worker/main.py` + `__main__.py` (APScheduler, boş `register_jobs`), `modules/__init__.py`; testler: `conftest.py` (mongomock, in-process istemci, `make_token`), `test_health.py`, `api/test_deps.py`, `worker/test_worker.py`, `core/crud/test_crud.py` (StockExchange'inkiyle aynı, token hariç).
- **G:** `api/routers_generated.py` TS'ten üretilir (`renderRoutersRegistry`); `subscription_plans` ile StockExchange'teki dosyanın aynısı çıkar.
- **Generator kodu:** `src/main/generators/python-fastapi/` (`pythonLayout.ts`: paket adı `toPythonPackageName` → snake_case, `PYTHON_GENERATED_HEADER`; `pythonFiles.ts`: iskelet / asset kopyası, G yazımı; `PythonHostBootstrap.ts`: `ensurePythonHost`, `bootstrapPythonHost`, `writePythonRegistries`), `src/main/ipc/pythonBackend.ts` (`bootstrapPythonProject`: `pyproject.toml` varsa reddeder, manifest'e `backendStack: 'python-fastapi'`), IPC `project:bootstrapPython` + preload + `ipcTypes`. Arayüz düğmesi yok (PY9). `projectScanner` manifest'teki `python-fastapi`'yi bugün yok sayar (model taraması PY7).
- **StockExchange:** 15 ortak dosya asset'le aynı (göreli import, `trace.py` sabitleri, ruff import sırası), `api/main.py` `expose_headers`. `pytest tests/core tests/modules/subscription_plans tests/test_health.py` 105 passed (öncesi de 105), iki giriş noktası import ediliyor, ruff bu dosyalarda temiz, `lint-imports` 9 kept / 16 broken (değişmedi), `dotnet-e2e --python-only` parity PASS.
- **Kapı:** `scripts/verify/python-bootstrap.mjs` ([verification.md](../verification.md)).

### 6.5 PY5 — şablonlar (2026-10-23)

Generator tarafı; StockExchange'te yalnız `subscription_plans`'ın G dosyaları yeniden üretildi ve `.generator/manifest.json` eklendi.

- **Kod:** `src/main/generators/python-fastapi/pythonContext.ts` (bütün kararlar; .NET `dotnetContext.ts` ile aynı filtre / sıralama / unique / varsayılan kuralları), `pythonFormat.ts` (ruff isort sırası, `ruff format` satır bölme: import, sınıf tabanı, imza, çağrı, alias; satır 110), `PythonFastapiGenerator.ts` (`generatePythonModules(root, pkg, models)`), şablonlar `src/main/templates/backend-python-fastapi/module/*.py.hbs`. G (`writePythonGenerated`): `model_generated.py`, `schemas_generated.py` (Row / Create / Update / Filters / ListBody), `repository_generated.py` (collection, unique index'ler), `service_generated.py` (hook tabanı, filtre / sıralama / unique alanlar, `map_create` varsayılanları, gerekirse `map_update` dönüşümleri), `admin_router_generated.py` (`api.admin === false` ise yok); `api/routers_generated.py`. K (`writeOnce`, ilk sefer): `__init__.py`, `model.py` (re-export), `repository.py`, `hooks.py` (`__init__(db)`), `service.py` (`build_<m>_service`). `admin_router.py` üretilmez (CRUD dışı uçlar elle).
- **Adlar (K21):** entity verildiği gibi (çoğul PascalCase), klasör = collection `snake_case`, route `/admin-crud/<kebab>` (K6), router fonksiyonları `list_<klasör>` / `get_<tekil>`…, enum sınıfı `<Entity><Alan>` (dizi alanında tekil), üye adı değerin BÜYÜK_SNAKE'i (`on-hold` → `ON_HOLD`).
- **Alanlar:** string, number (`int` / `float`), boolean, date (`datetime` → satırda `UtcDateTime`; `dateFormat: date` → `date`, Mongo'da UTC gece yarısı `datetime` olarak saklanır, filtre / sıralama tarih üzerinden), enum (`StrEnum`, sayısal `IntEnum`; saklarken `str()` / `int()`), diziler (enum dizisi dahil), **tipli alt alanlı `object` ve `object[]`** (alt alanlar string / number / boolean / date / enum-metni). `required` + `nullable` → zorunlu yalnız `required && !nullable` (.NET ile aynı); create'te varsayılanı olan ya da opsiyonel alan `null` kabul eder, varsayılanı `map_create` yazar. Kısıtlar (K14) gövdede `StringConstraints` / `Field(ge, le)` alias'ı (`_Code`), doküman modelinde `Field(...)`; zorunlu metin `min_length=1` (.NET `NotEmpty`), `trim` → `strip_whitespace`. `format: email` → `pattern`; e-posta + özel desen birlikteyse desen `StringConstraints`'te, e-posta üretilen `_email` doğrulayıcısında.
- **Unique:** index `uniq_<alan>`, `unique_fields`. Opsiyonel unique alan boşsa dokümana hiç yazılmaz, index `sparse` (aksi hâlde ikinci boş kayıt 409 olurdu; Postgres'teki .NET'te çoklu `NULL` serbest).
- **Karar — alt alan `numberFormat`:** NormalizedModel alt alanına `numberFormat?: 'int'` eklendi (`canonicalSubField` sırası, editör `normalizeEditedField` yalnız `number` + `int`'te tutar, .NET parser `int` / `long` alt özelliği okur, .NET üreticisi `int` yazar, admin config alt alana `numberFormat: 'int'` koyar). Gerekçe: PY3'ün `PlanLimits` / `PlanRateLimit` `int` alanları modelden üretilebilsin ve .NET tarafı aynı tipi taşısın. Fixture `subscription-plans.models.json` bu alanları `int` işaretliyor; `python-parity` host'u artık `int` / `int?` (parity 47 / 47 değişmedi). Editörde alt alan için format seçimi yok (değer korunur, arayüz PY9 / ayrı iş).
- **Karar — dosya biçimi:** G dosyaları `ruff check` ve `ruff format` temiz (kapı `ruff format --check`). PY3 dosyaları elle yazıldığı için ikisi format dışıydı; generator onların `ruff format` hâlini üretir.
- **Karar — generate iskelet yazmaz:** generate yalnız core asset'leri (yoksa) kurar; iskelet bootstrap'ın işi. Var olan host'a (StockExchange) yeni iskelet dosyası düşmez.
- **Generate akışı:** model kaynağı manifest (K1): satırın `sourceRelativePath`'i modülün `model_generated.py`'si. `pythonBackend.ts`: `findPythonHost` (`pyproject.toml` + tek `src/<pkg>/` (`core/` ile)), `generatePythonBackend` (manifest'teki bütün modüller + yeni / değişen model), `writePythonModel` (editör create / update: manifest satırı + generate), `loadPythonModelDraft`. IPC `project:generateBackend`, `createModel`, `updateModel`, `loadModelDraft` manifest `backendStack: 'python-fastapi'` (ya da `sourceType`) ise bunlara gider; yeni düğme yok. `projectScanner` Python'u PY7'ye kadar yok sayar.
- **PY3 ile farklar (StockExchange'teki elle yazılmış G dosyaları):** `model_generated.py`, `schemas_generated.py`, `repository_generated.py`, `api/routers_generated.py` bayt bayt aynı. `service_generated.py`: iki sınıf tabanındaki tip parametreleri ayrı satırda (`ServiceHooks[` / `CrudService[`, satır 110'u geçiyordu). `admin_router_generated.py`: `get_subscription_plan` imzası üç satıra bölündü (117 karakterdi). İkisi de yalnız `ruff format`; davranış farkı yok. K dosyalarına (`model.py`, `repository.py`, `hooks.py`, `service.py`, `admin_router.py`) dokunulmadı.
- **StockExchange:** `.generator/manifest.json` (fixture'daki `SubscriptionPlans`, `backendStack: python-fastapi`); generate 2 G dosyasını güncelledi, ikinci generate boş. `pytest tests/core tests/modules/subscription_plans tests/test_health.py` 105 passed, iki giriş noktası import ediliyor, `ruff check` bu dosyalarda yalnız bilinçli TC001 (`admin_router*.py`'de `api.deps`), `ruff format --check` temiz, `lint-imports` 9 kept / 16 broken (değişmedi), `dotnet-e2e --python-only` parity PASS.
- **Kapı:** `scripts/verify/regen-python.mjs` ([verification.md](../verification.md)); fixture'lar `fixtures/python/py5-kinds.models.json` (`Contacts`), `fixtures/python/tests/`.

### 6.6 PY6 — reference, decimal, JSON alanları, access (2026-10-23)

Generator tarafı; StockExchange'te yalnız asset kopyaları güncellendi (bayt bayt aynı), `subscription_plans` çıktısı değişmedi.

- **Asset'ler (`core/crud/`):** `ids.py` `RefId` (JSON'da id string'i, Python'da ve Mongo'da `ObjectId`, bozuksa 400); yeni `decimals.py` (`DecimalStr`: girişte yalnız string, `^[+-]?\d+(\.\d+)?$`, sayı 400; çıkışta üstelsiz string), yeni `relations.py` (`RelationField`, `PopulateField`, `check_relations`, `populate_docs`); `wire.py` `to_wire` `Decimal128` → `Decimal`, yeni `to_storage` (`Decimal` → `Decimal128`, alt objelerde de); `filters.py` `DecimalRangeFilter` / `DecimalRangeValue` (sınırlar string), sorguda `Decimal` → `Decimal128`; `repository.py` okumalara `projection`, `count_ids` / `find_ids` (başka collection); `service.py` `relation_fields`, `populate_fields`, `hidden_fields`; sıra: eşle → `to_storage` → ilişki kontrolü (400) → unique (409) → `before_*` → yaz; `messages.py` `reference_not_found`.
- **Şablon / bağlam (`pythonContext.ts`):** bağlamlar bütün modül listesinden kurulur (.NET gibi): hedefi bu host'ta üretilen ilişki kontrol edilir ve populate edilir.
  - `reference`: gövde `RefId` / `list[RefId]`, filtre `IdStr | list[IdStr]` (`reference`: eşitlik / `$in`; dizi alanında "içerir"), tekil ilişki sıralanabilir ve unique olabilir. Satırda populate edilen alan `<Entity><Alan>Ref | str` (list / getOne obje `{ id, ...alanlar }`, create / update id), edilmeyen `str`. Ref sınıfı hedefin satır tipleri, hepsi opsiyonel; gizli alan, hedefin m-n listesi yok (.NET ile aynı). Populate sayfa başına alan başına tek `$in` sorgusu (N+1 yok).
  - `decimal`: `DecimalStr`, kısıtlar (K14) `Annotated[DecimalStr, Field(ge, le)]`, varsayılan `Decimal("0.50")` (ölçek korunur), filtre `range` / `eq` string değerle.
  - `map` → `dict[str, <map<…> değer tipi>]`, `json` → `JsonValue`, alt alanı olmayan obje → `dict[str, JsonValue]`. Alt alanda `decimal`, `reference` (`RefId`, kontrol yok), iç içe obje / `json` / `map` (düz JSON).
  - `access`: `readonly` create / update gövdesinde yok (gönderilirse 400); `hiddenFromCreate` / `hiddenFromUpdate` ilgili gövdede yok; `map_create` gövdede olmayan alana varsayılanı, boş listeyi ya da zorunlu metin / sayı / boolean'ın sıfır değerini yazar (.NET entity varsayılanları); doldurulamayan zorunlu alan satırda opsiyonel. `hidden`: satır, filtre, sıralama ve populate'te yok, okumalarda projection ile hiç okunmaz; gövdelerde var (ör. `Users.password`). `adminOnly`: Python'da yalnız admin API var, admin gövdelerinde yazılabilir; normal API gelince .NET / Express gibi normal gövdeden düşer.
- **Kararlar:** (1) Populate kuralı Express'inki: `populate` listesi, yoksa `display` (.NET yalnız `populate`; fixture'larda fark yok). (2) Hedef silinmişse tekil alan `null`, dizide eleman düşer (Express `populate` ile aynı; .NET'te FK buna izin vermez). (3) m-n listede tekrar eden id bir kez saklanır (.NET join tablosu ile aynı; Express olduğu gibi saklar). Hedefsiz `reference[]` (`externalIds`) kontrolsüz, filtresiz (.NET ile aynı). (4) `decimal` dönüşümü alan başına değil, `CrudService` yazmadan önce bütün dokümana (`to_storage`); alt objelerdeki decimal'lar da `Decimal128`. (5) Opak obje JSON objesi ister (`[1]` → 400); .NET `JsonDocument` her JSON değerini kabul eder. (6) Alan adı denetimi yumuşak anahtar kelimelere (`type`, `match`, `case`) izin verir (`Documents.type`).
- **.NET / Express ile bilinen farklar:** referans verilen kaydı silmek .NET'te 409 (FK Restrict), Python ve Express'te 200 (Mongo'da FK yok; parity KNOWN). Python gövdeleri Pydantic lax modunda: `"yes"` → `true` gibi dönüşümler kabul (PY5'ten beri; .NET strict). mongomock `Decimal128` karşılaştıramıyor / sıralayamıyor: decimal range ve sıralama yalnız gerçek Mongo'lu smoke'ta denenir.
- **Golden set:** `fixtures/dotnet/models.json` (EventTypes, Documents, MembershipPlans, Templates, Users, UserNotes, Reminders) + yeni `fixtures/python/py6-kinds.models.json` (`Orders`: access bayraklarının hepsi, decimal dizisi ve kısıtları, alt alanda decimal / reference / iç içe obje / json / map, opak obje, populate'te gizli hedef alanı, `display`'den populate). Testler `fixtures/python/tests/test_{templates,membership_plans,orders}_admin_crud.py`. Varlik360 golden manifest'inin 12 modeli de üretiliyor (elle denendi: ruff, format, import temiz; kapıda değil).
- **Kapılar:** `regen-python` 63 / 63 PASS (pytest 34, smoke'a PY6: decimal range / sıralama, `Decimal128` saklama, populate, 400, hidden); `python-bootstrap` 22 / 22; `contract-parity --suite golden-models` (yeni, Python ↔ .NET, 56 PASS + 1 KNOWN); `dotnet-e2e` hepsi PASS (regen-dotnet 43, smoke'lar, `symbols` 34 PASS + 5 KNOWN, `subscription-plans` 47 PASS, `golden-models`); `dotnet-e2e` parity çıktılarını `out/dotnet/<etiket>/parity-<suite>.log`'a yazar, KNOWN satırları farkı da gösterir. StockExchange: `pytest tests/core tests/modules/subscription_plans tests/test_health.py` 105 passed, `lint-imports` 9 kept / 16 broken (değişmedi), `subscription_plans` G dosyaları yeniden üretilince aynı.

### 6.7 PY7 — Python parser, tarama, içe aktarma, fazladan alan raporu (2026-10-24)

Generator tarafı; StockExchange'e hiçbir şey yazılmadı (içe aktarma kopyada denendi, rapor salt okunur).

- **Parser (K1)** — `src/main/parsers/python/`:
  - `pythonScripts.ts` `EXTRACT_SCRIPT`: modül Python `ast`'iyle **statik** okunur (import edilmez, çalıştırılmaz) → JSON: sınıflar (taban, `model_config`, alanlar, `Field(...)` argümanları, enum üyeleri, doğrulayıcı / metot adları), modül düzeyi takma adlar / `ConfigDict`'ler, `from … import …`. Betik TS'te metin; paketli uygulamaya ek dosya gerekmez.
  - `pythonRunner.ts`: host'un yorumlayıcısı (`<kök>/.venv/bin/python`, yoksa `python3`), `-I` (izole).
  - `pydanticModel.ts` (`parsePydanticModel`, `listPydanticClasses`): tip anlamı TS'te. Okunanlar: `X | None` / `Optional`, `Annotated[…, Field / StringConstraints / annotated_types]`, takma adlar (host `src/` ağacındaki başka modüllerden mutlak ve göreli import dahil), `Literal[...]` ve `StrEnum` / `IntEnum` (ve `(str, Enum)`) → enum (sayısal enum `numbers` ile, üye varsayılanı `Cls.MEMBER` → değer), `str` / `int` / `float` / `bool` / `datetime` / `date` (→ `dateFormat: date`) / `Decimal` (`Decimal("0.50")` varsayılanı) / `EmailStr` (→ `format: email`) / `PositiveInt`, `NonNegativeInt`… / `constr`, `conint`, `confloat`, `condecimal` / `ObjectId`, `RefId` (→ `reference`), `list` / `set` (→ dizi), `dict[str, skaler]` (→ `map`), `dict[str, Any]` (→ opak obje), `Any` / `JsonValue` (→ `json`), iç içe `BaseModel` (→ `object` / `object[]`, sınıf adı `typeName`), sınıf kalıtımı. Kısıtlar: `min_length`, `max_length`, `pattern`, `ge`, `le`; `gt` / `lt` tam sayıda ±1, ondalıkta dahil sınır + uyarı; `strip_whitespace` → `trim`. Zorunluluk: varsayılan yoksa `required`; varsayılansız `X | None` → `required + nullable`; varsayılanı olan alan opsiyonel (eski dokümanda alan yoksa satır okuması bozulmasın). `id` atlanır; `createdAt` / `updatedAt` her zaman timestamp (sınıfta yoksa uyarı).
  - **Yaklaşık / taşınmayan (uyarı):** doğrulayıcılar ve metotlar (hooks.py'ye), alt alanda enum değerleri (→ string), alt alanda dizi (→ `json`), alt objenin içindeki obje (→ düz JSON), alt alan varsayılanı (alt alan opsiyonel olur) ve kısıtları, `to_upper` / `to_lower` / `max_digits` / `multiple_of`, `alias`, `default_factory=<fonksiyon>`, `extra` `forbid` değilse, birden çok tipli `Union` (→ `json`), `tuple` (→ `json`). `…Id` / `…Ids` adlı string alanlar için "reference olabilir" önerisi (hedef tahmini).
  - **Reddedilen (içe aktarma yapılmaz):** `bytes`, `UUID`, `timedelta`, `time`, Pydantic olmayan sınıflar (dataclass vb.), bilinmeyen tip adları, karışık `Literal`, `type[...]` gibi alt simgeler.
  - Doküman sınıfı: verilmezse modül klasörünün PascalCase'i (K21: `ip_blacklist` → `IpBlacklist`), yoksa modüldeki tek Pydantic sınıfı; değilse aday listesi döner, arayüzde seçilir.
  - **Gidiş-dönüş:** Generator'ın ürettiği bütün `model_generated.py`'ler (subscription-plans, py5, .NET golden set, py6; 10 model) parser'dan geri okununca dosyaya ait kısımlar manifest'le aynı. Bilinen kayıplar: sayısal enum üye adı küçük harfe döner (`Low` → `low`), decimal varsayılanı string (`0` → `"0"`, çıktı aynı), string dizisi eleman kısıtı (yalnız gövdede), e-posta + özel desen (doküman modelinde yalnız desen).
- **Fazladan alan raporu** — `mongoReport.ts` (`collectionReport`, `summarizeReport`), `MONGO_REPORT_SCRIPT` (PyMongo, host'un `.venv`'i): modülün collection'ı (K21: snake_case entity) **salt okunur** örneklenir (`estimated_document_count`, ≤ 1000 ise hepsi, değilse `$sample`), her doküman modelle karşılaştırılır. Satırlar doküman sayısıyla: **modelde olmayan alan** (üst seviyede admin satırı `extra="ignore"` olduğu için yok sayar, alt objede / obje dizisinde 500; doküman modeliyle doğrulayan K kodu her durumda 500), **eksik zorunlu alan** (`required && !nullable` tekil alanlar + iki timestamp: satır `UtcDateTime` ister), **tipi uymayan** (enum dışı değer, string'de sayı, `null`…: 500), **okunur ama sorunlu** (tarih alanında ISO metin, referansta string id: Pydantic okur, filtre / sıralama / ilişki kaçırır). Bağlantı host'un kendi ayarından (`.env`, `config.env`, ortam; `MONGO_URI` + `MONGO_DB_NAME`), URI renderer'a gitmez (yalnız `host:port` / veritabanı), hata metninde kimlik bilgisi maskelenir. Yalnız yerel sunucu (`localhost`, `127.0.0.1`, `::1`); uzak sunucu için arayüzde ayrıca işaret (`allowRemote`). Ayar yok / sürücü yok / sunucu kapalı → `ok: false` + neden; içe aktarma yine yapılabilir.
- **Tarama / IPC / arayüz:**
  - `projectScanner`: `pyproject.toml` + `src/<pkg>/core` → `python-fastapi` (manifest'teki `backendStack: python-fastapi` artık yok sayılmıyor). Model listesi `listPythonModels`: manifest modülleri (`<m>/model_generated.py`, `kind: generated`) + manifest'te olmayan, `BaseModel` içeren `modules/<m>/model.py` (`kind: importable`; özellik modülleri `auth`, `ops` de listelenir, sınıf seçilerek alınabilir). `SourceType`'a `python-fastapi` eklendi (`ipcTypes`, `modelMerge`, tarayıcı).
  - `pythonBackend.ts`: `previewPythonImport` (parse + rapor, yazmaz), `importPythonModel` (desteklenmeyen alan / manifest'te zaten var → red; üretici kontrolleri yazmadan önce; manifest satırı + generate; var olan K dosyaları korunur, notlar: `build_<m>_service` yok, `<E>Repository` taban sınıfı değil, `model.py` hâlâ sınıfı tanımlıyor — §8 adım 3), `loadPythonModelForEditor` (`project:parseModel`: manifest satırı + dosya hash'i). `relatedModelFields` Python'da manifest satırından.
  - IPC `project:previewPythonImport`, `project:importPythonModel` + preload + `ipcTypes` (`PythonImportPreview`, `PythonImportResult`, `CollectionReport`).
  - Arayüz: `ProjectSelectPage` Python yığınını gösterir; `importable` satırda "Elle yazılmış: içe aktar" çipi, tıklanınca `PythonImportDialog` (sınıf seçimi, alan tablosu, reddedilen / yaklaşık / öneriler, rapor tabloları, uzak sunucu işareti, "İçe aktar ve generate et"; sonuç ve notlar, kapanınca yeniden tarama). Thunk'lar (`previewPythonImport`, `importPythonModel`) ve durum `projectSlice.pythonImport`'ta; sayfada try / catch yok. `SchemaDesignPage` Python'da Express dosya seçimleri yerine G / K açıklaması.
- **StockExchange (gerçek veri, salt okunur):** 14 entity modelinin hepsi reddedilen alan olmadan okunuyor. Rapor (2026-10-24, yerel `alpha-mongo`):

  | Modül | Doküman | Okumayı bozan | Okunur ama sorunlu |
  | --- | --- | --- | --- |
  | `ip_blacklist` | 337 | `updatedAt` yok ×337 | — |
  | `users` | 11 | `updatedAt` yok ×11 | — |
  | `user_subscriptions` | 4 | `createdAt`, `updatedAt` yok ×4 | `history[].at` metin ×4 |
  | `audit_logs` | 287 | `createdAt`, `updatedAt` yok ×287 | — |
  | `markets` | 6 | `providers.*ProviderId` (9 anahtar) modelde yok ×6 | `createdAt` ×6 / `updatedAt` ×5 metin |
  | `providers` | 10 | `createdAt` yok ×10 | `updatedAt` metin ×7 |
  | `symbols` | 1000 / 5333 (örneklem) | — | — |
  | `scheduled_reports` | 235 | `createdAt`, `updatedAt`, `reportId` yok ×235 | — |
  | `daily_report_watchlist` | 1000 / 2733 (örneklem) | `createdAt`, `updatedAt` yok ×1000 | — |
  | `deep_dive_reports` | 1 | `updatedAt`, `reportId` yok ×1 | — |
  | `deep_dive_prompts` | 1 | `createdAt` yok ×1 | `updatedAt` metin ×1 |
  | `market_pulse_items` | 7 | — | — |
  | `ohlcv_discontinuity_alerts` | 79 | `createdAt` yok ×79 | — |
  | `user_watch_lists` | 3 | `createdAt` yok ×3 | — |

  `reportId` (`scheduled_reports`, `deep_dive_reports`) API görünümü alanı (= `_id`), içe aktarınca editörde silinmeli. `IpBlacklist` için doğrulama: üretilen `IpBlacklistRow` aynı 337 dokümanda 337 kez başarısız (raporla aynı).
- **Kapı:** `scripts/verify/python-import.mjs` 94 PASS ([verification.md](../verification.md)); fixture `fixtures/python/import/` (`catalog_items/model.py`: okunan bütün yapılar + reddedilen `CatalogItemsBad`; `shared/types.py`: başka modülden takma ad). Diğer kapılar: tsc taban 3, `build:electron`, `vite build`, `test-core-assets` 24 / 24, smoke 15 / 15, `regen-varlik360 --manifest` ok, `--p5` yalnız bilinen 2 FAIL, `regen-python` 63 / 63, `python-bootstrap` hepsi PASS, `regen-dotnet` 43 / 43, `dotnet-e2e --python-only` (`subscription-plans` + `golden-models`) PASS.

### 6.8 PY8 — giriş kapısı, doküman, kural dosyası, modül testi (2026-10-24)

Generator tarafı; StockExchange'e hiçbir şey yazılmadı.

- **Modül test şablonu (K):** ilk generate'te her admin modülü için `tests/modules/<klasör>/test_admin_crud.py` (`writeOnce`; yalnız host'ta `tests/` varsa, yani iskeletli host'ta; kopyalanmış `src/` ya da StockExchange'te var olan dosya korunur). Değerler `pythonTestContext.ts`'te modelden: kısıt / e-posta / enum / sayı biçimi / tarih biçimine uyan iki örnek (unique alanlar farklı), basit `pattern`'lerden (`^[A-Z]{3}-\d{3}$` gibi: sabit, sınıf, `\d` / `\w`, `{n}` / `{n,m}` / `+` / `*` / `?`) üretilen değer, olmazsa aday listesi; zorunlu alana değer bulunamazsa dosya `pytestmark = skip` + nedenle yazılır. Reference: test hedef collection'a iki doküman ekler (hedefin zorunlu unique alanları doldurulur; hedef bu host'ta değilse yalnız id). Şablon `test_admin_crud.py.hbs`; satırlar `pyLitLines` ile `ruff format` gibi bölünür (çıktı `ruff check` + `ruff format` temiz).
  - Kapsam: zarf + auth (401 / 403, `traceId`), bütün create alanlarıyla create → getOne gidiş-dönüş (populate id'ye indirgenir, gizli alan yok, zaman damgası biçimi), yalnız zorunlu alanlarla create → varsayılanlar / `[]` / `None` / .NET sıfır değerleri ve `trim`, update (değişen alan + gönderilmeyen alan aynı), `null` kuralı (opsiyonel alan temizlenir, getOne'da da `None`; zorunlu alan / dizi 400), readonly / hiddenFromUpdate alanı update'te 400, doğrulama (eksik zorunlu alan, bilinmeyen alan, kısıt ve sınırlar, `int`'e ondalık, decimal'e sayı, enum dışı, e-posta, gün alanına saat, bozuk id, alt objede eksik zorunlu / `int`'e ondalık, opak objeye dizi, var olmayan reference hedefi, filtrelenemeyen / sıralanamayan alan), unique (create ve update'te 409), liste (sayfalama, varsayılan sıralama `createdAt desc`, iki kaydı ayıran bir filtre — `regex`'te büyük harfli parça —, bir sıralama anahtarı; decimal mongomock yüzünden yok), silme → 404.
- **`regen-python`:** her modülde modül testinin varlığı, modül testlerinde `ruff format --check`, modül testleri tek başına (`pytest`, hiçbiri skip değil; 10 modül 67 test) ve bütün takım (99). `fixtures/python/tests/test_subscription_plans_admin_crud.py` silindi (üretilen test kapsıyor); kalan dört dosya `test_<m>_cases.py` adını aldı ve yalnız genel şablonun ifade edemediği golden set davranışı için kopyalanır (çapraz modül populate şekilleri, `display` yedeği, hedef silinince `null` / eleman düşmesi, `Decimal128` saklama, iç içe alt alan türleri, e-posta + desen, opsiyonel unique boşken çakışmama, tarih filtresi). 64 kontrol.
- **`scripts/verify/python-e2e.mjs`:** sırayla `regen-python`, `python-bootstrap`, `python-import`, sonra `regen-dotnet <etiket>` + `dotnet-e2e --python-only` (`subscription-plans` + `golden-models` parity); kapı başına PASS sayısı ve FAIL satırları, parity'de suite özetleri; tam çıktılar `out/python-e2e/<kapı>.log`. Bayraklar: `--no-docker`, `--no-stockexchange`, `--no-parity`, `--reuse-dotnet`, `--only=`.
- **`scripts/python-host.mjs`:** arayüzde Python düğmesi olmadığı için (PY9) komut satırı: `bootstrap <dir> <App>`, `model <dir> <models.json>` (model editörü yolu: manifest satırı + generate), `generate <dir>`; IPC'nin çağırdığı fonksiyonlar (`bootstrapPythonProject`, `writePythonModel`, `generatePythonModules`). `_python-entry.ts`'e `loadPythonModels` eklendi.
- **Dokümanlar:** `docs/backend/python-fastapi.md` (yeni proje adımları, çağrı zinciri, host düzeni, G / K tablosu, servis ve hook'lar, alan türü eşlemesi, `null` kuralı, modül testi, içe aktarma, stack tespiti, sınırlar; `docs/README.md`'den bağlı), `.cursor/rules/backend-python-fastapi.mdc` (host'ta elle yazılan K kodu: hangi dosya düzenlenmez, kod nereye gider, katman / import / hata / wire kuralları, modül testinin bakımı, kapılar; Generator tarafı için kısa bölüm).
- **Kanıt (dokümandan kurulum):** scratch klasörde `python-host.mjs bootstrap` → `cp .env.example .env` + `JWT_SECRET` → `uv sync` → iskelet `pytest` 19 passed → yeni iki model (`Categories`: desenli unique slug; `Products`: `^[A-Z]{3}-\d{3}$` desenli unique sku, decimal, `int` + varsayılan, enum + varsayılan, populate'li zorunlu reference, metin dizisi, gün, alanlı opsiyonel obje, e-posta, gizli alan) `python-host.mjs model` ile → `pytest tests/modules` 14 passed (skip yok), `ruff check src tests` temiz, `ruff format --check` modüller + modül testleri temiz, `lint-imports` 1 kept; uvicorn Mongo kapalıyken `/api/v1/health` 200 (`mongoConnected: false`), token'sız admin ucu 401 zarfı. İlk denemede desen yüzünden `Products` testi skip yazılmıştı; desenden değer üretimi bunun üzerine eklendi.
- **Kapılar (2026-10-24):** `python-e2e` hepsi PASS: `regen-python` 64, `python-bootstrap` 22, `python-import` 94, `regen-dotnet` 43, parity `subscription-plans` 53 PASS, `golden-models` 59 PASS + 1 KNOWN (referans verilen kaydı silme, .NET 409). tsc taban 3 (`src/generator-assets` dışı), `build:electron`, `test-core-assets` 24 / 24.

### 6.11 PY11 — `config.env` → `.env` (2026-10-25)

StockExchange. Generator kodu değişmedi (`mongoReport` zaten önce `.env`, sonra `config.env` okur).

- `core/config.py`: `env_file` repo kökü `.env`. `load_dotenv(override=False)` Settings'te olmayan anahtarları (`*_CRON`, `OAUTHLIB_INSECURE_TRANSPORT`, `STRIPE_PRICE_*`) sürece yazar; ortam değişkeni dosyayı ezer, dosya yoksa atlanır. Başka kod dosya yolunu bilmez.
- Dosyayı açanlar `settings`'e indi: `scripts/inspect_tr_report_runs.py`, `scripts/compute_rank_ic.py`. `modules/funds/service/settings.py` artık `config.env` aramaz (`--env-file` verilirse onu ezer). `tests/conftest.py` ortamı `core.config` import'undan önce set eder.
- `Dockerfile` `COPY config.env` yok. `ops/docker-compose.yml` api / jobs / api-parity `env_file: ../.env`. `ops/.env` yalnız Mongo interpolation (`MONGO_ROOT_*`, `APP_DB_*`); container `MONGO_URI`'yi oradan üretir. `docker-compose.dev.yml` `config.env` mount'u kalktı.
- `.env.example` repoda, `.env` git dışı. Yerelde `config.env` `.env`'e kopyalandı; eski dosya duruyor, okunmuyor. `.gitignore` eski adı da yok saymaya devam eder.
- Jenkins `Backend Build`: `.env` yoksa `mv config.env .env`, ikisi de yoksa durur. README, `ops/README.md`, `apps/web`, `documents/` notları `.env`.
- Kanıt: settings `.env`'den okuyor ve ortam değişkeni eziyor; `docker compose config --quiet` (dev overlay dahil) geçer; `pytest tests/test_health.py` 3 passed. VPS'e bu oturumda bağlanılmadı; rename bir sonraki Jenkins deploy'unda olur.

## 7. Açık işler

### 7.1 PY2 kalanları (StockExchange)

1. **import-linter:** 25 sözleşmeden 16'sı kırık (`core.auth` → `modules.users`, `engine` → `modules.analysis.model`, `integrations` → `modules`, `modules.ops` → `worker.runtime`, modüller → `api.deps` …). Düzelince Jenkins `Test` aşamasına `lint-imports` eklenir.
2. **Router'lar `ops.admin_router`'ın özel yardımcılarını kullanıyor** (`_append_admin_job_jsonl`, `_require_quote_service`, `_ADMIN_SUPPORTED_MARKET_CODES`; `symbols`, `daily_report_watchlist`, `universe`, `analysis`). `ops/service` ya da `core/`'a inmeli. `ops/admin_router.py`'deki `_TR_STOCK_*` vb. sabitler muhtemelen ölü.
3. **Ruff borcu:** birleştirilmiş servislerde E402 / F811, kullanılmayan import'lar, eski `python -m jobs.…` docstring'leri. TC001 / TC003 bilerek kalır (FastAPI çalışma anında okuyor).
4. **Eski yollar:** README, `py2-rules.md`, `.cursor/rules` güncellenmeli.
5. **Tam test koşuları** (StockExchange `logs/pytest/`, `logs/` git dışı; komut `uv run pytest -q -p no:warnings --tb=line`; son satır `exit: <kod> end: <zaman>`; okuma `tail -40`). Taban S0: 1528 passed, 1 skipped, 1 failed.
   - `2026-10-23-pre-py3-full.log`: 54 failed, 1471 passed, 1 skipped, 17 errors.
   - Ayrıştırma (`2026-10-23-py3-triage-full.log`): 35 failed, 1500 passed, 1 skipped, 7 errors. Düzeltilenler: testlerin yerel Docker Mongo'ya (auth'lu `alpha-mongo`) bağlanması ve lifespan'da korumasız `load_symbol_snapshot` (PY2b) → 25 test; `test_etf_list` / `test_trfund_list` route testlerinde `MagicMock` db; PY2 taşıma artıkları (`packages.analysis_core.trfund.*` patch yolları, codemod haritasında `csv_listing` hedefi). Python 3.12 ortamında aynı sonuç (sürümden bağımsız; `.python-version` 3.14 kaldı). Kalan 42'nin hepsi PY2b (§7.2 madde 7).
   - PY3 sonrası (`2026-10-23-py3-full.log`): 35 failed, 1515 passed, 1 skipped, 7 errors; kırmızılar ayrıştırmadakiyle aynı, yeni kırmızı yok.
   - Günlük döngüde yalnız ilgili testler (`tests/modules/<m>`, `tests/core`, `tests/api`); sonraki tam koşular `<tarih>-<etiket>-full.log`.
6. **Doğrulama yapılmadı:** Docker'da `api` / `jobs` ayağa kaldırılmadı (S4'ten beri); route listesi ve `worker/main.py` cron'ları S0 ile karşılaştırılmadı; Jenkins `Test` aşaması hiç koşmadı.
7. **`scripts/py2_codemod.py` git'e eklenmeli** (izlenmiyordu, bir kez boşalıp yeniden yazıldı).
8. **Commit:** StockExchange'te hiçbir şey commit edilmedi.

### 7.2 PY2b kalanları (StockExchange)

1. **VPS migration'ları:** S8, sonra T2, `--apply` ile; deploy'dan önce (kod yeni collection adlarını okuyor).
2. **T7:** VPS'te T2 çalıştıktan sonra CSV'ler (makrolar hariç) silinir; `ops/docker-compose*.yml` `../data/raw` mount'u gözden geçirilir.
3. **T6 FE:** `/symbols` sayfası + sidebar, admin-base entegrasyonuna bırakıldı (StockExchange `documents/admin-base-integration-plan.md`, sondaki `/symbols` eki).
4. **`CLM`:** hem US hisse hem US ETF listesinde; iki listeden ve `symbols`'tan kaldırılacak.
5. **Canlı karşılaştırma:** public liste uçları (`/stocks`, `/etfs`, `/trfund`) ve nightly evreni canlı API'de önce/sonra karşılaştırılmadı; birleşen job'lar elle tetiklenmedi.
6. **ETF pin dosyası** (`us_etf_admin_pins.csv`) hâlâ dosya; `symbols`'a alınmalı ya da kaldırılmalı.
7. **Testler (35 failed + 7 errors, 2026-10-23):** `symbols` görüntüsüne (test fixture'ı) ya da yeni API'ye göre güncellenmeli; `symbols` birim testi yok.
   - CSV fixture / eski API: `tests/modules/universe/test_indices_refresh.py` (10, "Empty CSV"), `test_universe_csv_export.py` (2), `tests/modules/symbols/test_universe_csv.py` (3, `csv_path_for_market` yok), `test_universe_csv_indices.py` (3), `test_trstock_csv.py` / `test_ukstock_csv.py` (`write_reference_stocks(path=)`), `tests/modules/funds/test_trfund_admin_api.py` (7 error: `ops.admin_router._TRFUND_CSV_PATH` yok).
   - Boş `symbols` görüntüsü: `tests/modules/lists/test_trfund_list.py`, `markets/test_data_markets_api.py` (2), `market_data/test_jp_market.py` (2), `market_data/test_market_news_service.py` (3), `analysis/test_etf_detail.py`, `engine/test_admin_fundamentals_api.py`, `audit_logs/test_activity_log.py`, `user_subscriptions/test_sprint7_auth_subscription_backtest.py` ("IBM is not in US market universe").
   - mongomock `UpdateOne(sort=)` desteklemiyor: `tests/modules/universe/test_index_members_add.py` (3; `symbols` repository'nin `bulk_write`'ı). PY2c'de gerçek Mongo'yla kalkar.
8. **`tickerNormalize`:** market dokümanlarında set edilmedi; kurallar servis içinde sabit. `symbols` `ensure_indexes` `app_state`'e bağlı değil.

### 7.3 Generator

1. **PY1 kalanları.** Kod yazıldı ve kapılar yeşil (2026-10-23): tsc (taban 3), `build:electron`, `test-core-assets` 22/22, smoke, admin-base 40 test + build, `admin-config-check` (15 model, tsc 0), `regen-client` (tsc 2 = taban), Varlik360 regen `--planned --core-overlay` (kopyada tsc 0), `dotnet-e2e` (PY1 formats 17, D0 46, `contract-parity` hepsi PASS), `express-py1-e2e` (Express'te aynı 17 senaryo). Kalan:
   - ✅ admin-base **0.1.7** npm'de (2026-10-23, `npm run release`).
   - Varlik360 (`src/core`) ve SharedFrame (`Common/`) asset'leri elle güncellendi; host'larda generate + smoke ve commit yapılmadı.
   - ✅ Electron'da model editörü kontrol edildi (2026-10-23, .NET fixture host kopyası, `Reminders`): sayısal enum (10, 20), `int`, sadece tarih dosyadan yükleniyor; kısıtlar ve e-posta (entity'de tutulmaz) editörden girilip kaydedilince manifest'e ve validator'lara yazılıyor, yeniden açınca geri geliyor; `Number format` C# host'ta görünüyor, dizi alanında kısıt yok.
   - ✅ Generator commit `055a4fa` (PY0 + PY1).
   - Kapıda görülen iki PY1 dışı sorun düzeltildi (2026-10-23): route artık router bağlayan app dosyasına (`findBackendAppFile`; Varlik360 `src/app.ts`) ekleniyor; CRUD mesajları host'ta tek `crud.*` setinde (Varlik360 `en.ts` / `tr.ts`'e eklendi, `base-crud.service.ts` güncellendi). Varlik360'ta modüller yeniden üretilince 13 `crud.ts`'ten modül mesajları kalkar; eski locale blokları sonra silinebilir.
2. Alt kod aralıkları (K9: 460–479, 560–579) [api-contract.md](../api-contract.md) §1'e "projeye özel aralıklar" olarak yazılır.
3. PY4–PY8 (§5), ardından resource döngüsü (§8), en son PY2c.
4. **PY9 ve PY10 sırası:**
   1. PY9'un .NET ipucu ve Express kısmı (düğme, `_skeleton`, `project:bootstrapExpress`). İpucunun veritabanı satırı stack tanımındaki desteklenen veritabanı listesinden okunur; PY10'un DB5'i yalnız bu listeyi ve "Yeni .NET projesi" penceresini genişletir.
   2. PY10 DB0 (spike), 1 ile paralel: elle yazılmış Mongo host'u üretim kodunu etkilemez, EF 10 uyumu ve LINQ çevirisi riskini erken gösterir.
   3. PY8, sonra PY9'un Python kısmı (düğme + Electron'da uçtan uca deneme, madde 10 ve 11'deki denenmemiş akışlar dahil).
   4. PY10 DB1 → DB2 → DB2b (SQL Server) → DB3 → DB4 → DB5 → DB6, [backend-dotnet-database-providers.md](backend-dotnet-database-providers.md) §5. PY9 önce geldiği için DB1'in manifest migration'ı Express ve Python manifest'lerine de `mongodb` + `objectid` yazar, üç bootstrap da bu alanları yazmaya başlar.
5. PY10 kapsamı: .NET'te PostgreSQL, SQL Server, MongoDB; Express ve Python yalnız MongoDB (K22).
6. **PY3'te görülenler (PY4–PY6'ya girdi):**
   - ✅ (PY5) Obje alt alanında `numberFormat`: NormalizedModel alt alanına eklendi; Python `int`, .NET `int` üretir (§6.5).
   - ✅ `traceId` başlığı (2026-10-23): `TraceIdMiddleware` sözleşmedeki `X-Request-Id`'yi okur (yoksa eski `X-Trace-Id`; 128 karakterden uzunsa yok sayılır, yeni id üretilir) ve yanıta iki başlığı da yazar; CORS `expose_headers` ikisi. PY4'te asset'e bu haliyle geçer.
   - Admin-crud yolunda tanımsız uç / 405 global handler'a düşer (StockExchange zarfı, `meta` / `timestamp`'lı); eski uçlar kalkınca (K6) global handler sözleşme zarfına geçer.
   - Create body'de opsiyonel alanlar `null` kabul eder, varsayılanı `map_create` yazar (.NET `?? default` ile aynı); şablon bu satırları alan başına üretir.
   - `contract-parity --suite subscription-plans` (47 senaryo) PY5'te üretilmiş dosyalar için de koşar; `python-parity` fixture'ı şablonların girdisi.
   - StockExchange'te açık: migration `2026_py3_plan_timestamps.py` **yerelde uygulandı (2026-10-23, 3 plan; ikinci koşu 0)**, VPS'te deploy'dan önce `--apply` (admin-crud satırı `createdAt` ister; yoksa o planlarda list / getOne / delete 500); `api-parity` compose servisi bir kez build edilip denenmeli.
   - ✅ PY3 incelemesinde düzeltilenler (2026-10-23):
     - import-linter: katman muafiyetine `modules.*.admin_router_generated -> api.*`; "başka modülden yalnız service / model" listelerine her modülün `repository_generated` ve `admin_router_generated`'ı (üretilen dosyalar da başka modülden import edilemez). PY5 şablonları ve `regen-python` bu adlandırmaya güvenir.
     - `CrudService.delete`: `delete_by_id` silmediyse (arada başka istek sildi) 404, `after_delete` çalışmaz (`test_delete_race_is_404_without_after_delete`).
     - Eski `subscription_plans/admin_router.py`: `admin.py`'den kopya başlık, kullanılmayan `_admin_job_tasks` / `_ADMIN_TRFUND_*` / `log` silindi, import'lar sıralı.
   - ✅ update'te `null` kuralı üç stack'te tek kural oldu (§7.3 madde 10).
7. **PY4'te kalanlar (PY5 / PY8 / PY9'a girdi):**
   - ✅ (2026-10-23) Global hata zarfı: asset `contract.py`'de `install_contract_handlers(app)` (tanımsız yol 404, desteklenmeyen method 405, `ContractRoute` dışı doğrulama 400, `AppError`, beklenmeyen hata 500; dil ve `traceId` isteğe göre; 404 / 405 metinleri yerelleştirilmiş, `messages.py`'ye `method_not_allowed*`). İskeletin `create_app()`'i çağırır, testi `test_errors_outside_routes_use_the_envelope`. StockExchange çağırmaz (eski uçlar `LocalResponse`); eski uçlar kalkınca çağırır (K6).
   - ✅ (2026-10-23) Rol adı her stack'te **`admin`** (kullanıcı kararı): .NET asset'i `CurrentUser.AdminRole = "admin"` (politika adı `Admin` değişmedi), SharedFrame kopyası da (FE zaten `role === 'admin'` bekliyordu; eski `Admin` claim'li token'lar yeniden girişte yenilenir), smoke / parity token'ları `role: 'admin'`.
   - ✅ (2026-10-23) StockExchange `core/config.py`'den `TRACE_ID_HEADER` / `LEGACY_TRACE_ID_HEADER` silindi (başlıklar `trace.py` sabitleri).
   - ✅ (2026-10-23) Paketli uygulama: `build-electron.js` `src/generator-assets` → `dist-electron/generator-assets` kopyalar; üç stack de `getGeneratorAssetsDir(stack)` (`templateHelpers.ts`; geliştirmede `src/…`, paketlide `dist-electron/…`, şablonlarla aynı kural) üzerinden okur (`dotnetAssetsDir`, `pythonAssetsDir`, Express core bootstrap).
   - `ruff format` StockExchange'in bazı asset dosyalarında (önceden de) satır bölme öneriyor; iskelette format kapısı yok.
   - PY5 şablonları G dosyalarını `writePythonGenerated` ile, K dosyalarını `writeOnce` ile yazar; registry `writePythonRegistries(root, pkg, modules)`'a modül listesi verir. Üretilen modüller asset'leri mutlak yolla (`<pkg>.core.crud`) import eder.
8. ✅ PY11 (§6.11, 2026-10-25): StockExchange `config.env` → `.env`; sırlar imajdan çıktı. VPS rename'i bir sonraki Jenkins deploy'unda (`config.env` varsa ve `.env` yoksa `mv`).
9. PY12 (§5): genel CSV export (model ayarı `export`, `POST {endpoint}/export` + admin-base kolon seçme penceresi); sonra StockExchange'teki elle yazılmış iki export (watchlist, evren) silinir.
9. **PY5'te kalanlar (PY6 / PY7 / PY8'e girdi):**
   - PY6'ya: `reference` (filtre `reference`, populate), `decimal`, `map`, `json` ve alt alanı olmayan obje, `access` (readonly, hiddenFromCreate / Update, hidden, adminOnly); bugün `PythonUnsupportedError` ile reddedilir. Alt alanda `reference` ve iç içe obje de PY6. PY6 golden set'i Express / .NET modelleriyle; `regen-python`'a eklenir.
   - ✅ (2026-10-23) Unique index'ler: yeni G registry `api/indexes_generated.py` (`CRUD_REPOSITORIES`: her modülün K repository'si, `ensure_crud_indexes(db)`); iskeletin lifespan'ı Mongo bağlıysa açılışta çağırır. `regen-python` smoke'u açılıştan sonra unique `code` index'ini doğrular. StockExchange dosyayı alır ama çağırmaz (`app_state` index'leri kendisi kurar).
   - ✅ (2026-10-23) Editörde alt alan `Format` (float / int) seçimi, C# / Python host'larında (`editorShowsNumberFormat`); alt alan tipi değişince değer düşer (`withEditorSubType` yeni alt alan kurar), `draftToNormalizedModel` sayı dışı alt alandan siler.
   - ✅ PY6: update `null` kuralı seçildi ve uygulandı (§7.3 madde 10).
   - ✅ (PY7) doküman modeli ve alt obje sınıfları `extra="forbid"`; içe aktarma fazladan alanları (ve eksik zorunlu / tipi uymayan değerleri) raporlar (§6.7).
   - ✅ (PY8) modül test şablonu (§6.8).
   - ✅ (PY8) `docs/backend/python-fastapi.md` ve `.cursor/rules/backend-python-fastapi.mdc` (§6.8).
10. **PY6'da kalanlar / karar bekleyenler:**
   - ✅ **Karar (kullanıcı, 2026-10-23): (B) seçildi ve uygulandı.** Ölçüm (karar öncesi) (2026-10-23, `contract-parity`: `symbols` suite'inde `update null optional field`, `golden-models`'ta aynı senaryo + `getOne after null update`):

     | Stack | `{ "description": null }` (opsiyonel alan) | Gerekçe |
     | --- | --- | --- |
     | Express (Varlik360) | **400** (zod `.optional()` `null` kabul etmez; Generator hiç `.nullable()` yazmıyor) | doğrulama |
     | .NET | 200, alan değişmez | `if (body.X is not null)` |
     | Python | 200, alan değişmez | `map_update` `None`'ları düşürür |

     Zorunlu alana `null` (`{ "name": null }`) .NET ve Python'da da 200 / değişmez. admin-base edit formu boşaltılan alanı `nullable` ise `null` gönderir, değilse hiç göndermez: bugün hiçbir stack'te opsiyonel bir alan formdan temizlenemiyor (Express'te `nullable` alanın kaydı 400 alır).

     Seçenekler: **(A)** "`null` değişmez" (bugünkü .NET / Python): Express'e update şemasında `.nullable()` + payload'dan `null` düşürme; alan temizleme yolu yok. **(B)** "`null` alanı temizler, gönderilmeyen değişmez" (JSON Merge Patch, RFC 7386): opsiyonel alanda `null` → Mongo'da `$unset` (Express gelmeyen alanla aynı şekil), Postgres'te `NULL`; zorunlu (`required && !nullable`) alana `null` → 400; dizi `[]` ile boşalır. Python: `exclude_unset` zaten var olanı ayırıyor, `None` → `$unset` (küçük iş). Express: opsiyonel alanlara update şemasında `.nullable()` + `null` → `$unset`. .NET: gövdede "gönderildi mi" bilgisi gerekir (ör. `Optional<T>` + JSON converter ya da gövdeyi `JsonElement`'ten okuyan eşleme; en büyük iş). admin-base: edit'te boşaltılan opsiyonel alan `null` gönderir.

     **Öneri: (B).** Formdan alan temizlenebilmesi bugün eksik bir davranış; standart semantik; Express zaten `null`'ı reddettiği için üç stack'te kırılan istemci yok. **Uygulandı (2026-10-23):**
     - Kural tek yerde: `updateNullClears` (`src/shared/normalizedModel.ts`): tekil ve (`required` değil ya da `nullable`) → `null` temizler; zorunlu alan ve dizi `null` almaz (400), dizi `[]` ile boşalır. Sözleşme: api-contract §5.
     - Python: update şemasında zorunlu / dizi alan `NotNull[T]` (`core/crud/patch.py`, mesaj `not_null`), opsiyonel `T | None`; `map_update` `exclude_unset` (`None` kalır), repository `None` → `$unset`; unique kontrolü temizlenen alanı atlar. StockExchange'e asset'ler + `subscription_plans` G dosyaları kopyalandı.
     - Express: update zod şemasında opsiyonel tekil alan `.nullable()`; yeni asset `services/merge-patch.ts` (`toMergePatch`: `null` → `$unset`), `BaseCrudService.updateById` kullanır. Varlik360'a asset'ler + 5 modülün `*.schema.ts` update şemaları işlendi.
     - .NET: `PatchBody` (gönderildi bilgisi, gerekçe [backend-dotnet-efcore.md](backend-dotnet-efcore.md) §4). SharedFrame yeniden generate edildi.
     - admin-base 0.1.8: edit'te boşaltılan opsiyonel / `nullable` tekil alan `null` gider (boş `writeOnly` gitmez).
     - Parity: üç suite'te 6 senaryo (`nullRuleScenarios`: değer yaz, alanı göndermeden update, korundu mu, `null`, temizlendi mi, zorunlu alana `null` 400); KNOWN kalktı. Sonuç: `symbols` 39 PASS + 4 KNOWN, `subscription-plans` 53 PASS, `golden-models` 59 PASS + 1 KNOWN.
   - Python gövdeleri lax: `"yes"` → `true`, `"1"` → `1` kabul (.NET strict, Express zod strict). Strict mod (`ConfigDict(strict=True)` + tarih / enum için istisnalar) ayrı iş; PY8 öncesi karar.
   - Referans verilen kaydı silme: Python / Express 200, .NET 409. Mongo'da "kullanılıyor" kontrolü (hedefi gösteren modüllerde `exists`) istenirse ortak `before_delete` kuralı olarak üç stack'e (Express dahil) eklenir; bugün KNOWN.
   - Populate kuralı farkı (`display` yedeği): .NET de `populate` boşsa `display`'i doldursun mu (Express ile aynı), karar küçük; fixture'larda fark yok.
   - Electron'da PY6 türleriyle model editörü → generate denenmedi (PY9'daki uçtan uca denemeye girer).
11. **PY7'de kalanlar:**
   - Electron'da denenmedi: Python projesi açma → tarama → içe aktarma penceresi → generate → şema tasarımcısı (renderer `vite build` geçiyor; IPC'nin çağırdığı fonksiyonlar kapıda). PY9'daki uçtan uca denemeye girer.
   - StockExchange'te gerçek içe aktarma yapılmadı (yalnız kopyada). Bir modül içe aktarılmadan önce (resource döngüsü §8): (1) raporda okumayı bozan satırlar migration ile düzeltilir; neredeyse her collection'da `createdAt` / `updatedAt` eksik (§6.7 tablo; `subscription_plans` için yapılan `2026_py3_plan_timestamps.py` gibi, `createdAt` = ObjectId zamanı, `updatedAt` = `createdAt`), `markets`'te `providers.*ProviderId` anahtarları ya modele eklenir ya silinir, metin tarihler `datetime`'a çevrilir; (2) K dosyaları uyarlanır (`service.py`'de `build_<m>_service`, `repository.py` `…RepositoryBase` alt sınıfı, `model.py` re-export); import notları bunları listeler.
   - **Veri migration'ları (2026-10-24, StockExchange, yalnız yerelde uygulandı):** `2026_py7_string_dates.py` (24 alan) ve `2026_py7_timestamps.py` (3.701 doküman); ikinci koşu 0, rapor yeniden koşunca okumayı bozan timestamp / metin tarih satırı kalmadı. 9 modele opsiyonel `createdAt` / `updatedAt`, insert'ler iki damgayı yazar, metin tarih yazan `upsert`'ler düzeltildi. `markets.providers.*ProviderId` silinmedi (repository okurken / yazarken kullanıyor): içe aktarmada modele `reference → providers` olarak eklenecek. Kalan: update yolları `updatedAt`'i güncellemiyor (CrudService geçişi, §8).
   - **⚠️ Prod (VPS) — yapılmadı:** deploy'dan önce sırayla `py2_rename_collections` → `py2b_import_symbols` → `py3_plan_timestamps` → `py7_string_dates` → `py7_timestamps`; önce yeni imaj build, migration'lar o imajla (kuru, sonra `--apply`), sonra servisler (eski kod migrate edilmiş veriyi okuyamaz; Jenkins `up -d --build`'den önce elle). Komutlar StockExchange `documents/py2-restructure-plan.md` §9.
   - Parser sınırları (§6.7): alt alan enum / dizi / iç içe obje / varsayılan / kısıt NormalizedModel alt alanında yok (alt alan modeli genişlerse parser hazır: uyarılar o noktaları gösteriyor). Doğrulayıcılar taşınmaz.
   - Rapor yalnız host'un `.venv`'inde PyMongo varsa çalışır (yoksa `no-driver`); `$sample` örneklemi 1000 doküman (büyük collection'da nadir anahtarlar kaçabilir).
   - `…Id` alanları import'ta string kalır; reference'a çevirmek editörde (öneri listesi).
12. **PY8'de kalanlar:**
   - Electron'da denenmedi: yeni Python host'u bu sürümde yalnız `scripts/python-host.mjs` ile kuruluyor; düğme ve uygulamada model ekle → generate → modül testinin gelmesi PY9'daki uçtan uca denemeye girer.
   - Modül testi K dosyasıdır: model değişince yeniden yazılmaz (yeni alan / kural elle eklenir ya da dosya silinip generate edilir). İskeletin `conftest.py` fixture'larına (`client`, `make_token`, `mock_db`) dayanır; StockExchange'in `conftest.py`'si farklı (`admin_client`, `mock_mongo_via_main`), orada içe aktarılan modüllerin testleri elle uyarlanır (bugün `tests/` kopyalanmadığı için kopyada yazılmıyor, gerçek repoda `subscription_plans`'ın kendi testi var).
   - Desenden değer üretimi basit desenlerle sınırlı (grup, `|`, `.` yok); bulunamazsa test skip yazılır.
   - Ortak alt alanı / iş kuralı olan modülde (hook'un reddettiği varsayılan değerler gibi) üretilen test ilk generate'te kırmızı olabilir; kural eklendikçe test güncellenir (kural dosyası bunu söyler).
   - Kalan `fixtures/python/tests/test_<m>_cases.py` dosyaları genel şablona taşınabilecek parçalar içeriyor (tarih aralığı filtresi, opsiyonel unique boşken çakışmama); şablon genişlerse küçülür.
   - İskelet ve asset dosyalarında `ruff format --check` hâlâ 8 dosyada satır bölme öneriyor (§7.3 madde 7); dokümandaki format komutu bu yüzden yalnız `modules` + `tests/modules`.
13. **PY-R'den (StockExchange ekran üretimi) çıkan Generator eksikleri** (StockExchange `documents/py-resource-generation-plan.md`) — ✅ 2026-10-24:
   - ✅ **Admin işlem seçimi:** `api.adminOperations` (NormalizedModel; yoksa tam CRUD, `list` hep açık; tek kural `resolveAdminOperations`). Python router, Express `route.admin.hbs`, .NET admin endpoint'leri yalnız seçilenleri üretir; admin config `operations` aynı listeden (tablo `features` ile daraltılır); editörde "Include Admin API" altında işlem kutuları. Python modül testi kapalı işlemlere göre yazılır (create kapalıysa kayıt servisle eklenir, kapalı uçlar 404 / 405 testi). Kanıt: scratch host'ta `list+getOne` ve `list+create+delete` modelleri → 13 test, ruff / format / lint-imports temiz; StockExchange'te IP blacklist (list / create / delete) ve Audit log (list / getOne).
   - ✅ **Hook'ta istek sahibi:** `core/crud/actor.py` (`current_actor()` / `set_current_actor()`, contextvar); üretilen router'ın `_service` bağımlılığı (`async`, `AdminDep`) yazar. IP blacklist `createdBy` bununla. .NET'te hook'lar DI ile `ICurrentUser` alabiliyor, Express'te request context var; ikisinde şablon değişmedi (gerekirse aynı adla eklenir).
   - ✅ **ruff TC001:** Generator sorunu değildi: iskelet `pyproject.toml` TC001–003'ü zaten yok sayıyor; StockExchange'in ruff ayarına aynısı eklendi.
   - Üretilen modül testi StockExchange'te iskeletin fixture'larıyla koşuyor: `tests/conftest.py`'ye `mock_db` ve `make_token` eklendi (StockExchange'in auth'u kullanıcıyı DB'de aradığı için `make_token` `find_by_id`'yi yamalıyor).
   - Kapılar StockExchange ilerledikçe kırılmasın diye: `python-import` içe aktarma konusu 12 ekran dışındaki `ohlcv_discontinuity_alerts` (elle yazılmış kalır), generated / importable ayrımı manifest'ten; `python-bootstrap` registry'yi StockExchange manifest'inden render eder.

14. **PY-R 3.4–3.5'ten (2026-10-24):**
   - ✅ **`access.computed`** (okurken hesaplanan alan, ör. watchlist canlı fiyatı): saklanmaz, create / update gövdesinde, filtrede ve sıralamada yok, satırda opsiyonel; modülün `map_rows` hook'u doldurur. Python (gövde, filtre, `sort_fields`, `map_create`, satır, modül testi `NOT_SORTABLE`), admin config (`readonly`, `sortable: false`, filtre yok), Express (filtre yok, `isReadonly`), .NET (filtre / sıralama / gövde yok), editörde "Computed" sütunu. **Açık:** Express mongoose şeması ve .NET entity'si alanı hâlâ saklanan alan gibi tanımlıyor (Express'te yazılmaz; .NET'te kolon oluşur): o stack'lerde ilk kullanımda `[NotMapped]` / şemadan çıkarma.
   - ✅ **`access.detailOnly`** (PY-R 3.6, Deep Dive `analysis` ~106 KB / doküman): liste okumasında projeksiyonla dışarıda, liste satırında `null`, getOne döner. Python (`detail_only_fields`, `list_projection()` asset'te, satır opsiyonel, modül testi `DETAIL_ONLY`), Express (servis `getAllPaginated` `projection: '-alan …'`, hidden dahil), .NET (`CrudServiceBase.ListRow` varsayılan `Row`; modülde `Projections.ListRow` alanı `null`, satır tipi nullable), admin config (tabloda kolon yok), editörde "Detail only". Kapıda: `fixtures/dotnet/models.json` `Documents.content` detailOnly (.NET build + test, Python golden host); Express ayrıca elle (kalan host'ta `title` detailOnly → iki serviste projeksiyon, typecheck 0, test PASS; HTTP adımı port çakışması yüzünden koşmadı). İlk denemede 3.4'te geri alınmıştı (1:N snapshot dizisi ayrı collection'a gitti); 1:1 gövde için doğru araç bu.
   - ✅ Uzun adlarda ruff biçimi: `map_create`'te uzun koşullu ifade üç satıra, şemada uzun alan satırının varsayılanı parantez içine (`classFieldLine`, `dictEntry`).
   - ✅ `python-host.mjs preview --json`: ayrıştırılan model JSON (düzenleyip `model` ile yazmak için; domain sınıfı entity adından farklıysa).

15. **PY-R 3.8–3.10'dan (2026-10-24):**
   - ✅ Modül testi şablonu (`test_admin_crud.py.hbs`): update testindeki getOne kontrolü `adminOps.getOne` ile koşullu; `getOne` kapalı, update açık ekranlarda (StockExchange Providers / Markets: `list, update`) test 404 alıyordu. `python-e2e --no-parity` PASS.
   - Generator'ı bükmeden host'ta düzeltilenler (bilgi): alt objede hex metin reference ve iki seviyeli alt obje (`markets.providers.quote.*`) yerine düz ObjectId alanlar; `symbols.marketId` ObjectId'e migration. Reference = ObjectId kuralı (K1) korunuyor.
16. **PY-R 3.7'den (2026-10-24):**
   - ✅ Modül testi (`pythonTestContext.ts`): create / update gövdesinde olmayan (readonly, hiddenFromCreate / hiddenFromUpdate) **reference** alanı için `INVALID_CREATE` / `NOT_UPDATABLE` örneği `refs["<alan>"][i]` yazılıyordu; bu listeler modül seviyesinde sabit, `refs` ise fixture: test dosyası import'ta `NameError` veriyordu (StockExchange Deep Dive prompts `updatedBy`: readonly reference → `users`). Artık sabit bir hex id (`bodylessSample`; değer önemsiz, alan gövdede yok → 400). Kapıya örnek: `fixtures/python/py6-kinds.models.json` `Orders.approvedById` (readonly reference → `Users`). `python-e2e --no-parity` PASS (regen-python 64, python-bootstrap 23, python-import 83).
   - Bilgi (Generator'da değişiklik yok): tekil doküman ekranı için ayrı bir "singleton" modu eklenmedi; `api.adminOperations: [list, update]` + K router'da aksiyonlar yetiyor. Host'taki ad farklı mevcut unique index (`uniq_prompt_key`) yüzünden alan Generator'da unique işaretlenmedi (taban `uniq_<alan>` adıyla aynı anahtara ikinci index açmaya çalışırdı); create kapalı olduğu için 409 kontrolü gereksiz, index K'de.

## 8. StockExchange geçişi

Hatlar:

1. **FE (bağımsız):** StockExchange `documents/admin-base-integration-plan.md`; sayfalar adapter ile `ResourcePage`'e, `/symbols` sayfası dahil.
2. **Generator:** PY1, sonra PY4–PY8.
3. **StockExchange BE:** PY3 ✅ (`SubscriptionPlans` elle) → resource döngüsü → PY2c.

| Grup | Resource'lar | Yaklaşım |
| --- | --- | --- |
| A — gerçek CRUD | SubscriptionPlans (PY3), IpBlacklist, Symbols (lookup ve toplu ekleme aksiyon), Markets ve Providers (yalnızca update), DeepDivePrompts (yalnızca update; "varsayılana sıfırla" aksiyon; `revision` / `updatedBy` `before_update`'te), Users + UserSubscriptions (en son: şifre, rol, impersonate) | Tamamen üretilir; özel kurallar hook / servis'te |
| B — pipeline'ın yazdığı veri | AuditLogs, ScheduledReports, DailyReportWatchlist, DeepDiveReports, MarketPulseItems, OhlcvDiscontinuityAlerts | Liste + sil üretilir; cascade silme `after_delete`, canlı fiyat `map_rows`, CSV export `admin_router.py` |
| C — CRUD değil | metrics, jobs, screen, evren export'u, fundamentals, ohlcv-bars, dashboard, log sayfaları | İlgili özellik modülünün `admin_router.py`'sinde elle |

Resource başına döngü (her adım ayrı commit):

1. Pydantic modeli Generator'a içe aktarılır (K1, PY7: model listesinde "içe aktar"; rapordaki okumayı bozan veri önce migration ile düzeltilir); entity adı §4.1'den; admin ayarları verilir.
2. Generate: G dosyaları; ilk seferde `model.py`, `repository.py`, `hooks.py` (K). FE: `<m>.generated.config.ts`.
3. Mevcut repository `repository_generated.py` tabanının alt sınıfına döner; CRUD tabana bırakılır, özel sorgular kalır; iş kuralları `hooks.py` / `service.py`'ye.
4. API ve job testleri; parity profili (K15).
5. FE: resource adapter'dan çıkarılır, `createAtaRestProvider`'a geçer; elle yazılmış config silinir.
6. CRUD'a geçen eski admin uçları, adapter girdisi ve Redux kodu silinir.

Bağımlılıklar:

```
PY1 (Generator geneli) ───────────────────┐
                                           ▼
PY2 ✅ ──► PY3 ✅ (elle örnek) ──► PY4 ──► PY5 ──► PY6 ──► PY7 ──► PY8 ──► A grubu ──► B grubu ──► PY2c (en son)
  └──► PY2b ✅                                                     └──► PY9 (Python düğmesi)
PY9 (.NET ipucu, Express düğmesi): sıradaki iş
PY10 DB0 (spike): PY9 (.NET / Express) ile paralel
PY10 DB1–DB6: PY9 (Python düğmesi) sonrası; DB5 PY9'un penceresini ve ipucunu genişletir
```

PY5, PY1'in tip bilgilerini ve kısıtlarını kullanır. §7.1 / §7.2 açıkları PY4–PY5'i engellemez; VPS migration'ları (7.2 madde 1) StockExchange'in bir sonraki deploy'undan önce yapılmalı.
