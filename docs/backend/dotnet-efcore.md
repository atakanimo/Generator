# BE: .NET 10 + EF Core

Üretici `src/main/generators/dotnet-efcore/`, şablonlar `src/main/templates/backend-dotnet-efcore/**/*.hbs`, core asset'ler ve iskelet `src/generator-assets/dotnet-efcore/**`, parser `src/main/parsers/dotnet/`, uygulama tarafı `src/main/ipc/dotnetBackend.ts`. Girdi NormalizedModel v2 + manifest v3, çıktı [api-contract.md](../api-contract.md). Express üreticisiyle kod paylaşılmaz. Kararlar: aşağıda [Kararlar](#kararlar).

Stack: .NET 10, ASP.NET Core Minimal API, EF Core 10, FluentValidation, System.Text.Json, JWT Bearer + `Admin` policy, xUnit. Veritabanı host başına seçilir (aşağıda): PostgreSQL (Npgsql), SQL Server (ikisinde `EFCore.NamingConventions` snake_case) ya da MongoDB (`MongoDB.EntityFrameworkCore`). Kimlik tipi `EntityId` (uuid v7; MongoDB'de ObjectId de seçilebilir), JSON'da `id` string.

## Veritabanı sağlayıcısı

- Manifest `workspace.database` + `workspace.idType`: bootstrap yazar, sonra değişmez. İzinli eşleşmeler ve etiketler tek yerde: `src/shared/backendDatabase.ts` (`STACK_DATABASES`; `dotnet-ef`: `postgres` / `sqlserver` + `uuid-v7`, `mongodb` + `uuid-v7` / `objectid`). Alanları olmayan eski manifest okunurken stack'in eski değerini alır (`dotnet-ef` → `postgres` + `uuid-v7`, Express / Python → `mongodb` + `objectid`), sonraki manifest yazımı kalıcı yapar. Generate değeri `requireHostDatabase` ile okur; yoksa ya da stack üretmiyorsa hata.
- `providers/` (`DotnetDbProvider`): `configure` (entity başına `<E>Configuration` satırları ve using'leri), `assetDir`, `generateNote`. `dotnetContext.ts` veritabanı adıyla dallanmaz. İlişkisel sağlayıcılar `relational.ts`'i paylaşır (tablo, FK + navigation, join tablosu, unique index, migration); sağlayıcı yalnız lehçeyi verir. `postgres.ts`: `map` / enum dizisi `HasJsonbConversion()`, `json` `jsonb` kolon. `sqlserver.ts`: üçü de `HasJsonConversion()` (JSON metni, `nvarchar(max)`); unique metin alanı (string, string enum) `HasMaxLength(850)` (index anahtarı en fazla 1700 bayt; modelde daha küçük `maxLength` varsa o, büyükse `DotnetUnsupportedError`).
- SQL Server katmanının `AppDbContext.cs`'i: veritabanı collation'ı `Latin1_General_100_CS_AS_SC_UTF8` (büyük / küçük harfe duyarlı; unique ve eşitlik filtresi Postgres / Mongo gibi, arama küçük harfe çevirip karşılaştırır), `decimal` `decimal(38, 18)` + `TrimmedDecimalConverter` (okunan değer sondaki sıfırlar olmadan: `"149.90"` yazılır, `"149.9"` döner; Postgres yazılan ölçeği korur). `Microsoft.Data.SqlClient`'ın çektiği `System.Security.Cryptography.Pkcs` transitive pin'le yamalı sürümde (NuGet audit, `TreatWarningsAsErrors`).
- Asset üst katmanı `generator-assets/dotnet-efcore/providers/<db>/`: ortak ağaçla (`_skeleton/`, `<Layer>/`) aynı yollar; aynı yoldaki dosya ortak olanın yerine yazılır. Postgres katmanı: `Directory.Packages.props`, `.env.example`, `appsettings*.json`, Infrastructure `.csproj` ve `DependencyInjection.cs` (`AddInfrastructure`, `InitializeDatabaseAsync`), `Infrastructure/Common/JsonbConversion.cs`, `Infrastructure/Common/DbErrorClassifier.cs`. Asset kopyası `bin/` / `obj/` klasörlerini atlar (editörün iskelet projesini restore etmesi).
- Kısıt ihlali: `EnvelopeExceptionHandler` geneldir, istisnayı `IDbErrorClassifier` (`Application/Common/Errors`) sınıflandırır: `Duplicate(field)` / `InUse` → 409. Postgres: `23505` / `23503`; SQL Server: `SqlException.Number` 2601 / 2627 / 547.
- Mesajlar (`Application/Common/Errors/Messages.cs`): istek diline göre TR / EN (`UseRequestLocalization`, `Accept-Language`; varsayılan `tr`). Okunamayan gövdede System.Text.Json'ın metni yerine `Geçersiz değer: <json yolu>` (`EnvelopeExceptionHandler`). Obje alt alanı json / map / obje desteklenmez: generate `DotnetUnsupportedError` (kapı `regen-dotnet`).
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
1. `ensureDotnetHost`: iskelet (`_skeleton/`) ve core asset'ler (`<Layer>/Common/**`), üstüne sağlayıcı katmanı; eksikse yazılır. `__App__` / `__app__` belirteci yolda ve içerikte uygulama adıyla değişir. Var olan host'a sonraki asset düzeltmeleri kendiliğinden gitmez: `node scripts/assets-sync.mjs <host>` farkı gösterir, `--diff` / `--apply yol…` ile onaylanan dosyalar yazılır (skeleton hariç; Python ve Express host'ları da).
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

## Export (CSV, PY12)

`api.adminOperations` `export` içeriyorsa (opt-in) admin endpoint'lerine `POST …/export` gelir (api-contract §2 "Export"). `I<E>AdminService.ExportAsync(ExportBody<<E>Filters>)` (G servis; `CrudServiceBase` değişmez): `ExportRules.ResolveColumns` (bilinmeyen kolon / başlık sayısı / `sortBy` → 400) → liste sorgusunun aynısı (`Scope`, `BeforeList`, filtre, sıra) → `ToRowListAsync(Row, RowLimit + 1)` (50.000 üstü 400) → `PopulateAsync` + `MapRows`. Kolonlar ve ilişki display alanları `<E>Export.Fields` / `<E>Export.Display` (`I<E>Service.cs`). Asset'ler: `Application/Common/Export/` (`ExportBody`, `ExportRows`, `ExportRules`; `ExportQuery` ilişkiselde `Select(row).Take(n)`, MongoDB sağlayıcı katmanında entity okuyup satırı bellekte kurar), `Api/Common/CsvExportResult.cs` (`ToCsv`: hata zarf; satırlar JSON ayarlarıyla wire'a çevrilip hücre kuralları `JsonElement` üzerinden, BOM'lu RFC 4180, `Content-Disposition` elle). Dosya adı `kebabCase(entityName)-<YYYY-MM-DD>.csv`.

## Model kaynağı ve parser

Bir modülün modeli = entity dosyası + manifest satırı (`mergeModel`): tip, `required`, `isArray`, `unique`, `trim`, enum, default, alt alanlar ve reference hedefi dosyadan; filtre, erişim, UI ve API manifest'ten. Model editörü (`writeDotnetModel`) taslağı önce manifest satırı olarak yazar, sonra generate eder.

Entity G şablonu her model property'sinin sonuna işaret yorumu yazar: `// <json adı> [unique] [trim] [required] [ref=<Klasör>]`, navigation'larda `// nav`. `ref=` navigation'sız reference'ın (document stratejisi) hedefidir; ilişkisel host'ta hedef navigation'dan okunur. Parser (`entityParser.ts`) JSON adını ve bu bayrakları yorumdan, gerisini C# bildiriminden okur. Elle yazılmış entity'ler de okunur (JSON adı camelCase), ama generate listesine girmez.

## Migration

Generator migration yazmaz ve silmez. Generate notu (sağlayıcının `generateNote`'u) PostgreSQL / SQL Server'da komutu gösterir: `dotnet ef migrations add <Ad> -p src/<App>.Infrastructure -s src/<App>.Api`. Açılışta `Program.cs` → `InitializeDatabaseAsync` (sağlayıcının `DependencyInjection.cs`'i): ilişkiselde `Database:MigrateOnStartup` (Development'ta açık); MongoDB'de migration yok, `Database:EnsureIndexesOnStartup` (her ortamda açık) `EnsureCreatedAsync` ile collection'ları ve index'leri kurar. Sırlar yalnızca env'den: `ConnectionStrings__Default`, `Jwt__Secret` (en az 32 karakter), `Jwt__Issuer`, `Jwt__Audience` (`.env.example`).

## Stack tespiti

Manifest `workspace.backendStack` varsa o; yoksa kökte `<App>.slnx` / `.sln` + `src/<App>.Domain` → `dotnet-ef`. Sağlayıcı paketi (`DOTNET_DATABASE_PACKAGES`: Npgsql → PostgreSQL, `Microsoft.EntityFrameworkCore.SqlServer` → SQL Server, `MongoDB.EntityFrameworkCore` → MongoDB) bulunan veritabanı tespit listesine eklenir; generate'in veritabanı her zaman manifest'ten. Keşif: `src/<App>.Domain/<Folder>/<Entity>.cs` (`AuditableEntity`'den türeyen, `.Custom.cs` hariç).

## Kararlar

Planlar (`docs/plans/backend-dotnet-efcore.md`, `backend-dotnet-database-providers.md`) tamamlandı ve silindi (2026-10-26); ayrıntılı aşama notları git geçmişinde. Koddaki `K<n>` atıfları aşağıdaki sağlayıcı kararlarıdır.

### Genel

| # | Konu | Karar |
| --- | --- | --- |
| 1 | .NET sürümü | .NET 10 LTS |
| 2 | Proje yapısı | Clean Architecture, 4 proje, her katmanda modül klasörü |
| 3 | API stili | Minimal API |
| 4 | Doğrulama | FluentValidation |
| 5 | Model kaynağı | Dar TS parser (Generator'ın entity şekli, işaret yorumları) + manifest |
| 6 | `reference[]` | Join tablosu |
| 7 | `object` / `object[]` | EF 10 complex type `ToJson()` |
| 8 | Kapsam | Yeni projeler; Varlik360 taşınmaz |
| 9 | Uygulama katmanı | Servis sınıfı (CQRS / MediatR yok) |
| 10 | Servis yapısı | Tek generic `ICrudService<…>` + `CrudServiceBase<…>` (asset); modül başına `partial interface I<E>Service` (G) + `.Custom.cs` (K) |
| 11 | Create / update cevabı | Express'le aynı: ilişki id; populate yalnızca list / getOne (admin-base cevabı kullanmıyor, sorguları yeniliyor) |
| 12 | Opsiyonel alan | .NET `null` yazar, Express yazmaz; ikisi de "değer yok" (sözleşme §4) |
| 13 | Auth varsayılanı | `api.requiresAuth` yoksa normal uçlar auth ister (Express gibi); anonim yalnızca `false` ile |
| 14 | Klasörler | Stack başına: `generators/`, `templates/backend-*`, `generator-assets/` altında `express-mongoose` / `dotnet-efcore`; admin config ortak |
| 15 | Çözüm dosyası | `.slnx` (.NET 10 varsayılanı); tespit `.sln`'i de kabul eder |
| 16 | Stack kaydı | Manifest `workspace.backendStack` (`'nodejs-mongoose' \| 'dotnet-ef'`) |

**Update'te `null` (JSON Merge Patch, sözleşme §5):** update gövdeleri `PatchBody`'den türer.
- **Yaklaşım:** update gövdeleri `PatchBody`'den türer (`Application/Common/Patch/PatchBody.cs`, asset). Her özelliğin `init`'i `Sent()` çağırır (C# 14 `field` anahtar kelimesi: `public string? Note { get; init { field = value; Sent(); } }`); System.Text.Json setter'ı yalnız JSON'da olan özellik için çağırdığından `body.Has(nameof(body.Note))` "gönderildi mi" bilgisini verir. `MapUpdate` opsiyonel alanı `Has` ise `null` dahil yazar; zorunlu alan ve liste için validator'da `NotNull().When(x => x.Has(...))` (mesaj `PatchBody.NullNotAllowed`), atama eskisi gibi `is not null`.
- **Neden bu, `Optional<T>` + converter değil:** özellik tipleri değişmez (`string?`, `Guid?`), elle yazılmış hook / servis kodu ve FluentValidation kuralları aynen derlenir; converter fabrikası, `JsonSerializerOptions` kaydı ve `.Value` açma yok. `JsonElement`'ten eşleme ise tip güvenliğini ve STJ doğrulamasını (strict, enum, decimal) kaybettirirdi. Bedeli: üretilen satır biraz uzun; gövde nesnesini kodda `with` / initializer ile kuran yer de `Has`'i doğru doldurur (initializer da `init`'i çağırır).

### Veritabanı sağlayıcıları ve id tipi (K1–K15)

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

## Sınırlar

- Obje alt alanında iç içe obje / json / map yok (`DotnetUnsupportedError`); alt alan enum'u `string`, alt alan reference'ı `EntityId` (FK / kullanım kontrolü yok).
- `number`: `numberFormat: 'int'` → `int`, yoksa `double`.
- Elle yazılmış entity'ye reference FK'sız id olur.
- MongoDB: nullable string enum'a göre sıralamada `null` enum'un ilk üyesiyle aynı sırada (Express başa koyar); `json` alanı JSON metni (Express alt doküman); bozuk id 404 (Express 400).
- SQL Server: decimal ölçeği saklanmaz (`"149.90"` → `"149.9"`); unique metin alanı en fazla 850 karakter.

Doğrulama: [verification.md](../verification.md#net-ef-core).
