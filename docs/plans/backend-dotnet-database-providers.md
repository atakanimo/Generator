# Plan: .NET backend'de seçilebilir veritabanı ve id tipi (PY10)

Durum (2026-10-24): PY8 ve PY9 bitti. **DB0 (spike) bitti** (§4.1): `MongoDB.EntityFrameworkCore` 10.0.4 EF Core 10 ile çalışıyor, D0 smoke Mongo'da 46 / 46; K5, K9–K12 kararlandı, Mongo'ya özgü sorgu sınırları K15'te. **DB1 bitti** (§5.2): manifest alanları, sağlayıcı arayüzü, Postgres asset katmanı; Postgres çıktısı değişmedi. **DB2 bitti** (§5.3): `EntityId`. **DB2b bitti** (§5.4): SQL Server sağlayıcısı, kapıları geçiyor; "Yeni .NET projesi" penceresinde veritabanı seçimi. **DB3, DB4, DB6 bitti** (§5.5, §5.6): MongoDB sağlayıcısı (uuid v7 ve ObjectId), document reference stratejisi, üç sağlayıcı da `regen-dotnet` + `dotnet-e2e` kapılarını geçiyor. Kod incelemesi ve Electron denemesi: [DbTests.md](DbTests.md) (incelemede R1–R5 düzeltildi; K8, K11, K15 güncellendi). Kalan: DB5'in Electron'da elle denenmesi; commit yapılmadı.

Bugün yeni bir .NET projesi her zaman PostgreSQL ve `Guid` (uuid v7) ile kurulur. Bu plan, veritabanını ve id tipini proje kurulurken seçilen birer parametre yapar: PostgreSQL, SQL Server ve MongoDB. Nasıl çalıştığı bugün: [backend/dotnet-efcore.md](../backend/dotnet-efcore.md). Ana .NET planı: [backend-dotnet-efcore.md](backend-dotnet-efcore.md). Sıralama: [backend-python-fastapi.md](backend-python-fastapi.md) §5, PY10.

## 1. Hedef ve kapsam

- Manifest'e iki alan eklenir:
  - `workspace.database: 'postgres' | 'sqlserver' | 'mongodb'`
  - `workspace.idType: 'uuid-v7' | 'objectid'`
- İkisi de "Yeni .NET projesi" penceresinde seçilir, bootstrap'ta manifest'e yazılır ve sonradan değişmez (değiştirmek veri migration'ı demektir).
- Aynı girdi (NormalizedModel v2 + manifest v3), aynı HTTP davranışı ([api-contract.md](../api-contract.md)). admin-base veritabanını bilmez.
- Yeni sağlayıcı yalnız yeni bir sağlayıcı tanımı ve asset klasörüyle eklenebilmeli; `dotnetContext.ts`'e veritabanı adıyla dal girmez.
- Alanlar stack'ten bağımsızdır. Express ve Python yalnız `mongodb` kabul eder (kilit karar, K14); doğrulama izinli eşleşmeleri denetler.

İzinli eşleşmeler:

| Stack | `database` | `idType` |
| --- | --- | --- |
| `dotnet-ef` | `postgres`, `sqlserver` | `uuid-v7` |
| `dotnet-ef` | `mongodb` | `uuid-v7`, `objectid` |
| `nodejs-mongoose`, `python-fastapi` | `mongodb` | `objectid` |

## 2. Bugünkü PostgreSQL bağımlılık haritası

Application katmanı (`CrudServiceBase`, `ICrudService`, `FilterExtensions`, `QueryableExtensions`, `ListBody`) yalnız EF Core soyutlamalarını (`DbSet`, `IQueryable`, `ToListAsync`) kullanır; PostgreSQL'e bağlı değildir. Bağımlılık şu noktalarda:

| Yer | PostgreSQL'e özgü olan |
| --- | --- |
| `_skeleton/Directory.Packages.props` | `Npgsql.EntityFrameworkCore.PostgreSQL` + `EFCore.NamingConventions`, Relational pini |
| `_skeleton/src/__App__.Infrastructure/__App__.Infrastructure.csproj` | Npgsql paket referansı |
| `_skeleton/src/__App__.Infrastructure/DependencyInjection.cs` | `UseNpgsql(...)` + `UseSnakeCaseNamingConvention()` |
| `_skeleton/src/__App__.Api/Program.cs`, `appsettings*.json` | `Database:MigrateOnStartup` → `MigrateAsync()` |
| `_skeleton/.env.example` | Postgres bağlantı dizesi |
| `Api/Common/EnvelopeExceptionHandler.cs` | `PostgresException` + `SqlState` (unique → 409, FK → 409) |
| `Infrastructure/Common/JsonbConversion.cs` | `map` / enum dizisi → `jsonb` kolon |
| `dotnetContext.ts` (yapılandırma satırları) | `HasJsonbConversion`, `ComplexProperty` / `ComplexCollection` + `ToJson()`, `HasColumnType("jsonb")`, `HasOne…OnDelete(Restrict)`, `HasMany…UsingEntity` (join tablosu `<tablo>_<alan>`), `HasIndex().IsUnique()`, tablo adı snake_case |
| `dotnetContext.ts` (`refRecord`) + `Projections.cs.hbs` | populate navigation üzerinden (`x.Nav.Name`), SQL join |
| `dotnetContext.ts` (filtre) | `reference[]` filtresi navigation üzerinden (`WhereAnyIn(x => x.Nav, …)`) |
| `Service.cs.hbs` | `ForUpdate` → `.Include(x => x.Nav)`, `Load<Nav>Async` (skip navigation koleksiyonu) |
| `parsers/dotnet/dotnetHost.ts`, `ipc/projectScanner.ts` | tespit: `efCorePostgres` (Npgsql paketi) |
| Doğrulama betikleri | `dotnet-e2e.mjs` Postgres konteyneri + `dotnet ef migrations` |

`Guid` yaklaşık 40 yerde geçer: asset'lerde (`AuditableEntity`, `IEntity`, `ICrudService`, `CrudServiceBase`, `Ref`, `FilterExtensions`, `QueryableExtensions`, `ICurrentUser` / `CurrentUser`), `Endpoints.cs.hbs`'teki `{id:guid}` kısıtında, `dotnetContext.ts`'te (16) ve parser'da (3).

## 3. Kararlar

| # | Konu | Karar |
| --- | --- | --- |
| K1 | Sağlayıcı katmanı | EF Core korunur, sağlayıcı değişir: PostgreSQL = `Npgsql.EntityFrameworkCore.PostgreSQL`, SQL Server = `Microsoft.EntityFrameworkCore.SqlServer`, MongoDB = `MongoDB.EntityFrameworkCore`. Application katmanı ve `CrudServiceBase` aynı kalır. Stack kimliği `dotnet-ef`, klasörler `dotnet-efcore` olarak kalır |
| K2 | Manifest | `workspace.database` ve `workspace.idType` bootstrap'ta yazılır (üç stack'in bootstrap'ı da). Var olan manifest'lere bir kerelik migration: `dotnet-ef` → `postgres` + `uuid-v7`; `nodejs-mongoose` ve `python-fastapi` (PY9 bootstrap'larıyla kurulanlar dahil) → `mongodb` + `objectid`. Sonra alan eksikse hata (varsayılan yok) |
| K3 | TS sağlayıcı arayüzü | `src/main/generators/dotnet-efcore/providers/` altında `DotnetDbProvider` (`postgres.ts`, `sqlserver.ts`, `mongodb.ts`; iki ilişkisel sağlayıcı ortak `relational.ts` tabanını paylaşır). Verdikleri: NuGet paketleri, DI satırı, alan türüne göre yapılandırma satırları, reference stratejisi (`relational` \| `document`), desteklenen alan türleri (desteklenmeyende `DotnetUnsupportedError`), generate notu (migration / index), tespit deseni. `dotnetContext.ts` kararları buradan alır |
| K4 | Asset'ler | Ortak asset'ler (`<Layer>/Common/**`) + sağlayıcı üst katmanı `generator-assets/dotnet-efcore/providers/<db>/**` (aynı yol ve belirteçler). İskeletin sağlayıcıya bağlı dosyaları (`Directory.Packages.props`, Infrastructure csproj ve `DependencyInjection.cs`, `Program.cs`, `appsettings*.json`, `.env.example`) üst katmandan gelir |
| K5 | Hata eşleme | `EnvelopeExceptionHandler` genel kalır, veritabanı hatasını sağlayıcı asset'i `IDbErrorClassifier` sınıflandırır: `Duplicate(field)` / `InUse` / bilinmiyor. Postgres: `23505` / `23503`. SQL Server: `SqlException.Number` `2601` / `2627` (unique) ve `547` (FK). Mongo: `SaveChanges` istisnayı `DbUpdateException`'a sarmaz, doğrudan `MongoBulkWriteException` gelir; `WriteErrors` içinde `ServerErrorCategory.DuplicateKey` (11000) → 409, alan adı mesajdaki index adından (`<json>_1`) |
| K6 | Id tipi | Her projede `GlobalUsings.cs` (iskelet): `global using EntityId = System.Guid;` ya da `= MongoDB.Bson.ObjectId;`. Asset ve şablonlarda `Guid` yerine `EntityId`; yeni id `EntityIds.New()` (`Guid.CreateVersion7()` / `ObjectId.GenerateNewId()`); route kısıtı `{id:guid}` / `{id:objectid}` (asset'te özel kısıt); ObjectId için JSON hex string dönüştürücüsü. Bozuk id iki tipte de 404 |
| K7 | Reference (Mongo) | FK ve navigation yok; entity `EntityId <X>Id` / `List<EntityId> <X>Ids` tutar. Populate: sayfa okunduktan sonra hedef başına tek toplu sorgu (`Where(t => ids.Contains(t.Id))`), üretilen `PopulateAsync`; `Row` id'leri döner, `Ref<…>` kayıtları bellekte kurulur. `reference[]` filtresi id listesi üzerinden. Hedef var mı kontrolü bugünkü `CheckRelationsAsync` gibi |
| K8 | Kullanılan kaydı silme (Mongo) | FK yok; silmede ilişkisel sağlayıcıyla aynı cevap: kayda **tekil** `reference` veren model varsa üretilen `CheckInUseAsync` 409 döner (FK Restrict); `reference[]` listelerindeki id üretilen `DetachReferencesAsync` ile listeden çıkar, silme 200 (join tablosu cascade'i). İkisi de bütün modellerin listesinden kurulur. İnceleme (2026-10-24): ilk sürüm `reference[]`'te de 409 veriyordu; ilişkisel join tablosu cascade ettiği için eşitlendi |
| K9 | Gömülü obje, `map`, `json` | Postgres: bugünkü gibi jsonb / `ToJson()`. SQL Server: `ToJson()` ve JSON metin kolonu (K13). Mongo (DB0): `object` / `object[]` → `OwnsOne` / `OwnsMany` (doğal alt doküman; complex type kullanılmaz); `map` → `Dictionary<string, T>` doğal alt doküman, dönüştürücü yok; `json` → JSON metni (string): sağlayıcı `JsonDocument`'ı da `BsonDocument`'ı da eşlemiyor. Express `json` alanını alt doküman tutar; aynı veritabanını paylaşırken yalnız bu alan türü farklıdır (§6) |
| K10 | Unique ve şema | Postgres ve SQL Server: EF migration + unique index (bugünkü gibi), `Database:MigrateOnStartup`. Mongo (DB0): migration yok; `Database:EnsureIndexesOnStartup` → `Database.EnsureCreatedAsync()`: collection'ları ve modeldeki `HasIndex` index'lerini (unique dahil) kurar, var olan collection'a yeni index'i ekler. Ayrı index asset'i yok |
| K11 | Transaction (Mongo) | Sağlayıcı birden fazla doküman yazan `SaveChanges`'i transaction'la açar; standalone Mongo bunu reddeder (`Standalone servers do not support transactions`). DB0 yalnız tek dokümanlı yazmayı denemişti; inceleme `DetachReferencesAsync` + silmede yakaladı. Karar: Mongo katmanının `AppDbContext.cs`'i `Database.AutoTransactionBehavior = Never` (Express gibi transaction yok; çok dokümanlı kayıt tek parça değil). Replica set'te tek parça isteyen host `WhenNeeded`'e çevirir. Replica set zorunlu değil |
| K12 | Adlandırma | Postgres ve SQL Server tablo snake_case (bugünkü, `EFCore.NamingConventions` iki sağlayıcıda da). Mongo collection `snake_case(klasör)` (`ToCollection`), alan adları JSON adı: üretici her özellik için `HasElementName("<json>")` yazar (gömülü obje alanları dahil). Sağlayıcının `CamelCaseElementNameConvention`'ı kullanılmaz: geçerli kültürü kullanıyor, tr-TR'de `IsActive` → `ısActive`. `DateTimeOffset` alanları `HasBsonRepresentation(BsonType.DateTime)` (yoksa `{ DateTime, Ticks, Offset }` alt dokümanı yazılır); `DateOnly`, `decimal` (Decimal128), `Guid` (UUID) doğal |
| K13 | İlişkisel aile (SQL Server) | SQL Server, Postgres sağlayıcısının çoğunu paylaşır: navigation, FK Restrict, join tablosu, migration, populate join üzerinden. Farklar: json kolonu (`jsonb` yerine `ToJson()` ve JSON metin kolonu; SQL Server 2025'in `json` tipi mi `nvarchar(max)` mı, DB2b'de), skaler dizi ve enum dizisi (primitive collection JSON, filtre `OPENJSON`), hata kodları (K5), varsayılan collation büyük / küçük harfe duyarsız (unique ve eşitlik filtresi Postgres'ten farklı davranır; collation kararı DB2b'de, parity'de ölçülür). Docker imajı `mcr.microsoft.com/mssql/server`; Apple Silicon'da amd64 emülasyonuyla çalışır |
| K14 | Diğer stack'ler | Express (`nodejs-mongoose`) yalnız MongoDB: Mongoose Mongo'ya özgü, SQL ayrı bir stack demek; eklenmez. Python (`python-fastapi`) şimdilik yalnız MongoDB: SQLAlchemy Mongo desteklemez, SQL `core/crud` repository arayüzünün arkasında ikinci bir uygulama ister; ayrı plan, bu plana girmez |
| K15 | Mongo sorgu sınırları (DB0) | (a) **Row projeksiyonu:** owned alanlar skalerlerle aynı `Select(x => new Row(...))` içinde okununca sağlayıcı alan sırasını kaydırıyor (`No coercion operator … DateTimeOffset and Guid`). Mongo'da entity okunur, `Row` bellekte kurulur (derlenmiş ifade); populate de bellekte olduğu için (K7) aynı yer. `CrudServiceBase` dallanmaz: projeksiyon adımı sağlayıcı üst katmanındaki asset'tedir (ilişkisel: veritabanında `Select`). (b) **Enum:** JSON değeriyle saklanır (Express gibi; `HasConversion<string>` üye adını yazar): asset `EnumValueConversion` (`JsonStringEnumMemberName` → değer). Sağlayıcı nullable dönüştürücüyü reddeder; nullable alanda da nullable olmayan dönüştürücü. Sürücü nullable + dönüştürücülü enum'da `List.Contains` ve sıralamayı çeviremiyor: `IN` filtresi eşitlik zinciri (`x.P == a \|\| x.P == b`; ortak `FilterExtensions`, Postgres'te de geçerli), sıralama anahtarı `x.P ?? default` (`null` ilk üyeyle aynı sırada; Express `null`'ı başa koyar, bilinen fark). Nullable olmayan enum'da filtre ve sıralama doğrudan çalışır; sıralama saklanan değere göre (Express ile aynı). (c) **Koleksiyonlar** (inceleme 2026-10-24): sağlayıcı dönüştürücülü koleksiyonu `{ _v: [...] }` diye sarıyor ve okuyamıyor, eleman dönüştürücüsünü desteklemiyor, enum listesini sıra numarasıyla yazıyor, `BsonRepresentation`'ı koleksiyonda yok sayıyor. String enum listesi JSON metni (değerleriyle, `HasJsonConversion()`), sayısal enum listesi BSON sayı dizisi, tarih listesi `{ DateTime, Ticks, Offset }` alt doküman dizisi (Express BSON date dizisi; bilinen fark) |

## 4. Riskler ve spike (DB0)

Elle yazılmış bir Mongo host'u (D0'daki `EventTypes`, sonra bir reference'lı model) ile şunlar denenir:

- `MongoDB.EntityFrameworkCore`'un EF Core 10 ile uyumlu sürümü; `TreatWarningsAsErrors` altında 0 uyarı.
- `FilterExtensions` çevirileri: `ToLower().Contains` (regex), `Contains` ile IN, tarih aralığı, boolean, enum dizisi.
- Record'a `Select` projeksiyonu, `Skip` / `Take` / `CountAsync`, gömülü alana göre sıralama.
- `Dictionary<string, T>`, `JsonDocument`, gömülü obje dizisi.
- `HasConversion<string>` enum, `decimal` (Decimal128), `DateTimeOffset`.
- Transaction davranışı (K11), unique ihlalinin yakalanması (K5).

Bir çeviri çalışmazsa çözüm sağlayıcı arayüzüne girer (ör. Mongo'ya özel filtre yardımcısı); `CrudServiceBase` dallanmaz. Sağlayıcı EF 10'u desteklemiyorsa plan durur, karar yeniden açılır.

### 4.1 DB0 sonucu (2026-10-24)

Host: `regen-dotnet`'in ürettiği EventTypes, Documents, MembershipPlans, Reminders (reference'sız dört model) `scripts/verify/out/dotnet/db0/mongo`'ya elle Mongo'ya çevrildi; Docker'da `mongo:7.0.14` (replica set :27027, standalone :27028).

- `MongoDB.EntityFrameworkCore` **10.0.4** (EF Core ≥ 10.0.11, MongoDB.Driver ≥ 3.11.2): `TreatWarningsAsErrors` altında 0 uyarı. Mongo host'unda `Npgsql`, `EFCore.NamingConventions`, `Microsoft.EntityFrameworkCore.Relational` ve `Design` paketleri yok.
- `dotnet-d0-smoke` 46 / 46: Application katmanı (`CrudServiceBase`, `FilterExtensions`, sayfalama, sıralama, unique 409) değişmeden; regex araması `ToLower().Contains`, tarih aralığı, boolean, id filtresi çevriliyor.
- Alan türleri (`spike-kinds.mjs`): decimal (aralık filtresi, sıralama), map, json, object, object[], string[], string enum, sayısal enum, `int` aralığı, `DateOnly` aralığı, update'te `null` temizleme. Kalan tek fark nullable enum sıralaması (K15).
- `x.List.Any(t => ids.Contains(t))` çevriliyor (K7'deki `reference[]` filtresi).
- Paralel 10 aynı adlı create: 1 × 200, 9 × 409 (K5).
- Kararlar: K5, K9, K10, K11, K12, K15.

SQL Server'ın riski daha küçük, ayrı spike yok; DB2b'nin ilk adımında aynı host SQL Server'a çevrilip şunlar denenir: enum dizisi filtresi (primitive collection, `OPENJSON`), `ToJson()` gömülü obje ve `map`, collation ile unique / arama davranışı, `TreatWarningsAsErrors` altında 0 uyarı.

## 5. Aşamalar

| Aşama | İş | Sonuç | Durum |
| --- | --- | --- | --- |
| DB0 | Spike (§4) | Elle Mongo host'unda D0 smoke geçer; K9 / K11 kararları | ✅ 2026-10-24 (§4.1) |
| DB1 | Manifest alanları + migration (K2, üç stack), `DotnetDbProvider` (K3), Postgres kodunun sağlayıcıya taşınması, asset üst katmanı (K4), `IDbErrorClassifier` (K5); Express ve Python bootstrap'ları da `mongodb` + `objectid` yazar | `regen-dotnet` çıktısı (asset'ler hariç) bayt bayt aynı; `dotnet-e2e` aynı | ✅ 2026-10-24 (§5.2) |
| DB2 | `EntityId` (K6) | Postgres çıktısında yalnız tip adı değişir; smoke ve parity aynı | ✅ 2026-10-24 (§5.3) |
| DB2b | SQL Server sağlayıcısı (K13): `sqlserver.ts`, asset üst katmanı, paketler, DI, hata sınıflandırıcı, json / dizi yapılandırma farkları, collation kararı, `dotnet-e2e`'ye SQL Server konteyneri | Golden set (12 model) derlenir; D0–D4 smoke'ları ve parity geçer | ✅ 2026-10-24 (§5.4) |
| DB3 | Mongo sağlayıcısı: asset'ler, iskelet, bootstrap, index kurulumu (K10) | Boş Mongo host'u `dotnet build` 0 uyarı, ayağa kalkar | ✅ 2026-10-24 (§5.5) |
| DB4 | Mongo alan türleri, reference / populate (K7), `CheckInUseAsync` (K8), `objectid` | Golden set (12 model) iki id tipinde derlenir; D0–D4 smoke'ları geçer | ✅ 2026-10-24 (§5.6) |
| DB5 | Arayüz: PY9'un "Yeni .NET projesi" penceresine veritabanı (üç seçenek) ve id tipi seçimi; tespit (Npgsql → PostgreSQL, `Microsoft.EntityFrameworkCore.SqlServer` → SQL Server, Mongo paketi → MongoDB); PY9 bilgi ipucunun veritabanı satırı seçilen veritabanından | Electron'da üç sağlayıcıyla proje kurulur, model eklenir, generate edilir | 🟡 kod bitti (pencere seçimi DB2b'de, tespit ve ipucu `STACK_DATABASES`'ten; app flow `regen-dotnet`'te üç sağlayıcıda geçiyor); Electron'da elle deneme kaldı |
| DB6 | Kapılar ve dokümanlar: `regen-dotnet` + `dotnet-e2e` sağlayıcı parametresiyle, Mongo `contract-parity` (Express'le), `docs/backend/dotnet-efcore.md`, `.cursor/rules/backend-dotnet-efcore.mdc`, `docs/verification.md` | Üç sağlayıcı da kapıları geçer | ✅ 2026-10-24 (§5.6) |

DB1 ve DB2 davranış değiştirmez, SQL Server ve Mongo'dan önce ayrı ayrı bitirilir.

### 5.1 Sıra

1. PY9'un .NET ipucu ve Express kısmı ([backend-python-fastapi.md](backend-python-fastapi.md) §5). İpucunun veritabanı satırı stack tanımındaki desteklenen veritabanı listesinden okunur; DB5 yalnız bu listeyi ve pencereyi genişletir.
2. DB0, 1 ile paralel: elle yazılmış host üretim kodunu etkilemez, riski erken gösterir.
3. PY8, sonra PY9'un Python kısmı (ipucu PY8'in `docs/backend/python-fastapi.md`'sine bağlanır).
4. DB1 → DB2 → DB2b → DB3 → DB4 → DB5 → DB6.

### 5.2 DB1 sonucu (2026-10-24)

- `src/shared/backendDatabase.ts`: türler, `DATABASE_LABELS`, `STACK_DATABASES` (bugün `dotnet-ef`: yalnız `postgres` + `uuid-v7`; sağlayıcı geldikçe genişler), `LEGACY_HOST_DATABASE` (K2 migration'ı: `normalizeManifest` alanları olmayan manifest'e stack'in eski değerini koyar, sonraki yazım kalıcı yapar), `hostDatabaseError`, `onlyHostDatabase` (Express / Python bootstrap'ı; .NET penceresi DB5'e kadar da bunu gönderir), `DOTNET_DATABASE_PACKAGES` (tespit).
- `providers/`: `DotnetDbProvider` (`configure`, `assetDir`, `generateNote`), `relational.ts` (`dotnetContext.ts`'teki yapılandırma döngüsü taşındı), `postgres.ts`, `index.ts` (`dotnetDbProvider(db)`). `generateDotnetModules` / `bootstrapDotnetHost` / `bootstrapDotnetProject` ve IPC `project:bootstrapDotnet` `{ database, idType }` alır; generate manifest'ten okur (`requireHostDatabase`). Tespit: `DotnetHost.database`.
- Asset üst katmanı `providers/postgres/` (§3 K4 listesi + `JsonbConversion.cs`, `DbErrorClassifier.cs`); `Program.cs` ortak (`InitializeDatabaseAsync`). Kopya `bin/` / `obj/` atlar (editör iskeletin `.csproj`'unu restore edince oluşuyordu).
- Kapılar (DB1): tsc taban 3; `regen-dotnet` all PASS, G dosyaları `db-base` ile bayt bayt aynı (farklar yalnız `EnvelopeExceptionHandler.cs`, `Program.cs`, `DependencyInjection.cs`, yeni `IDbErrorClassifier.cs` / `DbErrorClassifier.cs`); `dotnet-e2e --skip-regen` all PASS (D2 16, D3 20, D4 27, PY1 17, D0 46, üç parity suite).

### 5.3 DB2 sonucu (2026-10-24)

- İkinci üst katman `ids/<idType>/` (ortak → sağlayıcı → id tipi): `_skeleton/Directory.Build.props` (`<Using Include="System.Guid" Alias="EntityId" />`, bütün projelerde) ve `Domain/Common/EntityIds.cs` (`New()`, `TryParse`).
- Asset'ler (`AuditableEntity`, `IEntity`, `ICrudService`, `CrudServiceBase`, `Ref`, `FilterExtensions`, `QueryableExtensions`, `ICurrentUser` / `CurrentUser`), şablonlar ve `dotnetContext.ts`: `Guid` → `EntityId`; ownership create'te `?? Guid.Empty` → `?? default`. Route kısıtı ortak asset `Api/Common/EntityIdRouteConstraint.cs` (`{id:entityid}`, `EntityIds.TryParse`; `ApiSetup`'ta kayıtlı): uç dosyaları id tipinden bağımsız, bozuk id 404.
- Parser `EntityId` ve `Guid`'i reference okur (elle yazılmış entity `Guid` kullanabilir).
- Kapılar: tsc taban 3; `regen-dotnet` all PASS; 284 G dosyası `EntityId` → `Guid`, `{id:entityid}` → `{id:guid}`, `?? default` → `?? Guid.Empty` geri çevrilince DB1 ile bayt bayt aynı; `dotnet-e2e --skip-regen` all PASS (aynı sayılar).
- Var olan host (SharedFrame): `Directory.Build.props`'a takma ad satırı, `EntityIds.cs` ve `EntityIdRouteConstraint.cs` (+ `ApiSetup` kaydı), yukarıdaki asset'lerde `Guid` → `EntityId`; sonra modüller yeniden generate edilir.

### 5.4 DB2b sonucu (2026-10-24)

- `STACK_DATABASES['dotnet-ef']` + `sqlserver` / `uuid-v7`; tespit paketi `Microsoft.EntityFrameworkCore.SqlServer`.
- `sqlserver.ts`: `relationalConfig` lehçesi `HasJsonConversion()` (`map`, enum dizisi, `json`; JSON metni), unique metin alanı (string, string enum) `HasMaxLength(850)` (modelde daha küçük `maxLength` varsa o, büyükse `DotnetUnsupportedError`). Lehçe arayüzü buna göre genişledi (`jsonDocument`, `uniqueTextMaxLength`); Postgres çıktısı değişmedi (284 G dosyası bayt bayt aynı).
- Asset katmanı `providers/sqlserver/`: `Directory.Packages.props` (`Microsoft.EntityFrameworkCore.SqlServer` 10.0.13; `Microsoft.Data.SqlClient`'ın çektiği `System.Security.Cryptography.Pkcs` 9.0.11 NU1903 verdiği için transitive pin 10.0.13), `.env.example`, `appsettings*.json`, Infrastructure `.csproj` / `DependencyInjection.cs`, `Persistence/AppDbContext.cs` (collation `Latin1_General_100_CS_AS_SC_UTF8`; `decimal(38, 18)` + `TrimmedDecimalConverter`), `Infrastructure/Common/JsonConversion.cs`, `DbErrorClassifier.cs` (2601 / 2627 / 547, alan adı mesajdaki index adından).
- Kararlar (K13): collation büyük / küçük harfe duyarlı (unique ve eşitlik Postgres / Mongo gibi; arama `ToLower().Contains` ile duyarsız kalır). Decimal ölçeği SQL Server'da saklanmaz: okunan değer sondaki sıfırlar olmadan (`"149.90"` → `"149.9"`); sözleşme yalnız "string decimal" der, D3 smoke decimal'ı değerle karşılaştırır.
- Arayüz (DB5'in pencere kısmı öne alındı: tek eşleşmeli `onlyHostDatabase('dotnet-ef')` artık geçersizdi): "Yeni .NET projesi" penceresi veritabanı ve id tipini `STACK_DATABASES`'ten seçtirir, seçim `bootstrapBackendProject` → `project:bootstrapDotnet`'e gider; tek eşleşmeli stack'lerde alan görünmez. Bilgi ipucunun veritabanı satırı da `STACK_DATABASES`'ten (`backendStacks.ts` `withDatabases`).
- Kapılar: `regen-dotnet --db sqlserver` all PASS (golden set dahil 0 uyarı); `dotnet-e2e --db sqlserver` all PASS (D2 16, D3 20, D4 27, PY1 17, D0 46, üç parity suite; Docker'da `mssql/server:2022-latest` amd64). `dotnet-e2e` ve `regen-dotnet` `--db postgres|sqlserver` alır; SQL Server her koşuda yeni konteyner (`gen-e2e-mssql`, :14330). D0 smoke'a "unique büyük / küçük harfe duyarlı" senaryosu eklendi (D0 47; `--no-parity` ile iki veritabanında da all PASS).

### 5.5 DB3 sonucu (2026-10-24)

- `mongodb.ts`: `ToCollection(snake_case(klasör))`; her özellik `HasElementName("<json>")` (gömülü obje alt alanları dahil); `DateTimeOffset` (ve `createdAt` / `updatedAt`) `HasBsonRepresentation(BsonType.DateTime)`; string enum ve enum dizisi `HasEnumValueConversion()`; `json` `HasJsonConversion()` (metin); `object` / `object[]` `OwnsOne` / `OwnsMany` + `b.HasElementName`; unique ve `createdAt` index'i `HasIndex`. Sağlayıcı arayüzüne `sortKey` (Mongo: nullable string enum `x => x.P ?? default`, K15).
- Asset katmanı `providers/mongodb/`: `Directory.Packages.props` (`MongoDB.EntityFrameworkCore` 10.0.4 → Driver / Bson 3.11.2; Npgsql, NamingConventions, Relational, Design yok), Api `.csproj` (Design yok), boş `dotnet-tools.json`, `.env.example` (`mongodb://…/<app>`), `appsettings*.json` (`Database:EnsureIndexesOnStartup: true`, prod dahil: migration aracı yok), Infrastructure `.csproj` / `DependencyInjection.cs` (`UseMongoDB(IMongoClient, db)`; `InitializeDatabaseAsync` → `EnsureCreatedAsync`), `Infrastructure/Common/EnumValueConversion.cs` (tekil, nullable, liste), `JsonConversion.cs`, `DbErrorClassifier.cs` (`MongoBulkWriteException` / `MongoWriteException` 11000, alan index adından), `Application/Common/Pagination/RowProjection.cs` (bellekte satır, K15a).
- Ortak asset'ler: `RowProjection.cs` (ilişkisel: veritabanında `Select`; `CrudServiceBase` projeksiyonu buradan yapar), `FilterExtensions` nullable `IN` eşitlik zinciri (boş liste: kayıt yok). Entity şablonunda gömülü obje yorumu `Gömülü obje.` (eski: `(jsonb)`).
- `STACK_DATABASES['dotnet-ef']` + `mongodb` / `uuid-v7` (ObjectId DB4'te); tespit paketi `MongoDB.EntityFrameworkCore`.
- Doğrulama: `regen-dotnet db3 --db mongodb` boş host 0 uyarı + test + idempotent; reference'sız dört modelli host (`out/dotnet/db3/simple`) Docker Mongo'ya karşı: index'ler açılışta kuruldu, D0 47 / 47, D2, PY1 ve `spike-kinds` (temiz veritabanında) geçti, paralel unique 1 × 200 / 9 × 409. Reference'lı modeller DB4.
- Not: host `.dll`'den kökte açılınca `appsettings.json` okunmaz; e2e `Database__EnsureIndexesOnStartup=true` verir.

### 5.6 DB4 sonucu (2026-10-24)

- `DotnetDbProvider.referenceStrategy`: `relational` (Postgres, SQL Server) / `document` (Mongo). `dotnetContext.ts`: navigation yalnız `relational`'da (`DotnetFieldInfo.nav`), adlar `refStem`'den; ilişkisel çıktı değişmedi (284 G dosyası, yalnız gömülü obje yorumu farklı).
- `document` (K7): entity `EntityId <X>Id` / `List<EntityId> <X>Ids`, işaret yorumunda `ref=<Klasör>` (parser hedefi buradan okur); `reference[]` create / update'te tekrarlar atılır (join tablosu gibi küme); hedef kontrolü `CheckRelationsAsync` (`AnyAsync`; liste için `CountAsync` = farklı id sayısı); filtre ortak `WhereAnyIdIn`. Populate: `Row` / `WriteRow` id'li `Ref` (`hasWriteRow` = iki projeksiyon farklıysa), üretilen `PopulateAsync` sayfanın id'lerini toplar, hedef başına tek `ToDictionaryAsync`, `r with { … }` ile `Ref` kayıtlarını doldurur; yalnız list / getOne (create / update id, Express gibi).
- K8: üretilen `CheckInUseAsync` (yalnız `document`): bu modele `reference` / `reference[]` veren bütün modellerde `AnyAsync` → 409 `Messages.InUse`. `CrudServiceBase`'e iki kanca: `PopulateAsync` (ListAsync / GetByIdAsync, `MapRows`'tan önce), `CheckInUseAsync` (DeleteAsync, `BeforeDelete`'ten önce).
- ObjectId (K6): `ids/objectid/` (`Directory.Build.props` → `MongoDB.Bson.ObjectId`, `Domain/Common/EntityIds.cs`, Domain `.csproj` + `MongoDB.Bson` 3.11.2, `Api/Common/EntityIdJson.cs` hex dönüştürücüsü); `ids/uuid-v7/Api/Common/EntityIdJson.cs` boş liste; `JsonSetup` `EntityIdJson.Converters`'ı ekler; `RefJsonConverter` id'yi `JsonSerializer` ile yazar. `STACK_DATABASES`: `mongodb` + `uuid-v7` / `objectid`.
- Smoke'lar id biçimini `ID_TYPE`'tan alır (`scripts/verify/_smoke-ids.mjs`: desen, token `sub`, olmayan id, yeni id). `dotnet-e2e` / `regen-dotnet`: `--db mongodb`, `--id objectid`; Mongo'da migration adımı yok, .NET host'ları için ayrı `gen-e2e-mongo-dotnet` konteyneri.
- Kapılar: `regen-dotnet` üç sağlayıcıda ve Mongo'da iki id tipinde all PASS (golden set 12 model 0 uyarı, parser gidiş-dönüşü `ref=` ile, app flow, admin config). `dotnet-e2e`: Postgres tam all PASS; Mongo + uuid tam all PASS (D2 16, D3 20, D4 27, PY1 17, D0 47; Express ile `contract-parity` 4 bilinen fark, `subscription-plans`, `golden-models`); Mongo + ObjectId `--no-parity` all PASS; SQL Server `--no-parity` all PASS.
- Mongo'da Express ile bilinen farklar (`contract-parity` KNOWN): bozuk id (.NET 404, Express 400), kullanılan kaydı silme (.NET 409, Express 200), beyaz liste dışı `sortBy` (.NET 400); fixture kayması (`createdAt` filtresi). Saklama farkı: `json` alanı (K9), nullable enum sıralamasında `null` (K15).

## 6. Etki

- Var olan host'lar (SharedFrame) etkilenmez: asset'ler yalnız yoksa yazılır, manifest migration'ı bir kerelik. DB2'deki `EntityId` yeni host'lara gider; SharedFrame'e taşımak elle yapılır (bkz. [backend-dotnet-efcore.md](backend-dotnet-efcore.md) §4, asset güncellemeleri).
- Mongo + `objectid`, Express ile aynı veritabanını okuyabilir; .NET ile Varlik360 verisi denenebilir (gerçek klasöre yazmadan, kopyada). Saklama farkı yalnız `json` alan türünde (K9: .NET JSON metni, Express alt doküman).
- SQL Server, Postgres ile aynı HTTP davranışını verir; kullanılan kaydı silme FK Restrict ile 409. Collation farkı (K13) parity'de ölçülür, kalan fark varsa burada listelenir.
- Express ile bilinen parity farkları: kullanılan kaydı silmek iki stack'te de ilişki kontrolüne dayanır (K8); bozuk id farkı (.NET 404, Express 400) kalır.
