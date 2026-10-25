# BE: .NET 10 + EF Core

Üretici `src/main/generators/dotnet-efcore/`, şablonlar `src/main/templates/backend-dotnet-efcore/**/*.hbs`, core asset'ler ve iskelet `src/generator-assets/dotnet-efcore/**`, parser `src/main/parsers/dotnet/`, uygulama tarafı `src/main/ipc/dotnetBackend.ts`. Girdi NormalizedModel v2 + manifest v3, çıktı [api-contract.md](../api-contract.md). Express üreticisiyle kod paylaşılmaz. Kararlar ve geçmiş: [plans/backend-dotnet-efcore.md](../plans/backend-dotnet-efcore.md); veritabanı sağlayıcıları: [plans/backend-dotnet-database-providers.md](../plans/backend-dotnet-database-providers.md).

Stack: .NET 10, ASP.NET Core Minimal API, EF Core 10, FluentValidation, System.Text.Json, JWT Bearer + `Admin` policy, xUnit. Veritabanı host başına seçilir (aşağıda): PostgreSQL (Npgsql), SQL Server (ikisinde `EFCore.NamingConventions` snake_case) ya da MongoDB (`MongoDB.EntityFrameworkCore`). Kimlik tipi `EntityId` (uuid v7; MongoDB'de ObjectId de seçilebilir), JSON'da `id` string.

## Veritabanı sağlayıcısı

- Manifest `workspace.database` + `workspace.idType`: bootstrap yazar, sonra değişmez. İzinli eşleşmeler ve etiketler tek yerde: `src/shared/backendDatabase.ts` (`STACK_DATABASES`; `dotnet-ef`: `postgres` / `sqlserver` + `uuid-v7`, `mongodb` + `uuid-v7` / `objectid`). Alanları olmayan eski manifest okunurken stack'in eski değerini alır (`dotnet-ef` → `postgres` + `uuid-v7`, Express / Python → `mongodb` + `objectid`), sonraki manifest yazımı kalıcı yapar. Generate değeri `requireHostDatabase` ile okur; yoksa ya da stack üretmiyorsa hata.
- `providers/` (`DotnetDbProvider`): `configure` (entity başına `<E>Configuration` satırları ve using'leri), `assetDir`, `generateNote`. `dotnetContext.ts` veritabanı adıyla dallanmaz. İlişkisel sağlayıcılar `relational.ts`'i paylaşır (tablo, FK + navigation, join tablosu, unique index, migration); sağlayıcı yalnız lehçeyi verir. `postgres.ts`: `map` / enum dizisi `HasJsonbConversion()`, `json` `jsonb` kolon. `sqlserver.ts`: üçü de `HasJsonConversion()` (JSON metni, `nvarchar(max)`); unique metin alanı (string, string enum) `HasMaxLength(850)` (index anahtarı en fazla 1700 bayt; modelde daha küçük `maxLength` varsa o, büyükse `DotnetUnsupportedError`).
- SQL Server katmanının `AppDbContext.cs`'i: veritabanı collation'ı `Latin1_General_100_CS_AS_SC_UTF8` (büyük / küçük harfe duyarlı; unique ve eşitlik filtresi Postgres / Mongo gibi, arama küçük harfe çevirip karşılaştırır), `decimal` `decimal(38, 18)` + `TrimmedDecimalConverter` (okunan değer sondaki sıfırlar olmadan: `"149.90"` yazılır, `"149.9"` döner; Postgres yazılan ölçeği korur). `Microsoft.Data.SqlClient`'ın çektiği `System.Security.Cryptography.Pkcs` transitive pin'le yamalı sürümde (NuGet audit, `TreatWarningsAsErrors`).
- Asset üst katmanı `generator-assets/dotnet-efcore/providers/<db>/`: ortak ağaçla (`_skeleton/`, `<Layer>/`) aynı yollar; aynı yoldaki dosya ortak olanın yerine yazılır. Postgres katmanı: `Directory.Packages.props`, `.env.example`, `appsettings*.json`, Infrastructure `.csproj` ve `DependencyInjection.cs` (`AddInfrastructure`, `InitializeDatabaseAsync`), `Infrastructure/Common/JsonbConversion.cs`, `Infrastructure/Common/DbErrorClassifier.cs`. Asset kopyası `bin/` / `obj/` klasörlerini atlar (editörün iskelet projesini restore etmesi).
- Kısıt ihlali: `EnvelopeExceptionHandler` geneldir, istisnayı `IDbErrorClassifier` (`Application/Common/Errors`) sınıflandırır: `Duplicate(field)` / `InUse` → 409. Postgres: `23505` / `23503`; SQL Server: `SqlException.Number` 2601 / 2627 / 547.
- Kimlik: `ids/<idType>/` katmanı (sağlayıcının üstünde) `Directory.Build.props`'a `EntityId` takma adını ve `Domain/Common/EntityIds.cs`'i (`New`, `TryParse`) koyar: `uuid-v7` → `System.Guid`; `objectid` (yalnız MongoDB) → `MongoDB.Bson.ObjectId` (Domain `.csproj`'u `MongoDB.Bson` alır, `Api/Common/EntityIdJson.cs` 24 karakter hex dönüştürücüsünü kaydeder). Asset, şablon ve bağlam `Guid` yazmaz; uçlar `{id:entityid}` (ortak `EntityIdRouteConstraint`, bozuk id 404).
- Reference stratejisi (`DotnetDbProvider.referenceStrategy`): `relational` (PostgreSQL, SQL Server): FK + navigation, populate join'le (`Row` projeksiyonunda), `reference[]` join tablosu, silmede FK Restrict. `document` (MongoDB): navigation yok; entity `EntityId <X>Id` / `List<EntityId> <X>Ids` tutar (tekrarlar atılır), hedef kontrolü `CheckRelationsAsync`'te (`AnyAsync` / `CountAsync`), `reference[]` filtresi `WhereAnyIdIn`. Populate: `Row` id'lerle kurulur, üretilen `PopulateAsync` (list / getOne, `CrudServiceBase` kancası) hedef başına tek sorguyla `Ref` kayıtlarını doldurur; create / update cevabı id. Silme ilişkiseldeki gibi cevaplar: kayda tekil reference veren model varsa üretilen `CheckInUseAsync` 409 (FK Restrict); `reference[]` listelerindeki id üretilen `DetachReferencesAsync` ile çıkar (join tablosu cascade'i; `CrudServiceBase` kancası, silmeyle aynı `SaveChanges`).
- `mongodb.ts`: `ToCollection`, her özellik `HasElementName("<json>")` (gömülü obje alt alanları dahil; sağlayıcının camel-case convention'ı geçerli kültürü kullandığı için yok), `DateTimeOffset` `HasBsonRepresentation(BsonType.DateTime)`, string enum `HasEnumValueConversion()` (JSON değeri), string enum listesi ve `json` `HasJsonConversion()` (JSON metni: sağlayıcı dönüştürülen koleksiyonu okuyamıyor, enum listesini sıra numarasıyla yazıyor), sayısal enum listesi doğal, `OwnsOne` / `OwnsMany`, `HasIndex`. Sıralama anahtarı (`sortKey`): nullable string enum `x.P ?? default` (sürücü dönüştürücülü nullable enum'u sıralayamıyor). Asset katmanı: paketler (Design ve dotnet-ef yok), `UseMongoDB`, `RowProjection.cs` (satır bellekte: sağlayıcı owned alanlı projeksiyonu çeviremiyor), `Persistence/AppDbContext.cs` (`AutoTransactionBehavior.Never`: standalone Mongo çok dokümanlı transaction'ı reddeder; Express gibi transaction yok), `EnumValueConversion.cs`, `JsonConversion.cs`, `DbErrorClassifier.cs` (`MongoBulkWriteException` 11000).

## Yeni proje

Arayüzde: Project Location kartında **Yeni .NET projesi** → boş klasör + PascalCase uygulama adı → `project:bootstrapDotnet(root, app, { database, idType })` (çözüm zaten varsa ya da eşleşme izinli değilse reddedilir); klasör açılır ve taranır. Düğmenin yanındaki bilgi ikonu aşağıdaki host düzenini (G / K / asset), teknolojileri ve komutları gösterir (tek tanım: `src/shared/backendStacks.ts`).

```bash
cp .env.example .env          # ConnectionStrings__Default, Jwt__Secret (en az 32 karakter)
dotnet tool restore           # dotnet-ef
dotnet build && dotnet test
# model ekleyip generate ettikten sonra:
dotnet ef migrations add Initial -p src/<App>.Infrastructure -s src/<App>.Api
set -a && . ./.env && set +a && dotnet run --project src/<App>.Api    # http://localhost:5080/api/health
```

## Çağrı zinciri

```
Arayüz → IPC (src/main/index.ts, sourceType 'dotnet-ef')
  project:scan            → projectScanner: findDotnetHost + listDotnetEntityFiles
  project:parseModel      → parseNormalizedModel(.cs) → parseDotnetEntity + manifest satırı (mergeModel)
  project:generateBackend → generateDotnetBackend → generateDotnetModules(root, app, bütün modeller, manifest'teki veritabanı)
  project:createModel / updateModel → writeDotnetModel (taslak manifest'e, sonra generate)
  project:bootstrapDotnet → bootstrapDotnetProject (iskelet + asset'ler + boş kayıt dosyaları; manifest'e stack, veritabanı, id tipi)
  project:generateFrontend → AdminConfigGenerator (endpoint: findAdminMountPath → *AdminEndpoints.cs)
```

`generateDotnetModules`:
1. `ensureDotnetHost`: iskelet (`_skeleton/`) ve core asset'ler (`<Layer>/Common/**`), üstüne sağlayıcı katmanı; eksikse yazılır. `__App__` / `__app__` belirteci yolda ve içerikte uygulama adıyla değişir.
2. `buildDotnetModuleContexts(app, models, provider)`: bütün modellerin bağlamı birlikte kurulur, çünkü bir `reference` hedefin C# tiplerini bilmeli. Kararlar burada (`dotnetContext.ts`) ve sağlayıcıda; şablonlar yalnızca hazır satırları döner.
3. Modül başına dosyalar, sonra 4 kayıt dosyası (`*.Generated.cs`) tam listeden.

Generate her zaman host'un **bütün** Generator modüllerini yeniden üretir (kayıt dosyaları tam liste ister). İçeriği değişmeyen dosyaya yazılmaz.

## Host düzeni

Clean Architecture, 4 proje, bağımlılık içeriye doğru (`Api → Infrastructure → Application → Domain`). Her katmanda modül klasörü (çoğul PascalCase).

```
<App>.slnx  Directory.Build.props  Directory.Packages.props  global.json  .config/dotnet-tools.json  .env.example
src/<App>.Domain/          Common/ (asset)   <Folder>/<Entity>.cs (G)  <Entity>.Custom.cs (K)
src/<App>.Application/     Common/ (asset)   <Folder>/…  DependencyInjection.cs (K)  DependencyInjection.Generated.cs (G)
src/<App>.Infrastructure/  Common/ (asset)   Persistence/AppDbContext.cs (K)  AppDbContext.Generated.cs (G)  Persistence/<Folder>/…
src/<App>.Api/             Common/ (asset)   Endpoints/<Folder>/…  Endpoints/EndpointRegistry.Generated.cs (G)  Program.cs (K)
tests/<App>.Api.Tests/
```

Adlar (`dotnetModuleNames`): entity tekil (`Document`), klasör çoğul (`Documents`), uç `/api/<moduleNameFromEntity>` (`/api/documents`, admin `/api/documents/admin`), tablo klasörün snake_case'i. Sürümler yalnızca `Directory.Packages.props`'ta (central package management, sağlayıcı katmanında; Postgres'te `Microsoft.EntityFrameworkCore.Relational` Npgsql'in eski sürümü çekmesin diye pinli). `TreatWarningsAsErrors` açık.

## Üretilen modül dosyaları

| Katman | G (her generate'te yeniden yazılır) | K (bir kez oluşturulur) |
| --- | --- | --- |
| Domain | `<E>.cs`: entity, enum'lar (`JsonStringEnumMemberName` = `enum.values` yazımı), gömülü obje sınıfları | `<E>.Custom.cs` |
| Application | `<E>Dtos.cs` (Row, populate record'ları, Filters, normal + admin Create / Update), `<E>Validators.cs`, `<E>Filters.cs` (SortMap + filtreler), `<E>Projections.cs` (`Row`, `WriteRow`), `I<E>Service.cs` (normal + admin interface), `<E>Service.cs`, `<E>AdminService.cs` | `I<E>Service.Custom.cs`, `<E>Service.Custom.cs`, `<E>Hooks.cs` |
| Infrastructure | `<E>Configuration.cs` | `<E>Configuration.Custom.cs` |
| Api | `<E>Endpoints.cs` (yalnızca izinli `normalOperations`), `<E>AdminEndpoints.cs` | `<E>Endpoints.Custom.cs` (normal + admin `MapCustom`) |

Normal servis, DTO'lar ve uç dosyası her zaman üretilir; `normalOperations` yalnızca hangi uçların eşleneceğini belirler. Sebep: K dosyaları generated tarafa dayanır, dosya kalkarsa derleme kırılır.

## Dosya sahipliği

- G dosyası `// <auto-generated by Generator />` ile başlar, 2. satırı `#nullable enable` (Roslyn bu başlıkla başlayan dosyada nullable'ı kapatır, CS8669). Başlığı olmayan bir dosya kullanıcıya aittir; Generator o dosyayı atlar ve sonuç notunda listeler.
- K dosyaları ve asset'ler yalnızca yoksa yazılır.
- Custom blok yok: kullanıcı kodu `partial class` / `partial interface` / `partial void` ile `.Custom.cs` dosyalarında durur.

| İhtiyaç | Yer |
| --- | --- |
| Ek servis metodu | `<E>Service.Custom.cs` + imza `I<E>Service.Custom.cs` |
| Ek uç / aksiyon | `<E>Endpoints.Custom.cs` → `MapCustom(group)` (generated `/{id}` uçlarından önce) |
| Ek filtre | `partial record <E>Filters` + `ApplyCustomFilters` |
| Entity ekleri | `<E>.Custom.cs` |
| EF yapılandırması | `<E>Configuration.Custom.cs` → `ConfigureCustom` |
| Ek doğrulama | validator'ların `partial void ConfigureCustom()` |
| İş kuralı | `<E>Hooks.cs` |

## Servisler

Tek generic interface `ICrudService<TRow, TCreate, TUpdate, TFilters>` (List / GetById / Create / Update / Delete) ve gövdeleri taşıyan `CrudServiceBase<…>` (asset `Application/Common/Services/`). Modül başına `partial interface I<E>Service : ICrudService<…>` ve `I<E>AdminService`; DI interface ile kaydeder, uçlar interface'i alır. Modül servisi yalnızca kendine özgü parçaları verir: `Set`, `Row`, `WriteRow`, `Sort`, `ApplyFilters`, `MapCreate`, `MapUpdate`, `CheckUniqueAsync`, `CheckRelationsAsync`, `ApplyCreate/UpdateRelationsAsync`, `ForUpdate`, `Scope`. Hepsi `virtual` / `abstract`; davranış `.Custom.cs`'te `override` ile değişir.

Create / update sırası: map → m-n ilişkileri yükle → tekil ilişki var mı (yoksa 400) → unique (409) → hook → kaydet → `WriteRow` ile yeniden oku. Delete'te kullanılan kayıt (FK Restrict) ve yarışta kaçan unique ihlali `EnvelopeExceptionHandler`'da (`IDbErrorClassifier`) 409 olur.

Hook'lar: `I<E>Hooks` (normal) ve `I<E>AdminHooks` (admin), `ServiceHooks<…>`'tan türer: `BeforeList`, `BeforeGetById`, `BeforeCreate`, `BeforeUpdate`, `BeforeDelete`, `DefaultSort`, `AfterCreate(entity)`, `AfterUpdate(entity)`, `AfterDelete(entity)`, `MapRows(rows)`. `Error` dönen `Before*` işlemi durur. `After*` yazılan / silinen kayıtla çalışır, geri alınmaz. `MapRows` bir list sayfasının satırlarını (getOne'da tek satır) tek çağrıda, async değiştirir (toplu IO). Set, Express ve Python ile aynı.

**Geçiş (PY1, kırıcı):** `IServiceHooks` / `ServiceHooks` beşinci tip parametresi `TRow` aldı ve `MapRows` eklendi. Modülün `Hooks.cs`'i K dosyasıdır, Generator ezmez: var olan host'ta her `I<E>Hooks` / `I<E>AdminHooks` ve `<E>Hooks` / `<E>AdminHooks` bildirimine `, <E>Row` eklenir; asset'ler (`Common/`) yalnızca yoksa yazıldığı için `ServiceHooks.cs`, `CrudServiceBase.cs`, `FilterExtensions.cs`, `TraceIdMiddleware.cs`, `ApiResponse.cs`, `ResultExtensions.cs`, `ApiSetup.cs`, `JsonSetup.cs` elle güncellenir, `Domain/Common/NumericEnumAttribute.cs` eklenir (sayısal enum: `[NumericEnum]` + `Name = n`; küresel string enum dönüştürücüsü bu enum'ları atlar).

## Normal API ve ownership

- Ownership: `model.ownership.kind`, yoksa `userId` reference alanı varsa `field`.
- `field`: normal serviste `Scope()` → `x.UserId == currentUser.Id`; create `UserId`'yi auth'tan yazar; `userId` normal body'de yok (400), normal filtrede yok sayılır. Admin API kabul eder.
- `self`: `Scope()` → `x.Id == currentUser.Id`; normal create kapalı.
- Sözleşme süzmesi: ownership yoksa normal yazma işlemleri, `self`'te create üretilmez; generate notunda bildirilir.
- Auth: `api.requiresAuth === false` ve yazma / ownership yoksa anonim, aksi halde `RequireAuthorization()`. Admin uçları `Admin` policy (`role` claim'i `Admin`).

## Sözleşme eşlemesi

| Kind | Entity | Row / body / filtre |
| --- | --- | --- |
| `string` / `number` / `boolean` / `date` | `string` / `double` (`int`) / `bool` / `DateTimeOffset` (`DateOnly`) | filtre: regex (küçük harfe çevrilip "içerir") / range / boolean / date-range (UTC gün) |
| `decimal` | `decimal` | JSON string (giriş ve çıkış) |
| `enum` | C# enum | JSON `enum.values` yazımı; filtre tek değer ya da dizi |
| `reference` | `EntityId <X>Id` (+ navigation, ilişkisel) | populate: `Ref<Record>`: list / getOne'da `{ id, ...populate }`, create / update'te id; yoksa id. Body id; hedef yoksa 400 |
| `reference[]` | ilişkisel: skip navigation; document: `List<EntityId>` | aynı kural, dizi (tekrarlar atılır); filtre "hedeflerden biri" |
| hedefsiz reference | `EntityId` / `List<EntityId>` | id |
| `object` (alanlı) / `object[]` | gömülü sınıf | aynı sınıf (strict) |
| alansız `object`, `json` | `JsonDocument` | aynı |
| `map` | `Dictionary<string, T>` | aynı |
| skaler dizi | `List<T>` | `[]` (null değil) |

Veritabanında saklama sağlayıcıya göre:

| Kind | PostgreSQL | SQL Server | MongoDB |
| --- | --- | --- | --- |
| `enum` (string) | üye adı (`HasConversion<string>`) | üye adı | JSON değeri (`HasEnumValueConversion`) |
| `reference` / `reference[]` | FK `Restrict` + join tablosu `<tablo>_<alan>` (silmede cascade) | aynı | id / id listesi; populate `PopulateAsync` (hedef başına tek sorgu); silmede tekil reference `CheckInUseAsync` (409), listedeki id `DetachReferencesAsync` ile çıkar |
| `object` / `object[]` | `ComplexProperty` / `ComplexCollection` + `ToJson()` (jsonb) | aynı (JSON metni) | `OwnsOne` / `OwnsMany` (alt doküman) |
| `json` | `jsonb` | JSON metni | JSON metni (Express alt doküman tutar) |
| `map` | `HasJsonbConversion()` | `HasJsonConversion()` | doğal alt doküman |
| enum dizisi | `HasJsonbConversion()` (string enum değerleriyle, sayısal enum sayı) | `HasJsonConversion()` (aynı) | string enum: JSON metni (değerleriyle); sayısal enum: BSON sayı dizisi |
| skaler dizi | Postgres dizisi | JSON metni (primitive collection) | BSON dizi (tarih dizisi `{ DateTime, Ticks, Offset }` dokümanları) |
| `decimal` | `numeric` (yazılan ölçek) | `decimal(38, 18)`, okunan sondaki sıfırlar olmadan | Decimal128 |
| `date` | `timestamptz` | `datetimeoffset` | BSON date |

Diğer kurallar: strict body (`UnmappedMemberHandling.Disallow`; `id` / `_id` → 400), liste `POST get-all` (`limit` 100'e kırpılır, `page < 1` → 400, `sortBy` beyaz liste dışı → 400), varsayılan sıralama `createdAt desc, id desc`, tarih çıkışı `…​.fffZ`, `hidden` alan Row'da / populate'te / filtrede / sıralamada yok, `adminOnly` yalnızca admin body'de, doldurulmamış opsiyonel alan `null`. Kısmi update JSON Merge Patch'tir (api-contract §5): gönderilmeyen alan değişmez, opsiyonel alana `null` `NULL` yazar, zorunlu alana / listeye `null` 400; update gövdesi `PatchBody`'den türer, `Has(nameof(X))` alanın gönderildiğini söyler.

## Model kaynağı ve parser

Bir modülün modeli = entity dosyası + manifest satırı (`mergeModel`): tip, `required`, `isArray`, `unique`, `trim`, enum, default, alt alanlar ve reference hedefi dosyadan; filtre, erişim, UI ve API manifest'ten. Model editörü (`writeDotnetModel`) taslağı önce manifest satırı olarak yazar, sonra generate eder.

Entity G şablonu her model property'sinin sonuna işaret yorumu yazar: `// <json adı> [unique] [trim] [required] [ref=<Klasör>]`, navigation'larda `// nav`. `ref=` navigation'sız reference'ın (document stratejisi) hedefidir; ilişkisel host'ta hedef navigation'dan okunur. Parser (`entityParser.ts`) JSON adını ve bu bayrakları yorumdan, gerisini C# bildiriminden okur. Elle yazılmış entity'ler de okunur (JSON adı camelCase), ama generate listesine girmez.

## Migration

Generator migration yazmaz ve silmez. Generate notu (sağlayıcının `generateNote`'u) PostgreSQL / SQL Server'da komutu gösterir: `dotnet ef migrations add <Ad> -p src/<App>.Infrastructure -s src/<App>.Api`. Açılışta `Program.cs` → `InitializeDatabaseAsync` (sağlayıcının `DependencyInjection.cs`'i): ilişkiselde `Database:MigrateOnStartup` (Development'ta açık); MongoDB'de migration yok, `Database:EnsureIndexesOnStartup` (her ortamda açık) `EnsureCreatedAsync` ile collection'ları ve index'leri kurar. Sırlar yalnızca env'den: `ConnectionStrings__Default`, `Jwt__Secret` (en az 32 karakter), `Jwt__Issuer`, `Jwt__Audience` (`.env.example`).

## Stack tespiti

Manifest `workspace.backendStack` varsa o; yoksa kökte `<App>.slnx` / `.sln` + `src/<App>.Domain` → `dotnet-ef`. Sağlayıcı paketi (`DOTNET_DATABASE_PACKAGES`: Npgsql → PostgreSQL, `Microsoft.EntityFrameworkCore.SqlServer` → SQL Server, `MongoDB.EntityFrameworkCore` → MongoDB) bulunan veritabanı tespit listesine eklenir; generate'in veritabanı her zaman manifest'ten. Keşif: `src/<App>.Domain/<Folder>/<Entity>.cs` (`AuditableEntity`'den türeyen, `.Custom.cs` hariç).

## Sınırlar

- Obje alt alanında iç içe obje / json / map yok (`DotnetUnsupportedError`); alt alan enum'u `string`, alt alan reference'ı `EntityId` (FK / kullanım kontrolü yok).
- `number` her zaman `double`.
- 400 mesajları STJ'nin İngilizce metni; Accept-Language yerelleştirmesi yok (`Messages.cs` sabit Türkçe).
- Elle yazılmış entity'ye reference FK'sız id olur.
- MongoDB: nullable string enum'a göre sıralamada `null` enum'un ilk üyesiyle aynı sırada (Express başa koyar); `json` alanı JSON metni (Express alt doküman); bozuk id 404 (Express 400).
- SQL Server: decimal ölçeği saklanmaz (`"149.90"` → `"149.9"`); unique metin alanı en fazla 850 karakter.

Doğrulama: [verification.md](../verification.md#net-ef-core).
