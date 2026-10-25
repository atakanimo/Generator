# .NET veritabanı sağlayıcıları: kod incelemesi ve Electron denemesi

Plan: [backend-dotnet-database-providers.md](backend-dotnet-database-providers.md) (PY10). Bu doküman PY10 kodunun incelemesini ve DB5'in Electron'da elle denenmesini adım adım izler. Her aşamanın sonucu "Sonuç" satırına yazılır.

Durum (2026-10-24): Aşama 0–6 bitti. İncelemede R1–R6, Electron denemesinde R7–R8 düzeltildi; dört veritabanı / id tipi pencereden kuruldu, modeller editörden eklendi, host'lar gerçek veritabanına karşı 13 / 13. Editör gözlemleri O1–O3 PY10 dışıydı, 2026-10-25'te düzeltildi (Electron'da elle denenmedi).

## Aşama 0: Kod incelemesi

Kapsam: PY10'da yazılan kod (`src/shared/backendDatabase.ts`, `providers/*.ts`, `dotnetContext.ts` değişiklikleri, asset katmanları `providers/<db>/` ve `ids/<idType>/`, ortak asset değişiklikleri, parser, IPC, pencere, doğrulama betikleri). Aynı dosyalarda paralel yürüyen `detailOnly` / `ListRow` ve `access.computed` işi PY10'un değildir; `RowProjection` ile uyumlu (liste `ToRowPageAsync(ListRow, …)`).

Fixture'ların kapsamadığı yollar için geçici deneme: `scripts/verify/out/dotnet/review/` (`models.json`: EventTypes, Documents + `ReviewItems`: string enum dizisi, sayısal enum dizisi, tarih dizisi, populate edilen opsiyonel reference, `reference[]`; `review.mjs` kontrolleri; `run-relational.sh` Postgres / SQL Server, Mongo elle).

| # | Bulgu | Düzeltme |
| --- | --- | --- |
| R1 | Mongo: sayısal enum dizisi de JSON değer dönüştürücüsü alıyordu (sayılar metin yazılırdı) | `mongodb.ts`: sayısal enum dizisi dönüştürücüsüz (BSON sayı dizisi) |
| R2 | Mongo: string enum dizisi dönüştürücüsü (`List<TEnum>` → `List<string>` / `string[]`) `{ _v: [...] }` diye saklanıyor, okumada 500. Eleman dönüştürücüsü desteklenmiyor; `BsonRepresentation` koleksiyonda yok sayılıyor ve enum listesi sıra numarasıyla yazılıyor | String enum listesi JSON metni (değerleriyle, `HasJsonConversion()`); `EnumValueConversion`'daki liste aşırı yüklemesi silindi |
| R3 | Postgres `JsonbConversion` ve SQL Server `JsonConversion` enum listelerini sıra numarasıyla yazıyordu (enum sırası değişince veri bozulur) | Üç sağlayıcının JSON dönüştürücüsü string enum'u değerleriyle yazar, `[NumericEnum]` sayı kalır (yalnız yeni host'lar) |
| R4 | Mongo `reference[]`'e işaret edilen kaydı silmek 409 veriyordu; ilişkiselde join tablosu cascade ediyor (200, bağ kalkar) | Tekil reference 409 (`CheckInUseAsync`), `reference[]` id'si `DetachReferencesAsync` ile listeden çıkar (`CrudServiceBase` kancası) |
| R5 | Mongo: birden fazla doküman yazan `SaveChanges` standalone Mongo'da transaction hatası (DB0 yalnız tek dokümanı denemişti; K11 eksikti) | Mongo `AppDbContext`: `AutoTransactionBehavior.Never` (Express gibi); K11 düzeltildi |
| R6 | Tarih dizisi Mongo'da `{ DateTime, Ticks, Offset }` dokümanları (Express BSON date) | Bilinen fark (K15c, stack dokümanı); dönüştürücülü her koleksiyon R2'ye düşüyor |

Deneme sonucu (R1–R5 sonrası): `review.mjs` Postgres, SQL Server, MongoDB'de all PASS (10 / 10): enum dizileri ve tarih dizisi gidiş-dönüş, populate edilen opsiyonel reference (dolu / `null`), `reference[]` filtresi, tekil reference'lı kaydı silme 409, `reference[]`'li kaydı silme 200 + listeden çıkma. Saklama: Postgres / SQL Server `["dark-blue"]` / `[2]`, Mongo `'["dark-blue"]'` / `[2]`.

Kapılar (R1–R5 sonrası): tsc taban 3. `dotnet-e2e` Postgres tam all PASS (D2 16, D3 20, D4 27, PY1 17, D0 47, üç parity suite); Mongo + uuid smoke'lar + Express `contract-parity` PASS, Python suite'leri koşamadı (StockExchange'te paralel iş: `modules/providers/admin_router_generated.py` olmayan `ProvidersService`'i import ediyor, API açılmıyor; PY10 dışı, önceki Mongo koşusunda ikisi de PASS); Mongo + ObjectId ve SQL Server `--no-parity` all PASS.

Sonuç: ✅ (Python parity'si StockExchange düzelince tekrar: `node scripts/verify/dotnet-e2e.mjs <etiket> --db mongodb --python-only`).

## Aşama 1: Hazırlık

Bilgisayar kullanımı araçları bu oturuma bağlanamadığı için (Cursor yeniden başlayınca ad alanı yüklenmedi) Electron CDP ile sürülür: `npx electron . --remote-debugging-port=9333 --inspect=9334`; renderer'da `scripts/verify/out/dbtests/ui.js` yardımcıları (düğme, alan, MUI seçim), ana süreçte `dialog.showOpenDialog` test klasörünü döndürür (`setup.sh <klasör>`): pencerenin "Seç" düğmesi dahil akış gerçek, yalnız macOS klasör seçicisi atlanır. Modeller `models.js` ile model editöründen oluşturulur; host kontrolleri `host-check.mjs` (create / getOne, unique 409, büyük / küçük harf, arama + sıralama, reference create / filtre / olmayan hedef 400, kullanılan kaydı silme 409, bozuk ve olmayan id 404).

- [x] Docker: SQL Server (`gen-dbtest-mssql`, :14330, `mcr.microsoft.com/mssql/server:2022-latest`), MongoDB (`gen-dbtest-mongo`, :27032, `mongo:7`). Postgres yerel (`/tmp` soketi).
- [x] Test klasörleri (Generator ve gerçek projeler dışında): `/tmp/dbtests/pg`, `/tmp/dbtests/mssql`, `/tmp/dbtests/mongo`, `/tmp/dbtests/mongo-oid` (boş).
- [x] Electron: vite :5190 + electron (CDP portlarıyla).
- [ ] Ortak model seti (model editöründen): `EventTypes` (`name` string zorunlu unique, `isActive` boolean), `Templates` (`name` string, `eventTypeId` reference → EventTypes populate `name`, `documentIds` yok). İkinci model reference ve populate yolunu dener.

Her veritabanında host'u çalıştırma (terminal, host klasöründe): `cp .env.example .env` → bağlantı dizesi ve `Jwt__Secret` doldur → `dotnet build` → (ilişkisel) `dotnet tool restore && dotnet ef migrations add Initial -p src/<App>.Infrastructure -s src/<App>.Api` → `set -a && . ./.env && set +a && dotnet run --project src/<App>.Api` → `API_BASE=… JWT_SECRET=… [ID_TYPE=objectid] node scripts/verify/dotnet-d0-smoke.mjs`.

## Aşama 2: PostgreSQL

- [x] Project Location → "Yeni .NET projesi". Pencere: Veritabanı seçenekleri PostgreSQL / SQL Server / MongoDB; PostgreSQL ve SQL Server'da Id tipi uuid v7 ve pasif; MongoDB'de uuid v7 / ObjectId seçilebilir; PostgreSQL'e dönünce Id tipi uuid v7'ye döner; klasör ve ad yokken Oluştur pasif. (Bilgi ikonu metni görsel kontrol edilmedi; içerik `express-bootstrap` kapısında.)
- [x] Pencere: Seç → `/tmp/dbtests/pg`, ad `PgHost`, PostgreSQL, uuid v7 → Oluştur: "PgHost: 64 dosya oluşturuldu", klasör açılıp tarandı; manifest `backendStack: dotnet-ef`, `database: postgres`, `idType: uuid-v7`.
- [x] Tespit listesi: önce "PostgreSQL" yoktu (**R7**), düzeltmeden sonra ".NET, ASP.NET Core, EF Core, PostgreSQL".
- [x] Model editörü: `EventTypes` (name String zorunlu unique, isActive Boolean) ve `Templates` (name, eventTypeId ObjectId → EventTypes) oluşturuldu; Found Models (2); `Template.cs` `EntityId EventTypeId` + navigation.
- [x] Terminal: `.env` (bağlantı dizesi **R8**), build 0 uyarı, `dotnet ef migrations add Initial`, `dotnet run` (Development'ta `MigrateOnStartup` tabloları kurdu: `event_types`, `templates`), `host-check.mjs` 13 / 13.
- Sonuç: ✅ (R7, R8 düzeltildi; editör gözlemleri O1–O3 aşağıda)

Bulgular (Aşama 2):

| # | Bulgu | Durum |
| --- | --- | --- |
| R7 | Tespit listesinde veritabanı yoktu: manifest'te stack kayıtlıyken `technologiesFromSourceType` sabit liste döndürüyordu | Düzeltildi: liste manifest'teki `database`'in adını alır (.NET, Express, Python) |
| R8 | Postgres `.env.example` bağlantı dizesi tırnaksız (`;`), dokümandaki `set -a && . ./.env` bozuluyor (PY10 öncesi) | Düzeltildi: tırnaklı (SQL Server ve Mongo zaten öyle) |
| O1 | Model editörü yeni alanda Required ve Trim'i varsayılan işaretli getiriyor; tür String'den başka türe dönünce `trim` kalıyor (`// eventTypeId trim`, `// isActive trim`) | ✅ 2026-10-25: yeni model tek boş alanla açılır (işaretli bayrak yok); tür değişince `trim` yalnız metinde kalır, boolean / map `unique` almaz (`withEditorType`) |
| O2 | Reference türü editörde "ObjectId", Ref alanının yardım metni .NET host'unda da "Mongoose ref name" | ✅ 2026-10-25: listede "Reference"; Ref yardım metni stack'e göre (Mongoose ref / EF navigation + FK / Python ObjectId) |
| O3 | "Model Ekle"de populate ayarı yok (şema tasarımcısında) | ✅ 2026-10-25: "Model Ekle"de Reference alanına Populate (hedef modelin alanları, proje taramasından) + Display seçimi; display hedefte regex filtrelenebilir değilse uyarı (K3); hedef değişince populate / display sıfırlanır (`withReferencePopulate`, `withReferenceTarget`) |

## Aşama 3: SQL Server

- [x] Pencere: `/tmp/dbtests/mssql`, `SqlHost`, SQL Server, uuid v7 (pasif).
- [x] Manifest `database: sqlserver`; tespit "SQL Server"; `Directory.Packages.props`'ta `Microsoft.EntityFrameworkCore.SqlServer` 10.0.13 ve `System.Security.Cryptography.Pkcs` 10.0.13 pin'i.
- [x] Modeller (editör) → `EventTypeConfiguration`: `Name` `HasMaxLength(850)` + unique; build 0 uyarı; migration; çalıştırma: veritabanı collation `Latin1_General_100_CS_AS_SC_UTF8`; `host-check.mjs` 13 / 13 (unique büyük / küçük harfe duyarlı, arama duyarsız).
- Sonuç: ✅

## Aşama 4: MongoDB + uuid v7

- [x] Pencere: `/tmp/dbtests/mongo`, `MongoHost`, MongoDB, uuid v7 (Id tipi seçilebilir).
- [x] Manifest `database: mongodb`, `idType: uuid-v7`; tespit "MongoDB"; `Template.cs` navigation'sız, `// eventTypeId … ref=EventTypes`.
- [x] Build 0 uyarı; çalıştırma (migration yok): açılışta `event_types` `name_1` (unique), `createdAt_1`; dokümanlar camelCase, tarih BSON date; `host-check.mjs` 13 / 13 (kullanılan kaydı silme 409 `CheckInUseAsync`).
- Sonuç: ✅

## Aşama 5: MongoDB + ObjectId

- [x] Pencere: `/tmp/dbtests/mongo-oid`, `MongoOidHost`, MongoDB, ObjectId.
- [x] Manifest `idType: objectid`; `Directory.Build.props` `<Using Include="MongoDB.Bson.ObjectId" Alias="EntityId" />`; Domain `.csproj` `MongoDB.Bson`.
- [x] Build 0 uyarı; `ID_TYPE=objectid host-check.mjs` 13 / 13; id'ler 24 karakter hex, Mongo'da `ObjectId`; bozuk ve olmayan id 404.
- Sonuç: ✅

## Aşama 6: Pencere, diğer stack'ler

- [x] "Yeni Express projesi" / "Yeni Python projesi": pencerede yalnız Klasör ve Uygulama adı; manifest `nodejs-mongoose` / `python-fastapi` + `mongodb` + `objectid`; Python tespit listesinde MongoDB (manifest'ten, R7).
- [x] Var olan çözümün olduğu klasöre .NET projesi (`/tmp/dbtests/pg`, `PgHost`): pencerede "PgHost çözümü bu klasörde zaten var."
- [x] MongoDB + ObjectId seçip Vazgeç, yeniden aç: PostgreSQL + uuid v7.
- Sonuç: ✅

## Temizlik

- [x] Electron (CDP) ve vite kapatıldı; `gen-dbtest-mssql`, `gen-dbtest-mongo` silindi; `/tmp/dbtests` ve Postgres test veritabanları (`dbtest_pg`, `gen_review`) silindi.
- [x] R7–R8 sonrası kapılar: tsc taban 3, `regen-dotnet` all PASS, `express-bootstrap` all PASS.

## İkinci kod incelemesi (2026-10-25)

PY10 kodunun ikinci incelemesi (alt agent, yalnız okuma) ve düzeltmeler. Kapılar (`regen-dotnet`, `dotnet-e2e`, `express-bootstrap`) bu turda **koşulmadı** (kullanıcı kararı); yalnız `tsc` (taban 3). Üretilen C# değişiklikleri (R11–R13) derlenmedi ve Docker'da denenmedi: ilk kapı koşusunda doğrulanmalı.

| # | Bulgu | Karar / düzeltme |
| --- | --- | --- |
| R9 | Manifest'te bilinmeyen `backendStack` (ör. `nodejs-typeorm`, elle düzenleme) + `database` yok: `LEGACY_HOST_DATABASE[...]` `undefined` → TypeError → manifest "yok" sayılıyor, sonraki yazım dosyayı sıfırdan yazıp model satırlarını siliyordu | `manifestSnapshot.ts` `withHostDatabase`: bilinmeyen stack'e dokunmaz |
| R10 | `dotnet-ef` manifest'inde alan yoksa (manifest silinmiş / `.generator`'sız klon / model editörü stash'i yalnız `backendStack` yazıyor) migration her zaman `postgres` + `uuid-v7` koyuyordu: Mongo / SQL Server host'una sessizce ilişkisel kod üretilirdi. Şema tasarımcısında `backendStack` yoksa anlaşılmaz "(yok)" hatası | `withHostDatabase` `dotnet-ef`'i doldurmaz; `dotnetBackend.ts` `resolveDotnetHostDatabase`: manifest yoksa projeden (sağlayıcı paketi + `Directory.Build.props` `EntityId` alias'ı) alır ve manifest'e yazar, manifest ile proje çelişirse açık hata, ikisi de yoksa açık hata. Tespit (`dotnetHost.ts`) sağlamlaştırıldı: XML yorumları atlanır, iki tırnak türü, `PackageReference` / `PackageVersion` adları tam eşleşir, birden çok sağlayıcı paketi belirsiz (undefined); id tipi de okunur |
| R11 | Mongo: opsiyonel unique alan `null` yazılıyor, düz unique index ikinci boş kayıtta 409 veriyordu (Postgres / SQL Server / Python izin veriyor) | `mongodb.ts`: opsiyonel unique alanın index'i partial filter (`{ <json>: { $type: … } }`, `CreateIndexOptions<BsonDocument>`) alır; zorunlu alan aynı. Sağlayıcı filtreyi yok sayarsa davranış eskisiyle aynı (gerileme yok); kapıda doğrulanmalı |
| R12 | SQL Server: kendine dönen `reference[]` join tablosunda iki cascade FK → migration hatası 1785 | `relational.ts` `selfManyToManyCascade: false` (SQL Server): generate açık `DotnetUnsupportedError` verir. Postgres değişmedi |
| R13 | SQL Server: `maxLength`'i olmayan unique metin `nvarchar(850)`; 851+ karakter truncation → 500 | Sağlayıcı `uniqueTextMaxLength` (850) validator'a da gider (`MaximumLength(850)` → 400) |
| R14 | Bootstrap var olan host'un üstüne kurulabiliyordu (yalnız aynı adlı `.sln(x)` / `package.json` / `pyproject.toml` kontrolü); manifest'in stack / veritabanı değişiyordu (K2 deliği) | `existingHostError`: manifest'te `backendStack` varsa üç bootstrap da reddeder; .NET ayrıca herhangi bir `.sln(x)`, `package.json`, `pyproject.toml` varsa reddeder |
| R15 | Express / Python generate manifest'teki veritabanını doğrulamıyordu (`python-fastapi` + `postgres` sessizce Mongo kodu) | `assertHostDatabase`: manifest'te alan varsa ve stack desteklemiyorsa hata; alanı olmayan eski host'lar geçer |
| R16 | `ids/objectid/_skeleton/src/__App__.Domain/{bin,obj}` build çıktısı (yerel mutlak yollar) asset ağacındaydı, pakete kopyalanıyordu | Silindi; `.gitignore` `src/generator-assets/**/{bin,obj}/` |

Düzeltilmeyenler (düşük / olası, karar bekliyor):

- **Null sıralaması:** Postgres ASC'de `NULL` sonda, SQL Server / Mongo / Express başta. SQL Server `uniqueidentifier`'ı son 6 bayta göre sıralar (`sortBy: id`). Bilinen fark olarak belgelenmeli ya da ilişkiselde null sırası açık yazılmalı.
- **409 mesajındaki alan adı:** Postgres constraint adı, SQL Server index adı, Mongo / servis JSON adı (yalnız yarış durumunda).
- **`WhereIn` eşitlik zinciri** her sağlayıcıda: çok büyük id listesinde SQL Server 2100 parametre sınırı / derin ifade ağacı (olası).
- **SQL Server `UseCollation`:** ilk migration `ALTER DATABASE … COLLATE`; açık bağlantı varsa 5030, Azure SQL'de değiştirilemez (olası).
- **Mongo `EnsureIndexesOnStartup` prod'da açık:** var olan veride tekrar varken yeni unique index API'yi açılışta düşürür (Express yalnız log yazar).
- **Kapı kapsamı:** opsiyonel unique alan, kendine dönen m-n, 850 üstü unique metin ve bootstrap reddi hiçbir kapıda yok; R10–R14 için fixture / kapı adımı eklenmeli.
