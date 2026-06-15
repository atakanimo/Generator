# Generator Handlebars yapısı

**Son güncelleme:** 11 Mayıs 2026

Bu doküman `src/main/utils` altındaki şablon helper ve FE emitter dosyalarının rollerini özetler. Amaç: yeni helper eklerken doğru dosyayı seçmek ve `.hbs` içinde iş kuralı biriktirmemek.

---

## Ortak ilkeler

- **Şablon = iskelet.** `templates/backend/**` ve `templates/frontend/**` içinde tip/stack/rol/`hasSearchableFields` gibi kararlar mümkün olduğunca **helper veya TS emitter** içindedir (Task 56).
- **Tek predicate kaynağı:** Arama alanı var mı, ilişkisel searchable var mı, vb. için `handlebars-schema-predicates.ts` kullanılır; Handlebars helper’ları burayı sarar.
- **Kayıt sırası:** `registerHandlebarsHelpers()` önce genel + backend helper’ları kaydeder, ardından `registerFrontendHandlebarsHelpers()` çalışır. FE tarafında özellikle `feFilterQueryPropLine` kaydı, `feServiceGetQueryInterfaceExport` için önce gelmelidir.

---

## Frontend Handlebars kuralları

1. **DTO / import / URL parçaları** için `fe*` helper veya `emitFe*` fonksiyonları kullan; şablonda `{{#if isAdminUser}}` + `{{#if hasSearchableFields}}` bloklarından kaçın (mevcut FE şablonları bu çizgide).
2. **Predicate:** Şablonda `{{#if (hasSearchableFields fields)}}` gibi kullanım kalabilir; helper içeriği `fieldsHaveSearchable` ile aynıdır.
3. **Tablo bileşeni:** Filtre JSX string üretimi ve `normalizeFilterValue` gövdesi **`handlebars-fe-table.ts`** içinde toplanır; `emitFe*` çıktısı ile `handlebars-fe-helpers.ts` içindeki Handlebars helper kayıtları **aynı kaynak fonksiyonlara** dayanır (`Handlebars.helpers` ile sıra bağımlılığı yok).
4. **Yeni FE helper:** Mümkünse `registerFrontendHandlebarsHelpers()` akışına uygun dosyaya ekleyin (sayfa → `handlebars-fe-frontend.ts`, servis client → `handlebars-fe-service-client.ts`, tablo → `handlebars-fe-table.ts`, geri kalan entity/modal/slice → `handlebars-fe-helpers.ts`).

---

## Dosya rehberi (`src/main/utils`)

| Dosya | Rol |
| --- | --- |
| **`templateHelpers.ts`** | `getGeneratorRoot`, `getTemplatesDir`, `getProjectRootPath`, `toCamelCase`; ortak Handlebars helper’lar (`eq`, `hasSearchableFields`, `zodField`, `filterValueGuard`, backend populate, …); sonunda `registerFrontendHandlebarsHelpers()`. |
| **`handlebars-schema-predicates.ts`** | Saf fonksiyonlar: `fieldsHaveSearchable`, `hasSearchableRelationFields`, `uppercaseFirstStr`. |
| **`handlebars-fe-helpers.ts`** | `registerFrontendHandlebarsHelpers()`: shared/page sonrası FE alanı (`FeField`, modal JSON utils, `feTableCellExpr`, tablo çekirdek helper kayıtları — emission için `handlebars-fe-table.ts` export’ları), slice gövdeleri; en sonda `registerFeTableTemplateFragments()`. |
| **`handlebars-fe-frontend.ts`** | Liste sayfası parçaları: `fePage*`, `feServiceImportSuffix`; `fieldsHaveSearchable` re-export / deprecated alias. |
| **`handlebars-fe-service-client.ts`** | `joinFeServiceApiPath`, servis/thunk tarafı URL ve `Get*Query` export satırları (`feJoinedApiUrl`, …). `feFilterQueryPropLine` sonrası kayıt gerekir. |
| **`handlebars-fe-table.ts`** | Tabloya özel **hem** saf emitter’lar (`emitFeTableFilterFieldAttrs`, `emitFeTableFilterNormalizeFunction`, `emitFeTableRelationOptionImports`, `emitFeTableRelationSupportCode`, `feTableNeedsAvatarFields`) **hem** `registerFeTableTemplateFragments()` (`feTableTypesImportLine`, filtre bölümü JSX, …). |

---

## İlgili giriş noktaları

- Şablon derlemeden önce: `templateEngine.ts` ve `modelCreator.ts` → `registerHandlebarsHelpers()`.

---

## Custom block marker’ları — bu dokümanın dışı bıraktığı alanlar

**Handlebars / `.hbs` şablonları**, `// <custom-imports>` vb. marker’ların *hedef projede nereye* yazılacağını tanımlamaz; sayfa (`*Page.tsx`), tablo, slice gövdesi, thunk içi vb. yerleşim **ürün/kullanıcı tercihi**dir. Agent veya refactor, **açık talep olmadan** marker’ları toplu şekilde şablonlara (özellikle liste sayfası / tablo / slice içine) **eklemez**.

- **Kapsam dışı (bu dosya):** Marker isim listesi, güncellemede merge sırası, `customImportsPrecedence` — bunlar `src/main/utils/customBlockMarkers.ts`, `customBlockMerge.ts`, `BackendGenerator` / `FrontendGenerator` tarafındadır; Handlebars helper’ları marker üretmez.
- **Kısmen dışı:** `table-cell.hbs` gibi **satır başına tekrarlanan partial** çıktılarına marker konmaz (birleştirici “dosya başına tek çift” bekler; partial içi tekrar üretim marker’ları bozar).
- **Bu dokümanın konusu:** `fe*` / `emitFe*` ve alan/tabloda görünürlük gibi **üretilen JSX/TS satırları**; custom blok yerleşimi değil.

Marker sözlüğü (referans): `custom-imports`, `custom-types`, `custom-methods`, `custom-routes`, `custom-schema`, `custom-tojson-transform` — tek kaynak: `src/main/utils/customBlockMarkers.ts`.
