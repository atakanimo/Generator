# Doğrulama

Betikler `scripts/verify/` altında. Generator'ın arayüzle aynı çağrılarını esbuild ile paketleyip headless çalıştırırlar (`_*-entry.ts` paket girişleri). Çıktılar `scripts/verify/out/` altına yazılır (gitignore). Model ayarları `scripts/verify/fixtures/varlik360.manifest.v3.json`'dan gelir.

## Golden set

Varlik360 BE: `/Users/atakanatabey/Projects/VarlikALL/Varlik360/src/modules/**/*.model.ts`. Her model crash'siz parse edilmeli ve dolu `fields` üretmeli (boş `fields` = hata).

15 modül: `app-version-configs`, `audit-log`, `daily-fx-rates`, `daily-portfolio`, `fund-daily-metrics`, `ip-blacklist`, `notifications`, `subscriptions`, `symbol-types`, `symbols`, `transactions`, `user-asset-categories`, `user-subscriptions`, `user-watch-list`, `users`.

**Gerçek Varlik360 klasörüne yazılmaz.** Regen betikleri kopya üzerinde çalışır (`out/regen/<etiket>/`). İstisna: `admin-config-check` `apps/admin` içinde geçici bir klasör açıp siler; `migrate-module` bilerek Varlik360'a yazar (yalnızca taşıma işinde).

## Betikler

| Komut | Kontrol | Süre |
| --- | --- | --- |
| `node scripts/verify/test-core-assets.mjs` | Core asset birim testleri (`toWire`, `extractListPagination`, id / sort eşlemesi, gizli alan strip, auth scope, `dateOnlyRangeFilter`, ortak hook yardımcıları `service-hooks`, update `null` → `$unset` `merge-patch`) | saniyeler |
| `node scripts/verify/smoke-varlik360.mjs` | Golden set: parse → field kind → model editörü taslağı → `model.hbs` | saniyeler |
| `node scripts/verify/admin-config-check.mjs [--keep]` | Bütün modeller → admin config, `apps/admin` içinde `tsc` + eşleme kontrolleri | ~1 dk |
| `node scripts/verify/regen-varlik360.mjs --manifest` | Manifest v3 round trip; eski manifest yok sayılır, tercihler korunur, bir kez yedeklenir | saniyeler |
| `node scripts/verify/regen-varlik360.mjs --p5` | Model başına `api` + hidden / adminOnly round trip, dosyadan API tespiti, yeni model route kuralları, enum / default | saniyeler |
| `node scripts/verify/regen-varlik360.mjs --resave-models [etiket]` | Model editörü yolu (`loadModelDraft` → `updateModel`) | dakikalar |
| `node scripts/verify/regen-varlik360.mjs <etiket> --planned --core-overlay` | Kopyaya 15 modül update mode'da üretilir, Varlik360'a göre drift, kopyada `tsc --noEmit` | uzun; arka planda çalıştır |
| `node scripts/verify/regen-varlik360.mjs --compare <sol> <sağ>` | İki regen etiketi arasında dosya farkı (`<sol>..<sağ>.patch`); 0 = aynı | saniyeler |
| `node scripts/verify/regen-varlik360.mjs --core-assets <etiket> [assetDir]` | Host kopyasında core asset'ler değiştirilip `tsc` | dakikalar |
| `node scripts/verify/express-py1-e2e.mjs [--keep]` | PY1 biçimleri Express'te: `Reminders` fixture modeli (`fixtures/dotnet/models.json`) Varlik360 kopyasına üretilir, `src/app.ts`'e bağlanır, kopyada `tsc` (yalnız yeni modülün çeviri anahtarları hariç), Docker'da Mongo + HTTP uygulaması → `dotnet-py1-formats-smoke.mjs` (.NET ile aynı 17 senaryo). Docker gerekir | ~1 dk |
| `node scripts/verify/migrate-module.mjs <m> --ops list,getOne,… [--no-admin] [--no-auth] [--be-only\|--fe-only]` | Bir modülü arayüzle aynı çağrılarla taşır (manifest kaydı + BE + FE config). **Varlik360'a yazar** | saniyeler |

`--planned`: plandaki işlem setleri, gizli alanlar ve `users` için `self` + adminOnly birleşik modele uygulanır. `--core-overlay`: güncel şablonların istediği core asset'ler kopyaya önce kopyalanır. `out/regen/` altında karşılaştırma tabanı olarak son geçerli etiket saklanır (bugün `gate7`).

## Kapılar

| Değişiklik | Kapı |
| --- | --- |
| Her değişiklik | Generator `npx tsc --noEmit -p tsconfig.json`: `src/generator-assets` dışı hata sayısı artmaz (bugün 3). `npm run build:electron` başarılı |
| Parser, `modelCreator`, `mongooseModelContext`, field kind / token, `normalizedModel*`, `modelMerge`, manifest | smoke 15 / 15, `--manifest`, `--p5`, `--resave-models` + `--compare` |
| BE şablonları / `BackendGenerator` | `express-py1-e2e` (tip bilgileri, kısıtlar, `traceId`); regen `--planned --core-overlay` → tabana göre `--compare` yalnızca beklenen fark, kopyada `tsc` artmaz, custom blok içerikleri birebir |
| Core asset'ler | `test-core-assets` + `--core-assets` |
| Admin config | `admin-config-check` |
| `packages/admin-base` | `npm run typecheck`, `npm test`, `npm run build` |
| .NET üreticisi (`dotnet-efcore/`, şablonlar, asset'ler, parser, `dotnetBackend.ts`) | `regen-dotnet.mjs`, sonra `dotnet-e2e.mjs` (arka planda) |
| Python CRUD katmanı (StockExchange `core/crud`, `core/http/contract.py`, `modules/*/…_generated.py`) | StockExchange `pytest tests/core/crud tests/modules/<m>`, sonra `dotnet-e2e.mjs --python-only` |
| Python üreticisi (`python-fastapi/`, `templates/backend-python-fastapi/`, `generator-assets/python-fastapi/**`, `pythonBackend.ts`) | `python-e2e.mjs` (ya da hızlı döngüde `regen-python.mjs --no-docker --no-stockexchange`, `python-bootstrap.mjs`); asset ya da şablon değiştiyse StockExchange'e aynı kopya / yeniden generate + yukarıdaki satır |
| Python parser / içe aktarma / rapor (`parsers/python/**`, `pythonBackend.ts` PY7 kısmı, Python taraması) | `python-import.mjs`; tarama değiştiyse `regen-dotnet.mjs` (uygulama akışı) ve smoke |
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

Ayrıntı: [backend/dotnet-efcore.md](backend/dotnet-efcore.md). `dotnet-e2e` fixture host'unda `dotnet-py1-formats-smoke.mjs` de koşar (`Reminders`: sayısal enum açık değerleri, sadece tarih, kısıtlar, e-posta, `traceId`). Çıktılar `scripts/verify/out/dotnet/<etiket>/`. Model kaynakları `scripts/verify/fixtures/dotnet/models.json` (EventTypes, Documents, MembershipPlans, Templates, Users, UserNotes: bütün kind'lar, ilişkiler, ownership), golden set (`varlik360.manifest.v3.json`) ve Python eşliği için `scripts/verify/fixtures/python/subscription-plans.models.json` (`python-parity/` host'u). `models.json` aynı zamanda Python golden set'i (PY6): `dotnet-e2e` ondan bir Python host'u üretir (`python-golden/`) ve `models/` host'uyla karşılaştırır.

| Komut | Kontrol | Süre |
| --- | --- | --- |
| `node scripts/verify/regen-dotnet.mjs [etiket] [--db postgres\|sqlserver\|mongodb] [--id uuid-v7\|objectid]` | Seçilen veritabanı sağlayıcısı ve id tipiyle (varsayılan `postgres`, `uuid-v7`; `objectid` yalnız `mongodb`) boş host, fixture, golden set ve `python-parity`: `dotnet build` 0 uyarı 0 hata, `dotnet test`, ikinci generate hiçbir şey yazmaz; parser gidiş-dönüşü; uygulama akışı (bootstrap → tarama → model editörü → generate → notlar → admin uç yolu → ilişki alanları); .NET modellerinden admin config + admin-base tiplerine karşı `tsc` | ~1 dk |
| `node scripts/verify/dotnet-e2e.mjs [etiket] [--db postgres\|sqlserver\|mongodb] [--id uuid-v7\|objectid] [--no-parity] [--skip-regen] [--python-only]` | `regen-dotnet --db --id` + fixture host'a migration (MongoDB'de yok: açılışta index'ler) + `dotnet run` → D2 / D3 / D4 / D0 smoke'ları; Docker'da Mongo + Varlik360 HTTP uygulaması ile golden host arasında `contract-parity.mjs`; aynı Mongo'da StockExchange API'si ile `python-parity` host'u arasında `contract-parity.mjs --suite subscription-plans`; `fixtures/dotnet/models.json`'dan üretilen Python host'u (`python-golden/`, boş `py_golden` veritabanı, StockExchange'e yazmaz) ile `models/` host'u arasında `--suite golden-models`. Her suite'in senaryo listesi `out/dotnet/<etiket>/parity-<suite>.log`. `--python-only`: yalnız iki Python suite'i (host'lar önceki `regen-dotnet`'ten; eskiyse önce tam koşu) | ~4–5 dk (`sqlserver` ~6 dk, `mongodb` ~2 dk); arka planda |
| `node scripts/verify/dotnet-d0-smoke.mjs` (ve `-d2-documents`, `-d3-relations`, `-d4-ownership`) | Çalışan bir host'a karşı tek tek (`API_BASE`, `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`); D2–D4 boş tablo bekler | saniyeler |
| `node scripts/verify/contract-parity.mjs [--suite symbols \| subscription-plans \| golden-models]` | Aynı senaryolar iki host'ta (`symbols`: Express ve .NET, 43 senaryo; `subscription-plans`: Python ve .NET, 53 senaryo; `golden-models`: Python ve .NET, 60 senaryo: reference + populate, ilişki kontrolü, decimal, map / json, obje, hidden. Üç suite'te de update `null` kuralı (api-contract §5): gönderilmeyen alan değişmez, opsiyonel alana `null` temizler, zorunlu alana `null` 400; temizlendi / korundu değer olarak da kontrol edilir); şekil karşılaştırması, bilinen farklar betikte gerekçeli, KNOWN satırı farkı da yazar | saniyeler |

Gerekenler: .NET 10 SDK, yerel Postgres (`PG_HOST`, varsayılan `/tmp` soketi; kullanıcının veritabanı oluşturma yetkisi), eşlik ve `--db sqlserver` / `mongodb` için Docker (OrbStack; SQL Server: `mcr.microsoft.com/mssql/server:2022-latest`, amd64 emülasyonu, her koşuda yeni `gen-e2e-mssql` konteyneri :14330; MongoDB: .NET host'ları için ayrı `gen-e2e-mongo-dotnet` :27030; ikisi de sonunda silinir; smoke'lar id biçimini `ID_TYPE` ile `scripts/verify/_smoke-ids.mjs`'ten alır), `node_modules`'lı Varlik360 (`VARLIK360`) ve uv ile kurulabilen StockExchange (`STOCKEXCHANGE`). Express tarafı `scripts/verify/fixtures/express-parity-host.ts` ile yalnızca HTTP uygulaması olarak açılır (job, Firebase, gerçek `.env` yok); Varlik360 kaynağına yazılmaz. Python tarafı StockExchange'in `.venv` python'uyla açılır (`alpha_parity` veritabanı, `scripts.parity_seed_users` ile sabit id'li admin ve normal kullanıcı); StockExchange kaynağına yazılmaz. `regen-dotnet`'in admin config adımı, `admin-config-check` gibi Varlik360 `apps/admin` içinde geçici bir klasör açıp siler.

Bilinen: `regen-varlik360 --p5` iki tespit senaryosunda FAIL (Symbols, AppVersionConfigs); HEAD'de de aynı, .NET işinden bağımsız.

## Python + FastAPI

Stack dokümanı ve kararlar: [backend/python-fastapi.md](backend/python-fastapi.md). Ortak katman asset'leri (`src/generator-assets/python-fastapi/core/**`) kaynak, StockExchange'in `src/alpha_terminal/core/` kopyaları onlarla bayt bayt aynı tutulur.

| Komut | Kontrol | Süre |
| --- | --- | --- |
| `node scripts/verify/python-e2e.mjs [etiket] [--no-docker] [--no-stockexchange] [--no-parity] [--reuse-dotnet] [--only=<kapı,…>]` | PY8 giriş kapısı: sırayla `regen-python`, `python-bootstrap`, `python-import`, sonra `regen-dotnet <etiket>` (atla: `--reuse-dotnet`, host'lar varsa) + `dotnet-e2e --python-only` (`contract-parity` `subscription-plans` ve `golden-models`). Her kapının PASS sayısı ve FAIL satırları tek özette; tam çıktılar `out/python-e2e/<kapı>.log`, parity senaryoları `out/dotnet/<etiket>/parity-<suite>.log`. `--no-docker` parity'yi de atlar | ~6–8 dk; arka planda |
| `node scripts/verify/python-bootstrap.mjs [--keep] [--no-stockexchange]` | Geçici boş klasörde `bootstrapPythonProject` (IPC'nin çağırdığı fonksiyon): dosya sayısı, manifest `backendStack: python-fastapi`, token kalmadı; ikinci bootstrap hiçbir şey yazmaz, ikinci proje kurulumu reddedilir; `uv sync`, `api.main` + `worker.main` import'u, `ruff check`, `lint-imports`, iskelet `pytest`; Mongo kapalıyken `uvicorn` → `/api/v1/health` 200, sözleşme zarfı, `X-Request-Id` / `X-Trace-Id` yansıması; asset'ler host kopyası ve StockExchange ile bayt bayt aynı, iskeletin `test_crud.py`'si ve `subscription_plans` için üretilen registry StockExchange'tekiyle aynı. Başarısızlıkta geçici klasör bırakılır | ~10 sn (uv önbelleği doluysa) |
| `node scripts/verify/regen-python.mjs [--no-docker] [--no-stockexchange]` | PY5 / PY6 modül üreticisi. (a) Boş host (`out/regen-python/host`): bootstrap → `fixtures/python/subscription-plans.models.json` + `py5-kinds.models.json` (`Contacts`: int / float, sayısal enum, enum dizisi, e-posta + desen, sadece tarih, opsiyonel unique, obje ve obje dizisi) + golden set `fixtures/dotnet/models.json` (reference + populate, decimal, map / json, hidden, adminOnly) + `py6-kinds.models.json` (`Orders`: access bayrakları, readonly reference, alt alanda decimal / reference / iç içe obje) model editörü yolundan (`writePythonModel`: manifest satırı + generate) → her modülün G + K dosyaları ve üretilen modül testi (PY8, `tests/modules/<m>/test_admin_crud.py`) → ikinci generate hiçbir şey yazmaz, K dosyası düzenlemesi korunur → `uv sync`, import, `ruff check`, üretilen modüllerde ve modül testlerinde `ruff format --check`, `lint-imports`, üretilen modül testleri tek başına (`pytest`, hiçbiri skip değil), sonra bütün `pytest` (iskelet + modül testleri + `fixtures/python/tests/test_<m>_cases.py`: genel şablonun ifade edemediği golden set davranışı — çapraz modül populate şekilleri, `Decimal128` saklama, iç içe türler, e-posta + desen) → Docker'da geçici `mongo:7` + `uvicorn` ile HTTP smoke (CRUD, 401, 409, 400, 404, tarih filtresi; PY6: decimal range / sıralama ve `Decimal128` saklama — mongomock yapamıyor —, populate, eksik ilişki 400, gizli alan). (b) StockExchange kopyası (`out/regen-python/stockexchange`, `pyproject.toml` + `src/`; gerçek repoya yazılmaz): `SubscriptionPlans` üretilir; yalnız G dosyaları ve manifest değişir (K, asset, registry aynı), her G dosyası StockExchange'tekine ya da onun `ruff format` çıktısına eşit, ikinci generate boş. 64 kontrol | ~45 sn |

| `node scripts/verify/python-import.mjs [--no-docker] [--no-stockexchange]` | PY7 Pydantic içe aktarma (uygulamanın çağırdığı `scanProject`, `previewPythonImport`, `importPythonModel`, `loadModelForEditor`). (a) Boş host + `fixtures/python/import` (`catalog_items/model.py`: takma adlar, başka modülden import, `Literal` / `StrEnum` / `IntEnum`, `Annotated` kısıtları, `constr` / `conint`, iç içe obje ve obje dizisi, `map`, opak obje, decimal varsayılanı, kalıtım; `CatalogItemsBad`: `bytes` / `UUID` reddi): tarama `importable` → alan alan parse beklentileri → reddedilen sınıf manifest'e yazılmaz → içe aktarma → tarama `generated` → şema tasarımcısı yüklemesi → ikinci generate boş, ikinci içe aktarma reddi → `uv sync`, `api.main` import'u, `ruff check` / `format --check`, üretilen doküman modeli fazladan anahtarı reddeder. (b) Gidiş-dönüş: `regen-python` fixture modelleri üretilir, her `model_generated.py` geri okunur, dosyaya ait kısımlar manifest'le aynı (bilinen kayıplar betikte). (c) StockExchange kopyası (`out/python-import/stockexchange`): tarama, 14 entity modeli reddedilen alan olmadan okunur, `IpBlacklist` içe aktarılır → yalnız G dosyaları, yeni `hooks.py`, registry'ler ve manifest değişir; notlar uyarlanacak K dosyalarını sayar; `ruff`, StockExchange venv'iyle import, ikinci generate boş. (d) Gerçek StockExchange verisi (**salt okunur**, `config.env`'deki yerel Mongo): `ip_blacklist` raporu; üretilen satır modeli aynı dokümanlarda raporun söylediği kadar başarısız; StockExchange `git status` önce / sonra aynı. Mongo kapalıysa raporun bunu söylediği kontrol edilir. (e) Docker'da geçici `mongo:7` + fixture dokümanları: fazladan anahtar (üst seviye / alt obje / obje dizisi), eksik zorunlu, tipi uymayan, metin tarih satırları; kapalı sunucu, ayarsız klasör, uzak sunucu (izin yok, kimlik bilgisi çıktıda yok) `ok: false` + neden; veri değişmedi. 94 kontrol | ~30 sn |

Gerekenler: uv, Python 3.12 (uv bulur ya da indirir), StockExchange (`STOCKEXCHANGE_ROOT`, varsayılan `~/Projects/VarlikALL/StockExchange`; yoksa `--no-stockexchange`). Rapor betiği host'un `.venv`'indeki PyMongo'yu kullanır (fixture raporu için StockExchange'in venv'i).

## İstemci veri katmanı

Ayrıntı: [frontend/client-data-layer.md](frontend/client-data-layer.md).

| Komut | Kontrol | Süre |
| --- | --- | --- |
| `node scripts/verify/regen-client.mjs [--adopt] [--keep]` | Varlik360 manifest'i + model dosyaları → mobile'ın 8 modülü (`redux-rn`), Varlik360 `apps/mobile` içinde geçici kopyada (`.gen-client-check/`, iş bitince silinir): operasyonlar = `resolveNormalApi`, var olan dosyalara dokunulmaz, ikinci generate hiçbir şey yazmaz, mobile `tsc` tabanı (2) artmaz, uzantı sözleşmesi derlenir (genişletilmiş state, kendi thunk'ını dispatch eden hook), reducer'lar gerçek store'da sahte `API` ile (append, update merge + populate korunur, delete `meta.arg`, hata state'i bozmaz). Üretilenler `scripts/verify/out/client/`. `--adopt`: eski üretilmiş servis / thunk / slice'lar stub'la değişince ekranlarda kalan `tsc` hataları (bilgi; C3 iş listesi) | ~15 sn |
