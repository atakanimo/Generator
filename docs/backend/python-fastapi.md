# BE: Python 3.12 + FastAPI + MongoDB

Üretici `src/main/generators/python-fastapi/`, şablonlar `src/main/templates/backend-python-fastapi/module/*.py.hbs`, core asset'ler ve iskelet `src/generator-assets/python-fastapi/**`, parser `src/main/parsers/python/`, uygulama tarafı `src/main/ipc/pythonBackend.ts`. Girdi NormalizedModel v2 + manifest v3, çıktı [api-contract.md](../api-contract.md). Express ve .NET üreticileriyle kod paylaşılmaz; ortak olan NormalizedModel, manifest, sözleşme ve admin config. Kararlar: [§ Kararlar](#kararlar).

Stack: Python ≥ 3.12, FastAPI, Pydantic v2, pydantic-settings, MongoDB (PyMongo Async, `pymongo.AsyncMongoClient`; sürücü yalnız `core/db.py`), PyJWT (HS256), structlog, APScheduler (worker). Paket yöneticisi uv (`uv.lock`), derleme hatchling. Geliştirme: pytest + pytest-asyncio + httpx (in-process istemci) + testcontainers (gerçek test Mongo'su), ruff (lint + format, satır 110), import-linter (katman yönü). Kimlik her zaman Mongo `_id` (ObjectId), JSON'da `id` hex string. Yalnız admin API üretilir (normal API ayrı plan).

## Yeni proje

Gerekenler: [uv](https://docs.astral.sh/uv/), Python 3.12 (uv kurar), çalıştırmak için MongoDB (yerelde `docker run -d -p 27017:27017 mongo:7`). Generator reposunda `npm install` yapılmış olmalı (betik esbuild kullanır).

Arayüzde: Project Location kartında **Yeni Python projesi** → boş klasör + uygulama adı → `project:bootstrapPython` (klasörde `pyproject.toml` varsa reddedilir); klasör açılır ve taranır. Düğmenin yanındaki bilgi ikonu klasör yapısını (G / K / asset), teknolojileri ve aşağıdaki komutları gösterir (tek tanım: `src/shared/backendStacks.ts`). Komut satırından aynı fonksiyonlar `scripts/python-host.mjs` ile (IPC `project:bootstrapPython` / `createModel` / `generateBackend`):

```bash
# 1. Boş klasörde host: iskelet + core asset'ler + manifest (backendStack: python-fastapi)
node scripts/python-host.mjs bootstrap ~/Projects/Orders OrdersApi     # paket: orders_api

# 2. Ayarlar ve bağımlılıklar
cd ~/Projects/Orders
cp .env.example .env            # JWT_SECRET en az 32 karakter; MONGO_URI / MONGO_DB_NAME
uv sync                         # .venv + uv.lock
uv run pytest -q                # iskelet testleri (sağlık, auth, CRUD çekirdeği, worker)

# 3. Model ekle: Generator'da klasörü aç → model editörü → kaydet (generate eder),
#    ya da NormalizedModel JSON'u (dizi ya da tek model) ile:
node <generator>/scripts/python-host.mjs model ~/Projects/Orders models.json
#    Elle yazılmış modülü içe aktarma (arayüzdeki "İçe aktar" ile aynı fonksiyonlar):
node <generator>/scripts/python-host.mjs list ~/Projects/Orders                       # generated / importable
node <generator>/scripts/python-host.mjs preview ~/Projects/Orders src/orders_api/modules/x/model.py [Sınıf] [--report]
node <generator>/scripts/python-host.mjs import ~/Projects/Orders src/orders_api/modules/x/model.py [Sınıf]
node <generator>/scripts/python-host.mjs show ~/Projects/Orders X > x.json            # düzenle → model ile geri yaz

# 4. Üretilen modülün kendi testi ve kontroller
uv run pytest -q tests/modules/<modül>
uv run ruff check src tests && uv run ruff format --check src/<pkg>/modules tests/modules && uv run lint-imports

# 5. Çalıştır
uv run uvicorn orders_api.api.main:app --reload          # http://localhost:8000/api/v1/health
uv run python -m orders_api.worker                       # job'lar (APScheduler)
```

Admin uçları `POST /api/v1/admin-crud/<route>/get-all`, `GET …/{id}`, `POST …/create`, `POST …/update/{id}`, `DELETE …/{id}`; `Authorization: Bearer <JWT>`; kullanıcı her istekte DB'den okunur, admin = DB'deki `role === "admin"` (env yok; [auth.md](auth.md)). Mongo kapalıyken uygulama açılır, sağlık ucu `mongoConnected: false`, CRUD uçları 503. Açılışta Mongo bağlıysa unique index'ler kurulur (`api/indexes_generated.py`). Model değişince yeniden generate: editörde kaydet ya da `node scripts/python-host.mjs generate <dir>`.

## Çağrı zinciri

```
Arayüz → IPC (src/main/index.ts; manifest backendStack / sourceType 'python-fastapi')
  project:bootstrapPython      → bootstrapPythonProject (pyproject.toml varsa reddeder) → iskelet + asset'ler + boş registry'ler
  project:scan                 → projectScanner: pyproject.toml + src/<pkg>/core → listPythonModels
  project:createModel / updateModel → writePythonModel (taslak manifest satırı, sonra generate)
  project:loadModelDraft / parseModel → manifest satırı (+ dosya hash'i)
  project:generateBackend      → generatePythonBackend → generatePythonModules(root, pkg, manifest'in bütün modelleri)
  project:previewPythonImport / importPythonModel → Pydantic içe aktarma (aşağıda)
```

`generatePythonModules`:
1. Core asset'ler (yoksa) kurulur; iskelet yazılmaz (bootstrap'ın işi; var olan host'a yeni iskelet dosyası düşmez).
2. `buildPythonModuleContexts(pkg, models)`: bütün modellerin bağlamı birlikte (reference hedefin tiplerini bilmeli). Kararlar `pythonContext.ts`'te, modül testi değerleri `pythonTestContext.ts`'te; şablonlar yalnız hazır satırları basar.
3. Modül başına G ve K dosyaları, sonra iki registry (`api/routers_generated.py`, `api/indexes_generated.py`) tam listeden. İçeriği değişmeyen dosyaya yazılmaz.

Model kaynağı manifest'tir (K1): satırın `sourceRelativePath`'i modülün `model_generated.py`'si. Python dosyası yalnız bir kez, içe aktarmada okunur.

## Host düzeni

Modüler monolit, modül klasörü entity başına (`modules/<collection>/`). `<pkg>` = uygulama adının snake_case'i.

```
pyproject.toml  uv.lock  .python-version  .env.example  .gitignore  .generator/manifest.json
src/<pkg>/
  core/  config.py (K)  db.py (K: sürücü yalnız burada)
         crud/  http/  errors/            (asset: ListBody, filtreler, sıralama, sayfalama, CrudRepository, CrudService,
                                           ServiceHooks, to_wire, decimal / ref / patch tipleri, mesajlar, zarf, AppError)
  modules/<collection>/                   (aşağıdaki tablo)
  api/   main.py (K: create_app)  deps.py (K: JWT, AdminDep, DbDep)
         routers_generated.py (G: ADMIN_CRUD_ROUTERS)  indexes_generated.py (G: ensure_crud_indexes)
  worker/ main.py (K: register_jobs)  __main__.py
tests/   conftest.py (test Mongo, client, make_token, mock_db, mongo_client)  test_health.py  api/  core/crud/  worker/
         modules/<collection>/test_admin_crud.py (K, modül testi)
```

Katman yönü `api/`, `worker/` → `modules/` → `core/`; `pyproject.toml`'daki import-linter sözleşmesi denetler (`uv run lint-imports`). Üretilen admin router'ları `api.deps`'ten `AdminDep` / `DbDep` alır (sözleşmede istisna). Modüller birbirinin yalnız `service` / `model`'ini import eder.

Adlar (K21): entity çoğul PascalCase (verildiği gibi), klasör = collection = `snake_case(entity)`, route `/admin-crud/<kebab-case>` (geçiş öneki, plan K6), enum sınıfı `<Entity><Alan>`, router fonksiyonları `list_<klasör>` / `get_<tekil>` …

## Üretilen modül dosyaları

| Dosya | Tür | İçerik |
| --- | --- | --- |
| `model_generated.py` | G | Pydantic doküman modeli (`extra="forbid"`), `StrEnum` / `IntEnum`'lar, alt obje sınıfları |
| `schemas_generated.py` | G | `<E>Row`, `<E>Create`, `<E>Update` (JSON Merge Patch), `<E>Filters`, `<E>ListBody`, populate `…Ref` sınıfları |
| `repository_generated.py` | G | `<E>RepositoryBase(CrudRepository)`: collection adı, unique index'ler |
| `service_generated.py` | G | `<E>HooksBase(ServiceHooks)`, `<E>ServiceBase(CrudService)`: filtre / sıralama / unique / gizli alanlar, ilişki kontrolü, populate, `map_create`, `map_update` |
| `admin_router_generated.py` | G | admin CRUD uçları (`route_class=ContractRoute`); `api.admin === false` ise yok; yalnız `api.adminOperations` (yoksa hepsi, `list` hep); `_service` isteği yapanı `set_current_actor` ile yazar |
| `__init__.py`, `model.py` | K | `model.py` doküman modelini ve tipleri re-export eder, elle eklenenler burada |
| `repository.py` | K | `<E>Repository(<E>RepositoryBase)`: entity'ye özel sorgular |
| `hooks.py` | K | `<E>Hooks(<E>HooksBase)`: iş kuralları (`__init__(db)`) |
| `service.py` | K | `<E>Service(<E>ServiceBase)` + `build_<klasör>_service(db)`; API ve job'lar bunu çağırır |
| `tests/modules/<klasör>/test_admin_crud.py` | K | modül testi (aşağıda); yalnız admin uçları varsa ve host'ta `tests/` varsa |

`admin_router.py` (CRUD dışı admin uçları), `router.py` (public API), `jobs.py` üretilmez; elle yazılır ve `api/main.py` / `worker/main.py`'de bağlanır.

## Dosya sahipliği

- G dosyası `# <auto-generated by Generator />` ile başlar, her generate'te yeniden yazılır. Başlığı olmayan dosya kullanıcınındır; Generator atlar ve notta listeler. Python modül adında nokta olamayacağı için G dosyaları `*_generated.py`.
- K dosyaları ve asset'ler yalnız yoksa yazılır. Asset'ler bayt bayt kopyalanır, içleri göreli import'lu (`from .filters import …`); her host'ta aynı dosya. Asset'te düzeltme yalnız yeni host'lara gider; var olan host'a elle kopyalanır (plan dokümanına not düşülür).
- G / K dosyaları `ruff check` ve `ruff format` temiz (satır 110). Host kodu asset'leri mutlak yolla import eder (`<pkg>.core.crud`).

| İhtiyaç | Yer |
| --- | --- |
| Okurken hesaplanan alan (canlı fiyat, başka koleksiyondan gelen alan …) | modelde `access.computed` (`readonly` değil); `model_generated.py`'da yok, satırda `\| None = None`, filtre / sıralamada yok, export'ta var; değer `hooks.py` `map_rows` (tek toplu okuma, sıra korunur) |
| Listede okunmaması gereken ağır alan (analiz blob'u …) | modelde `access.detailOnly` (`detail_only_fields`; liste `None`, getOne dolu) |
| İş kuralı (doğrulama, varsayılan, yasak silme, cascade) | `hooks.py` (`before_*` / `after_*`, `map_rows`); isteği yapan admin `current_actor()` (`core/crud`, ör. `createdBy`) |
| Ek servis metodu, servis kurulumu | `service.py` |
| Özel sorgu | `repository.py` |
| CRUD dışı admin ucu | `admin_router.py` + `api/main.py` |
| Public uç | `router.py` + `api/main.py` |
| Job | `jobs.py` + `worker/main.py` `register_jobs` |
| Model ekleri (ör. hesaplanan alan) | `model.py` |

Elle yazılan (K) kod kuralları: [`.cursor/rules/backend-python-fastapi.mdc`](../../.cursor/rules/backend-python-fastapi.mdc).

## Servis ve hook'lar

`CrudService[TDoc, TRow, TCreate, TUpdate, TFilters]` (asset `core/crud/service.py`) list / get / create / update / delete gövdelerini taşır; modülün `service_generated.py`'si yalnız kendine özgü parçaları verir. Create / update sırası: `map_create` / `map_update` → `to_storage` (`Decimal` → `Decimal128`) → ilişki kontrolü (hedef yoksa 400) → unique (409; yarışta Mongo'nun ihlali de 409) → `before_*` → yaz → yeniden oku. Delete: `before_delete` → sil (arada başka istek sildiyse 404, `after_delete` çalışmaz) → `after_delete`.

Hook seti üç stack'te aynı (snake_case): `default_sort`, `before_list`, `before_get_by_id`, `before_create(doc, body)`, `before_update(current, changes, body)`, `before_delete(current)`, `after_create(row)`, `after_update(row)`, `after_delete(row)`, `map_rows(rows)`. `before_*` işlemi `AppError(code, message)` fırlatarak durdurur; `after_*` geri alınmaz. Hata modeli: `AppError` (`core/errors`), kodlar sözleşmedeki HTTP benzeri kodlar (`core/errors/common_codes.py`) + projeye özel 460–479 / 560–579 (host'un kendi `core/errors/codes.py`'si, K; plan K9); `ContractRoute` zarfa çevirir.

## Sözleşme eşlemesi

| Kind | Doküman / Mongo | Gövde / satır / filtre |
| --- | --- | --- |
| `string` | `str` | kısıtlar `StringConstraints` (`trim` → `strip_whitespace`, zorunlu metin `min_length=1`), `format: email` desen; filtre `regex` (büyük / küçük harf duyarsız "içerir", kaçışlı) ya da `eq` |
| `number` | `float`, `numberFormat: int` → `int` | `Field(ge, le)`; filtre `range` / `eq` |
| `decimal` | `Decimal128` | JSON'da string (sayı → 400), çıkış üstelsiz; filtre `range` / `eq` string sınırla |
| `boolean` | `bool` | filtre `boolean` |
| `date` | `datetime` (UTC); `dateFormat: date` → gün, Mongo'da UTC gece yarısı | satırda `….fffZ` / `YYYY-MM-DD`; filtre `date-range` |
| `enum` | değer (`StrEnum`; sayısal `IntEnum`) | filtre tek değer ya da dizi |
| `reference` | `ObjectId` (`RefId`) | gövdede id (bozuk 400, hedef yoksa 400); populate edilen alan list / getOne'da `{ id, ...alanlar }`, create / update'te id; filtre `reference` (eşitlik / `$in`; dizide "içerir"); m-n tekrarları bir kez saklanır |
| hedefsiz `reference[]` | `ObjectId` listesi | id, kontrol ve filtre yok |
| `object` (alanlı) / `object[]` | gömülü doküman | alt alan sınıfı (strict); alt alanda string / number / decimal / boolean / date / enum-metni / reference (kontrolsüz) / iç içe JSON |
| alansız `object`, `json`, `map` | düz JSON | `dict[str, JsonValue]`, `JsonValue`, `dict[str, T]` |
| skaler / enum dizisi | liste | `[]` (null değil) |

Diğer kurallar: gövdeler strict (`extra="forbid"`: bilinmeyen alan, `readonly` / `hiddenFromCreate` / `hiddenFromUpdate` alanı 400), liste `POST get-all` (`page ≥ 1`, `limit` varsayılan 50 / en çok 100, `sortBy` beyaz liste dışı 400, filtresi olmayan alan 400), varsayılan sıralama `createdAt desc, _id desc`, `hidden` alan satırda / filtrede / sıralamada / populate'te yok ve okumalarda projection ile hiç okunmaz, `adminOnly` admin gövdesinde yazılabilir. Zorunlu = `required && !nullable`; create'te varsayılanı olan ya da opsiyonel alan `null` kabul eder, varsayılanı `map_create` yazar. Opsiyonel unique alan boşsa dokümana yazılmaz (sparse index). Gövdeler Pydantic lax modunda (`"1"` → `1`).

## Export (CSV, PY12)

`api.adminOperations` `export` içeriyorsa (opt-in) admin router'a `POST …/export` gelir (api-contract §2 "Export"). Gövde `ExportBody[<E>Filters]` (strict; `filters`, `sortBy`, `sortOrder`, `fields`, `headers`), satırlar `CrudService.export_csv`: liste sorgusunun aynısı (filtre, `scope`, `before_list`, sıra, populate, `map_rows`), sayfasız, 50.000 üstü 400. Kolonlar `export_fields` (`id`, `hidden` olmayan alanlar sırayla, `createdAt`, `updatedAt`), ilişki kolonları `export_display` (populate edilen ilişkinin `reference.display`'i); ikisi de `service_generated.py`'de. Biçim asset `core/crud/export.py` (`cell_text`, `render_csv`, `export_filename`); dosya adı `kebabCase(entityName)-<YYYY-MM-DD>.csv`. Core asset'ler create-once: var olan host'a `export.py` gelir, `service.py` / `messages.py` / `__init__.py` değişikliği elle taşınır. Modül testi `test_export_csv`.

## Update ve `null` (JSON Merge Patch)

api-contract §5: gönderilmeyen alan değişmez; opsiyonel tekil alana `null` alanı siler (`$unset`; satırda `null`); zorunlu alana ve diziye `null` 400 (`NotNull[T]`, `core/crud/patch.py`); dizi `[]` ile boşalır. Kural tek yerde: `updateNullClears` (`src/shared/normalizedModel.ts`); üç stack ve admin-base 0.1.8 aynı.

## Modül testi

İlk generate'te her admin modülü için `tests/modules/<klasör>/test_admin_crud.py` (K) yazılır; sonra kullanıcınındır, model değişince yeniden yazılmaz (yeni alanlar için elle güncellenir ya da dosya silinip generate edilir). İskeletin `tests/conftest.py` fixture'larıyla (`client`, `make_token`, `mock_db`; gerçek test Mongo'su) kendi başına geçer: `uv run pytest tests/modules/<klasör>`.

Örnek değerler modelden üretilir (kısıt, desen, e-posta, enum, sayı biçimi; reference için test hedef collection'a iki doküman ekler). Kapsam: zarf ve auth (401 / 403, `traceId`), bütün create alanlarıyla create → getOne gidiş-dönüş (gizli alan dönmez), yalnız zorunlu alanlarla create → varsayılanlar ve `trim`, update (değişen alan, gönderilmeyen alan aynı), `null` kuralı, doğrulama (eksik zorunlu alan, bilinmeyen / readonly alan, kısıt, enum, format, bozuk id, var olmayan reference hedefi, filtrelenemeyen / sıralanamayan alan), unique (create ve update'te 409), liste (sayfalama, varsayılan sıralama, bir filtre, bir sıralama anahtarı), silme → 404. Modelin `pattern`'ine uyan örnek bulunamazsa dosya `pytestmark = skip` ile ve nedeniyle yazılır; `body()` / `minimal_body()` elle doldurulur. İş kuralı (hook) ekleyince ilgili beklentiler güncellenir.

## Pydantic içe aktarma (var olan proje)

Elle yazılmış Pydantic modeli bir kez manifest'e okunur (K1, PY7), sonra düzenleme Generator'da. Modül Python `ast`'iyle statik okunur (import edilmez), host'un `.venv` yorumlayıcısı `-I` ile. Taramada `modules/<m>/model.py` "Elle yazılmış: içe aktar" olarak listelenir; pencere alanları, reddedilen / yaklaşık yapıları ve Mongo'daki dokümanlara göre fazladan alan raporunu gösterir (yalnız yerel sunucu, salt okunur, ≤ 1000 doküman örneklemi). İçe aktarma manifest satırı yazar ve generate eder; var olan K dosyaları korunur, notlar uyarlanacakları söyler (`build_<m>_service`, `<E>Repository` taban sınıfı, `model.py` re-export). Okunan / reddedilen yapıların listesi: plan §6.7.

Okumayı bozan veri (eksik `createdAt` / `updatedAt`, modelde olmayan alt alan, tipi uymayan değer) içe aktarmadan önce migration ile düzeltilir; üretilen satır modeli bu dokümanlarda 500 verir.

## Stack tespiti

Manifest `workspace.backendStack: 'python-fastapi'`; yoksa kökte `pyproject.toml` + tek `src/<pkg>/` (`core/` ile). Model listesi: manifest modülleri (`model_generated.py`) + manifest'te olmayan, `BaseModel` içeren `modules/<m>/model.py` (içe aktarılabilir).

## Sınırlar

- Yalnız admin API; normal API, ownership ve `normalOperations` yok.
- Obje alt alanında enum değerleri, dizi, kısıt ve varsayılan yok (NormalizedModel alt alanı); alt alan reference'ı kontrolsüz.
- Referans verilen kaydı silmek 200 (Mongo'da FK yok; .NET 409). Hedef silinmişse populate tekil alanda `null`, dizide eleman düşer.
- Gövdeler lax (`"yes"` → `true`); .NET ve Express strict.
- Test Mongo'su: `TEST_MONGO_URI` varsa o, yoksa testcontainers `mongo:7` (Docker gerekir). `TestMongoClient` veritabanı adlarına `<pkg>_test_` öneki koyar (asıl DB'ye yazılamaz), kullanılan DB'ler her testten sonra silinir. Testler sıralı koşar (paralel değil).
- PyMongo Async: `await coll.aggregate(...)`, `await client.close()`; `find()` senkron imleç döner.
- Modül testi iskeletin `conftest.py`'sine dayanır; farklı fixture'lı host'ta (StockExchange) elle uyarlanır.
- Electron'da uçtan uca akış (yeni proje → model editörü → generate) PY9'da denendi; içe aktarma penceresi Electron'da denenmedi ([açık konular](#açık-konular)).

Doğrulama: [verification.md](../verification.md#python--fastapi).

## Kararlar

Plan (`docs/plans/backend-python-fastapi.md`) tamamlandı ve silindi (2026-10-26); aşama notları (PY0–PY13), StockExchange geçişi ve ölçümler git geçmişinde. Koddaki `K<n>` atıfları aşağıdaki kararlardır (K16 yok; K19 / K20 StockExchange'e özeldi).

| # | Konu | Karar |
| --- | --- | --- |
| K1 | Model kaynağı | Generator manifest'i. Python parser'ı yalnız **bir kez içe aktarmak** için (Pydantic sınıfı → manifest → `model_generated.py`), sonra düzenleme Generator'da. Enum `StrEnum` yazılır; içe aktarmada `Literal[...]` da okunur. Reference = ObjectId |
| K2 | Kimlik | Her zaman `id` = Mongo `_id` (ObjectId hex). Doğal anahtarlar sıradan unique alan |
| K3 | Zarf ve sayfalama | Sözleşme zarfı; `data` içinde `PaginatedList { items, total, hasMore, currentPage, currentLimit }`, `meta` yok |
| K4 | `traceId` | Sözleşmede opsiyonel; üç stack'te middleware doldurur (`X-Request-Id`, yoksa `X-Trace-Id`); admin-base `ApiResponse.traceId?` |
| K5 | Mongo sürücüsü | PyMongo Async (`AsyncMongoClient`), yalnız `core/db.py`'de; kod `Database` takma adına göre yazılır. Testler gerçek Mongo'da (`TEST_MONGO_URI` ya da testcontainers `mongo:7`, `<app>_test_` önekli DB'ler) |
| K6 | Admin route | Üretilen uçlar `/api/v1/admin-crud/<resource>`; host'un eski elle yazılmış uçları kalkınca `/api/v1/admin/<resource>`'a taşınır |
| K7 | Dosya sahipliği | G dosyaları `*_generated.py` (modül adında nokta olamaz), başlıklı, her generate'te yeniden yazılır; başlıksız dosya kullanıcının. K dosyaları ve asset'ler yalnız yoksa yazılır |
| K8 | Asset'ler | `core/crud`, `core/http`, `core/errors` Generator asset'i; `api/deps.py`, `api/main.py`, `core/config.py` projeye özel (K) |
| K9 | Hata kodu | `errorData.code` sözleşmedeki HTTP benzeri kod + projeye özel alt kodlar (api-contract §1); HTTP status aynı kalır |
| K10 | Başarı mesajı | Yazma uçları yerelleştirilmiş `uiMessage`; list / getOne'da boş olabilir |
| K11 | Hook seti | Üç stack'te aynı adlar (Python'da snake_case), [§ Servis ve hook'lar](#servis-ve-hooklar) |
| K12 | Testler | Stack `contract-parity`'yi geçer; host'ta pytest, gerçek Mongo |
| K13 | Tip bilgileri (Generator geneli) | `numberFormat: 'int' \| 'float'`, `dateFormat: 'datetime' \| 'date'`, `format: 'email'`, sayısal enum (`IntEnum`) |
| K14 | Alan kısıtları (Generator geneli) | `minLength`, `maxLength`, `min`, `max`, `pattern`; BE şemasında aynen, FE formunda kural |
| K15 | Parity ortamı | Yerel Docker; parity aynı Mongo'da ayrı veritabanı + ayrı port; test kendi verisini kurar ve siler |
| K17 | Job'lar | `modules/<m>/jobs.py` (ya da `jobs/`), `worker/main.py` kaydeder; API ile aynı servis ve repository |
| K18 | Hata modeli | Servis `AppError(code, message, status)` fırlatır, `core/http` handler'ı zarfa çevirir |
| K21 | Adlandırma | Entity çoğul PascalCase, route `kebab-case(entity)`, collection `snake_case(entity)`; Generator'a path / ad ayarı eklenmez |
| K22 | Veritabanı | Python yalnız MongoDB (`database: 'mongodb'`, `idType: 'objectid'`). SQL desteği `core/crud/repository.py` arkasında ikinci repository ister, ayrı iş |

**Update'te `null`:** JSON Merge Patch (api-contract §5) üç stack'te tek kural, kaynak `updateNullClears` (`src/shared/normalizedModel.ts`); ayrıntı [§ Update ve `null`](#update-ve-null-json-merge-patch).

## Açık konular

Plandan kalan, Generator tarafında hâlâ açık maddeler:

- **Electron'da denenmedi:** Python içe aktarma penceresi (tarama → içe aktar → generate → şema tasarımcısı); PY6 türleriyle (reference, decimal, map / json, access) editör → generate.
- **Karar bekleyenler:** gövdeler lax (strict mod: `ConfigDict(strict=True)` + tarih / enum istisnaları); referans verilen kaydı silme (Python / Express 200, .NET 409; istenirse ortak `before_delete` "kullanılıyor" kuralı); .NET populate'te `display` yedeği (Express gibi).
- **PY12 export:** `contract-parity`'de export senaryosu yok.
- **Modül testi şablonu:** desenden değer üretimi basit desenlerle sınırlı (bulunamazsa skip); `fixtures/python/tests/test_<m>_cases.py`'deki parçalar (tarih aralığı filtresi, opsiyonel unique boşken çakışmama) genel şablona taşınabilir.
- **Format:** iskelet / asset dosyalarında `ruff format --check` bazı dosyalarda satır bölme öneriyor; iskelette format kapısı yok.
- **İçe aktarma:** `…Id` alanları string gelir (reference'a editörde çevrilir); fazladan alan raporu host `.venv`'inde PyMongo ister, `$sample` 1000 doküman.
- **Diğer host'lar:** Varlik360 (`src/core`) ve SharedFrame (`Common/`) asset'leri elle güncellendi; host'larda generate + smoke yapılmadı. Varlik360'ta modüller yeniden üretilince eski `crud.ts` locale blokları silinebilir.

## Admin FE config

`node scripts/python-host.mjs admin-config <host> <adminFe> <Entity,…>`: manifest modüllerinin admin-base config'i (`<adminFe>/src/modules/<m>/`), Electron'daki "Generate frontend" ile aynı kod (IPC `generateFrontend`). Endpoint host'tan okunur: `modules/<m>/admin_router_generated.py` prefix'i + `core/config.py` `API_PREFIX` (`/api/v1/admin-crud/<m>`).
