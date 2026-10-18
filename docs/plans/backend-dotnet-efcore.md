# Plan: .NET + EF Core backend

Durum: kararlar alındı (§9), uygulama başlamadı. Uygulama başlayınca "nasıl çalışıyor" kısmı `docs/backend/dotnet-efcore.md`'ye taşınır, bu dosya kısaltılır.

## 1. Hedef

- Aynı girdi: NormalizedModel v2 + manifest v3.
- Aynı çıktı davranışı: [api-contract.md](../api-contract.md). `@atakanimo/ata-admin-base` ve mobil, arkada Express mi .NET mi olduğunu bilmez.
- Stack: .NET 10, ASP.NET Core Minimal API, EF Core 10 + PostgreSQL (Npgsql), Clean Architecture. Kimlik uuid v7 (K4).
- Kapsam: yeni projeler. Varlik360 Express + Mongo'da kalır; golden set yalnızca örnek model kaynağıdır.
- Express üreticisinden kod paylaşılmaz; yalnızca NormalizedModel, manifest, sözleşme ve admin config ortaktır.

## 2. Teknoloji

| Parça | Seçim |
| --- | --- |
| Çalışma zamanı | .NET 10 LTS |
| ORM | EF Core 10 + `Npgsql.EntityFrameworkCore.PostgreSQL`, `EFCore.NamingConventions` (snake_case) |
| API | Minimal API: `MapGroup`, endpoint filter, `TypedResults`, yerleşik OpenAPI |
| Uygulama katmanı | Modül başına servis sınıfı (CQRS / MediatR yok) |
| Doğrulama | FluentValidation |
| JSON | System.Text.Json; `JsonUnmappedMemberHandling.Disallow` (strict body) |
| Auth | JWT Bearer + `Admin` policy |
| Test | xUnit + Testcontainers (Postgres) |

## 3. Üretilen host: Clean Architecture, feature klasörleri

Dört proje, bağımlılık içeriye doğru: `Api → Infrastructure → Application → Domain` (Api, Application'a da bağlıdır). Her projede modül adıyla bir klasör; bir modülün dosyaları her katmanda tek klasörde durur.

```
<App>.sln
src/
  <App>.Domain/                         bağımlılık yok
    Common/                             asset: IEntity (Guid Id), ITimestamped, AuditableEntity
    SymbolTypes/
      SymbolType.cs                     G  entity (partial class), enum'lar, complex type'lar
      SymbolType.Custom.cs              K  entity uzantıları

  <App>.Application/                    → Domain; EF Core abstractions (IQueryable, DbSet)
    Common/                             asset
      Abstractions/IAppDbContext.cs     DbSet'ler (partial interface)
      Abstractions/ICurrentUser.cs      Id, IsAdmin
      Results/Result.cs                 başarı / hata (kod + başlık + mesaj); Api zarfa çevirir
      Errors/ErrorCodes.cs              400, 401, …, 463, 500, 503
      Pagination/ListBody.cs            ListBody<TFilters>, PaginatedList<T>, SortOrder
      Pagination/QueryableExtensions.cs ToPaginatedListAsync, ApplySort (beyaz liste)
      Filtering/FilterValues.cs         RangeFilter, DateRangeFilter, OneOrMany<T>
      Filtering/FilterExtensions.cs     regex → ILike (kaçışlı), range, date-range (UTC)
      Ownership/OwnershipScope.cs       None | Field | Self
      Hooks/ServiceHooks.cs             IServiceHooks<TEntity, TFilters, TCreate, TUpdate> + boş varsayılan
    SymbolTypes/
      SymbolTypeDtos.cs                 G  Row, CreateBody, UpdateBody, Filters, Admin* varyantları
      SymbolTypeValidators.cs           G  FluentValidation (partial)
      SymbolTypeFilters.cs              G  Filters → IQueryable (partial; ApplyCustomFilters)
      SymbolTypeProjections.cs          G  Expression<Func<SymbolType, SymbolTypeRow>> (populate dahil)
      SymbolTypeService.cs              G  normal servis (partial)
      SymbolTypeAdminService.cs         G  admin servis (partial)
      SymbolTypeHooks.cs                K  bir kez oluşturulur
      SymbolTypeService.Custom.cs       K  bir kez oluşturulur: ek metotlar, ek DTO / validator
    DependencyInjection.cs              K  AddApplication(); Generated'ı çağırır
    DependencyInjection.Generated.cs    G  servis, admin servis, hook, validator kayıtları

  <App>.Infrastructure/                 → Application
    Common/                             asset: TimestampInterceptor, CurrentUser (HttpContext'ten)
    Persistence/
      AppDbContext.cs                   K  partial; OnModelCreatingPartial
      AppDbContext.Generated.cs         G  DbSet'ler + ApplyConfiguration listesi
      SymbolTypes/
        SymbolTypeConfiguration.cs      G  IEntityTypeConfiguration: tablo, index, enum string, jsonb, FK
        SymbolTypeConfiguration.Custom.cs K  partial void ConfigureCustom(builder)
      Migrations/                       dotnet ef; Generator dokunmaz
    DependencyInjection.cs              K  AddInfrastructure(): DbContext, auth, CurrentUser

  <App>.Api/                            → Application, Infrastructure
    Program.cs                          K  AddApplication / AddInfrastructure / AddApi; UseApi; MapEndpoints
    Common/                             asset
      ApiResponse.cs                    zarf: IsSuccess, Data, UiMessage, ErrorData
      ResultExtensions.cs               Result → zarf + HTTP kodu
      EnvelopeExceptionHandler.cs       IExceptionHandler → zarf (ProblemDetails yok)
      ValidationFilter.cs               FluentValidation → 400 zarf
      JsonSetup.cs, DecimalStringConverter.cs
      AuthSetup.cs                      JWT + Admin policy
    Endpoints/
      SymbolTypes/
        SymbolTypeEndpoints.cs          G  /api/symbol-types (yalnızca normalOperations)
        SymbolTypeAdminEndpoints.cs     G  /api/symbol-types/admin
        SymbolTypeEndpoints.Custom.cs   K  partial: ek uçlar, aksiyonlar
      EndpointRegistry.Generated.cs     G  MapEndpoints(): bütün modül grupları

tests/<App>.Api.Tests/                  K  Generator isteğe bağlı sözleşme testi şablonu verir
```

`G` = Generator'a ait (başlıklı, her generate'te tamamen yeniden yazılır). `K` = kullanıcıya ait (bir kez oluşturulur ya da hiç oluşturulmaz, sonra dokunulmaz). Asset = core dosyası (eksikse oluşturulur, ezilmez).

Kurallar:
- Namespace = proje + klasör (`<App>.Application.SymbolTypes`). Modül klasörü PascalCase çoğul (`SymbolTypes`), entity tekil (`SymbolType`).
- Uç yolları sözleşmeden: `/api/<module-kebab>`, `/api/<module-kebab>/admin`. Admin config `endpoint`'i `EndpointRegistry` / `*AdminEndpoints.cs`'ten okunur.
- Domain'de EF ya da ASP.NET bağımlılığı yok. Application EF Core'a yalnızca `IQueryable` / `DbSet` için bağlı (`IAppDbContext`); `DbContext` Infrastructure'da.
- Yeni modül `Program.cs` ya da `DependencyInjection.cs` değişikliği istemez: `*.Generated.cs` kayıt dosyaları güncellenir.
- Tablo adı modül adı snake_case (`symbol_types`), kolonlar snake_case.

## 4. Custom blok yerine partial

Express'te generated dosyanın içinde `// <custom-…>` blokları birleştiriliyor. C#'ta karşılığı **partial class / partial method**:

- Generated dosyalar her generate'te tamamen yeniden yazılır; marker birleştirme yok.
- Kullanıcı kodu `*.Custom.cs` ve `*Hooks.cs` dosyalarında.

| Express | .NET |
| --- | --- |
| `custom-methods` (service / crud) | `SymbolTypeService.Custom.cs` içinde partial üye |
| `custom-routes` | `SymbolTypeEndpoints.Custom.cs`: `static partial void MapCustom(RouteGroupBuilder group)`; generated `/{id}`'den önce çağrılır |
| `custom-schema` | `.Custom.cs`'te ek DTO / validator |
| `custom-filter-fields(-admin)` | `partial record SymbolTypeFilters` ek property + `partial void ApplyCustomFilters(...)` |
| `custom-types` (model) | Domain `SymbolType.Custom.cs` |
| Model şema seçenekleri | `SymbolTypeConfiguration.Custom.cs` (`ConfigureCustom`) |
| `custom-tojson-transform` | gerekmez: cevap her zaman Row projeksiyonu |

- Sahiplik: generated dosyada `// <auto-generated by Generator />` başlığı; başlıksız dosya kullanıcıya ait, atlanır.
- Express'teki R9 (blok dışı kodun silinmesi) bu stack'te yapısal olarak olmaz.

## 5. Sözleşme eşlemesi

| Konu | .NET uygulaması |
| --- | --- |
| Zarf | Servisler `Result<T>` döner; Api `ResultExtensions` ile `ApiResponse<T>` + HTTP kodu. Beklenmeyen hata → `EnvelopeExceptionHandler` |
| `id` | Entity `Guid Id` (`Guid.CreateVersion7()`); JSON `id` string; `_id` yok |
| Strict body | `JsonUnmappedMemberHandling.Disallow` + DTO'da yalnızca izinli alanlar; `id` DTO'da yok → 400 |
| Liste | `POST get-all`, `ListBody<TFilters>`; `limit` en çok 100; varsayılan `CreatedAt desc, Id desc`; `sortBy` beyaz liste (alanlar + `id`) |
| Filtre | `SymbolTypeFilters.cs`; `regex` → `EF.Functions.ILike` (`%`, `_` kaçışlı), `enum` → tek / `IN`, `date-range` UTC gün sınırı |
| `decimal` | `decimal` + `DecimalStringConverter` (giriş / çıkış string) |
| Tarih | `DateTimeOffset`, UTC |
| `enum` | C# enum + `HasConversion<string>()` + `JsonStringEnumConverter`; değerler `enum.values` yazımıyla |
| `reference` | `Guid <Name>Id` FK + navigation. Row'da populate edilmişse `{ id, ...populate }` (projeksiyon), değilse `"<id>"` |
| `reference[]` | Join tablosu (m-n, skip navigation); Row'da `id[]` ya da obje[] |
| `object` / `object[]` | EF 10 complex type `ToJson()` → jsonb |
| `map` | `Dictionary<string, T>` jsonb |
| `json` | `JsonDocument` jsonb |
| `hidden` | Row DTO'da hiç yok (derleme zamanında garanti) |
| `adminOnly` | Normal Create / Update DTO'da yok, Admin DTO'da var |
| Ownership `field` | Normal serviste her sorgu `Where(x => x.UserId == currentUser.Id)`; create'te `UserId` auth'tan |
| Ownership `self` | `Where(x => x.Id == currentUser.Id)`; normal create yok |
| `normalOperations` | Yalnızca seçilen uçlar yazılır; hiç yoksa normal uç dosyası yok |
| Hook'lar | `SymbolTypeHooks : IServiceHooks<…>` (`BeforeList`, `BeforeGetById`, `BeforeCreate`, `BeforeUpdate`, `BeforeDelete`, `DefaultSort`); hata `Result` dönerse işlem durur |
| Aksiyonlar | `SymbolTypeEndpoints.Custom.cs`: `POST /{id}/actions/{actionId}`, `POST /actions/{actionId}` |

Entity asla doğrudan serialize edilmez; her cevap `Projections.cs`'teki ifadeyle Row'a iner (navigation döngüsü, gizli alan sızıntısı ve N+1 yok).

## 6. Model kaynağı ve migration

- **Kaynak:** dar bir TS parser (`src/main/parsers/dotnet/`) yalnızca Generator'ın yazdığı entity şeklini okur; ayarlar her zamanki gibi manifest'te. Başlıksız (elle yazılmış) entity'ler yalnızca ilişki hedefi olarak okunur (ad + `Id`).
- Entity ve configuration her generate'te yeniden yazılır. Ek öznitelik / yapılandırma `.Custom.cs` dosyalarına; `native`'de saklanmaz.
- **Migration Generator'ın işi değil.** Generate sonrası UI komutu gösterir: `dotnet ef migrations add <Ad> -p src/<App>.Infrastructure -s src/<App>.Api`. Generator migration yazmaz, silmez.

## 7. Generator tarafı

```
src/main/generators/dotnet-efcore/
  DotnetEfGenerator.ts          BaseGenerator'dan; BackendGenerator'a dal eklenmez
  dotnetContext.ts              NormalizedModel → şablon bağlamı (C# tipleri, DTO alanları, validator kuralları, yollar)
  dotnetLayout.ts               proje / klasör / namespace yolları (tek yer)
src/main/templates/backend-dotnet-efcore/<Layer>/*.hbs
src/generator-assets/dotnet-efcore/<Layer>/Common/**
src/main/parsers/dotnet/        entity okuyucu
src/main/utils/stackDetect.ts   .sln + Npgsql paketi → 'dotnet-efcore'
```

- Stack proje düzeyinde seçilir (manifest `workspace.backendStack`); NormalizedModel'e stack alanı eklenmez.
- Yeni proje için Generator iskeleti bir kez kurar (`.sln`, 4 proje, `Program.cs`, `DependencyInjection.cs`, asset'ler).
- Şablonlarda iş mantığı yok; kararlar `dotnetContext.ts`'te.
- UI: proje seçiminde stack gösterilir; Schema Designer aynı kalır.

## 8. Doğrulama

| Kapı | Nasıl |
| --- | --- |
| Örnek host | `scripts/verify/fixtures/dotnet-host/` (iskelet) + golden set'ten türetilmiş model manifest'i |
| Üretim | `node scripts/verify/regen-dotnet.mjs <etiket>`: kopyaya üret → `dotnet build` 0 hata, 0 uyarı (nullable açık) |
| Idempotent | İki generate arası fark 0; `K` dosyaları bayt bayt aynı |
| Sözleşme eşliği | `node scripts/verify/contract-parity.mjs`: aynı senaryolar Express (yerel Mongo) ve .NET (yerel / Testcontainers Postgres) üzerinde; cevap şekilleri, hata kodları aynı |
| Admin config | `admin-config-check` .NET host'un uç yollarıyla |
| Tarayıcı | En son: admin-base playground ya da bir admin host'u .NET BE'ye yönlendirilerek |

## 9. Kararlar

| # | Konu | Karar |
| --- | --- | --- |
| 1 | .NET sürümü | .NET 10 LTS |
| 2 | Proje yapısı | Clean Architecture, 4 proje, her katmanda feature (modül) klasörleri |
| 3 | API stili | Minimal API |
| 4 | Doğrulama | FluentValidation |
| 5 | Model kaynağı | Dar TS parser (Generator'ın entity şekli) + manifest |
| 6 | `reference[]` | Join tablosu |
| 7 | `object` / `object[]` | EF 10 complex type `ToJson()` |
| 8 | Kapsam | Yeni projeler; Varlik360 taşınmaz |
| 9 | Uygulama katmanı | Servis sınıfı (CQRS / MediatR yok) |

## 10. Aşamalar

| Aşama | İş | Bitiş ölçütü |
| --- | --- | --- |
| D0 | Örnek host elle yazılır (4 proje, 1 model: symbol-types eşdeğeri) | Elle host sözleşme eşliğini geçer |
| D1 | Asset'ler ve iskelet örnek host'tan çıkarılır; Generator iskelet + bootstrap | Boş host `dotnet build` |
| D2 | Basit alanlar (string, number, boolean, date, enum): entity, configuration, DTO, validator, filters, projection, servis, uçlar, kayıt dosyaları | 1 model üretilir, cevaplar elle host ile aynı |
| D3 | `reference` / `reference[]` (populate), `decimal`, `object` / `object[]`, `map`, `json` | Golden set modelleri derlenir |
| D4 | Ownership (`field` / `self`), `hidden`, `adminOnly`, `normalOperations`, hook'lar, admin servis / uçlar | Sözleşme eşliği testi yeşil |
| D5 | Entity parser, stack tespiti, UI'da stack, manifest `backendStack` | Arayüzden uçtan uca generate |
| D6 | Doğrulama betikleri (§8), `docs/backend/dotnet-efcore.md`, `.cursor/rules/backend-dotnet-efcore.mdc` | Kapılar betikte, dokümanlar "nasıl çalışıyor" |
