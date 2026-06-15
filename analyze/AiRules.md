# AI Rules - Working Agreement

**Kaynaklar:** `analyze/rules.md` + `analyze/CODING_RULES.md` + `analyze/beAnalyze.md`  
**Son Güncelleme:** 11 Mayıs 2026

---

## 0) Frontend template business-logic yasağı (zorunlu)

- `templates/frontend/**.hbs` içinde **business logic yazılmaz** (tip/flag branching, stack/role ayrımı vb.).
- Yanlış:
  - `{{#if (eq type "string")}}string{{/if}}`
- Doğru:
  - `{{tsType type}}` / `{{someHelper ...}}`
- Kural: template’ler sadece **presentational** koşullar içermeli; bütün karar/branch mantığı `templateHelpers.ts` (helper/mapper) katmanına taşınır.

---

## 1) Backend stack scope (zorunlu)

- Bu dokümandaki backend kuralları sadece `Express + Mongo/Mongoose + TypeScript` için geçerlidir.
- Static core bootstrap dosyaları yalnızca bu stack için kullanılır.
- `.NET`, `TypeORM`, `Prisma` gibi stack'ler bu dosyaları reuse etmez; kendi infrastructure standardını kullanır.
- Generator önce backend stack'i detect eder, sonra stack'e ait asset setini seçer.
- Stack dışı core dosyalar hedef projeye copy edilmez.
- Node.js + Mongoose için model discovery yalnızca `src/models` ile sınırlanamaz; `src/modules/**` altındaki `*.model.ts` dosyaları da birincil tarama kapsamındadır.

---

## 2) Ana üretim prensibi

- Raw model dosyası doğrudan template'e verilmez.
- Zorunlu akış:
  - `Project Path -> Model Discovery -> Model Parse -> NormalizedModel -> Template Context -> Generation Queue -> Safe File Write`
- Üretim kararları her zaman `NormalizedModel` üzerinden alınır.

---

## 3) Modül ve naming standardı

- Her backend modülü toplam 9 dosyadan oluşur (`src/modules/{module}/` altında). `{module}` üreticide **kebab-case** kök isimdir (ör. `symbol-types` → `symbol-types.model.ts`).
  - `{module}.model.ts`
  - `{module}.crud.ts`
  - `{module}.filters.ts`
  - `{module}.types.ts`
  - `{module}.service.ts`
  - `{module}.service.admin.ts`
  - `{module}.schema.ts`
  - `{module}.routes.ts`
  - `{module}.routes.admin.ts`
- Express’in zorunlu bir dosya adı kuralı yoktur; bu yapı generator ve hedef projede **modül kökü + katman suffix** ile tutarlılık sağlar (Node/TS ekosisteminde kebab-case dosya adı yaygındır).
- İsim üretiminde manuel string concat yapılmaz.
- Zorunlu naming helper yaklaşımı korunur: `camelCase`, `pascalCase`, `kebabCase`, `pluralize`, `singularize`.

---

## 4) Generation order ve dependency

- Ordered generation zorunludur:
  1. `model`
  2. `crud`
  3. `filters`
  4. `types`
  5. `service`
  6. `service.admin`
  7. `schema`
  8. `routes`
  9. `routes.admin`
- Dependency zinciri korunur:
  - `routes -> schema + service`
  - `service -> filters + crud`
  - `crud -> model`
  - `filters -> types`
  - `schema -> types`
- Paralel üretim yalnızca bağımsız dosyalarda kullanılabilir.

---

## 5) Safe update / custom block koruma

Update akışı:
1. Mevcut dosya okunur
2. Custom block içerikleri extract edilir
3. Yeni template render edilir
4. Custom block içerikleri merge edilir
5. Dosya yazılır

Kurallar:
- Generated alanlar overwrite edilebilir.
- Custom block içerikleri overwrite edilemez.
- Marker bozuk/eksik durumları warning veya error olarak loglanır.

**Şablonlar ve marker yerleşimi:** `.hbs` dosyalarına marker’ları “her dosyada altı çift olsun” diye **sayfa / tablo / slice gövdesi içine** toplu eklemek ürün kararıdır; kullanıcı kendi hedef dosyasında marker’ları istediği yere koyar. Agent, **açık kullanıcı talebi olmadan** bu yerleşimi şablonlara dayatmaz. Birleştirme tarafı: `src/main/utils/customBlockMarkers.ts` + `customBlockMerge.ts` + `BackendGenerator` / `FrontendGenerator` (Handlebars helper’ları marker üretmez). Satır başına tekrarlanan partial çıktıları (`table-cell` vb.) marker için uygun değildir.

Standart marker isimleri (tek kaynak: `getDefaultCustomBlockMarkerNames()` / `DEFAULT_CUSTOM_BLOCK_MARKER_NAMES`):
- `// <custom-imports> ... // </custom-imports>`
- `// <custom-types> ... // </custom-types>`
- `// <custom-methods> ... // </custom-methods>`
- `// <custom-routes> ... // </custom-routes>`
- `// <custom-schema> ... // </custom-schema>`
- `// <custom-tojson-transform> ... // </custom-tojson-transform>`

---

## 6) NormalizedModel minimum contract

- `name`, `camelName`, `pascalName`, `kebabName`, `pluralCamelName`
- `fields[]`:
  - type: `string | number | boolean | date | objectId | decimal | array | object`
  - `required`, `nullable?`
  - `filter` metadata (`regex | exact | objectId | boolean | number | date`)
  - `relation` metadata (`oneToOne | oneToMany | manyToOne | manyToMany`)
- `ownership` metadata:
  - `normalApiFromAuth`
  - `adminApiBodyAllowed`
  - `adminApiFilterable`
- `indexes[]`
- `timestamps`

---

## 7) Ownership ve ObjectId kuralları

- Normal endpoint:
  - ownership field body'den alınmaz
  - auth context veya base service katmanından set edilir
  - update payload'dan ownership field silinir
- Admin endpoint:
  - ownership field body/filter üzerinden kullanılabilir
  - create'te required, update'te optional olabilir
- `objectId` ve relation alanlarda string -> ObjectId dönüşümü service katmanında yapılır.
- Standart dönüşüm: `Types.ObjectId.createFromHexString(...)`.

---

## 8) Express core static bootstrap standardı

Generator aşağıdaki static core dosyaları stack bazlı yönetir:
- `src/core/errors/error-codes.ts`
- `src/core/errors/error.helper.ts`
- `src/core/logging/logger.ts`
- `src/core/pagination/pagination.helper.ts`
- `src/core/response/response.helper.ts`
- `src/core/types/api-contract.ts`

Kurallar:
- Dosya yoksa generator asset'ten copy eder.
- Dosya varsa overwrite etmez.
- Bu dosyalar dynamic template değildir, Handlebars ile render edilmez.
- Bu dosyalar module/entity bağımlı değildir.
- Değişiklik gerekiyorsa overwrite değil migration/versioning yaklaşımı benimsenir.

---

## 9) Pagination standardı

- Tüm `get-all` endpoint'leri pagination + sorting destekler.
- Service import standardı:
  - `extractListPagination`
  - `resolveListSort`
  - kaynak: `@core/pagination/pagination.helper`
- Varsayılan sort: `{ createdAt: -1, _id: -1 }`
- Service akışı:
  1. body'den pagination/sort alanlarını ayrıştır
  2. kalan filter alanlarını filter builder'a ver
  3. `getAllPaginated` çağrısında `limit/page/sort` uygula

---

## 10) Response ve error layer standardı

- Route import standardı:
  - `AtaResponse` -> `@core/response/response.helper`
- Service/custom method import standardı:
  - `SuccessResponse`, `InternalServerErrorResponse`, `ErrorResponse`
- `AtaResponse` her response'a `requestId` uygular ve response event loglar.
- `ErrorResponse` code mapping `ErrorCodes` üzerinden yapılır.
- Plain text ve HTML yardımcıları aynı response helper katmanında yer alır.
- Error layer:
  - `error-codes.ts` code map için tek kaynak
  - `error.helper.ts` service hatalarını `IApiResponse` formatına normalize eder

---

## 11) Template ve katman kuralları

- Template engine: Handlebars.
- Template içinde business logic yazılmaz; logic helper/mapper katmanında çözülür.
- Bu kural özellikle **schema/filter/type** gibi “field type / flag” bazlı üretimlerde kritiktir:
  - **Yanlış:** template içinde `{{#if (eq type "string")}}...{{/if}}` gibi type karşılaştırmaları ve çok dallı koşullar
  - **Doğru:** `{{zodField this "create"}}`, `{{tsType type}}`, `{{mongoFilter this}}` gibi helper/mapper ile satır üretimi
- Template’te izin verilen minimum mantık:
  - basit “section on/off” (örn. admin route var mı?) gibi *presentational* koşullar
  - Custom block marker’ları **yalnızca** kullanıcı/ürün açıkça istediğinde ve tutarlı bir yerleşimle; agent varsayılan olarak sayfa/tablo/slice içine marker yaymaz (`analyze/handlebars.md` — “Custom block marker’ları” bölümü).
- Utility-first yaklaşımı zorunludur:
  - doğrudan `fs` ve manuel compile yasak
  - `fileUtils`, `templateEngine`, `validationUtils`, `errorHandler`, `logger` kullanılır
- Generator class'ları `BaseGenerator` üzerinden ilerler; IPC sadece bridge/wrapper görevi görür.

---

## 12) Logging ve hata davranışı

- Kritik adımların başlangıç ve sonucu loglanır:
  - stack detection
  - model discovery/parse
  - normalized model creation
  - template render
  - safe file write
  - custom block merge
  - core bootstrap check
- Safe file write event tipleri loglanır:
  - `CREATE FILE`
  - `UPDATE FILE`
  - `SKIP FILE`
  - `MERGE CUSTOM BLOCKS`
- Bir step fail olursa:
  - süreç durur
  - fail step loglanır
  - stack trace kaydedilir
  - kullanıcıya anlamlı hata döndürülür

---

## 13) Çalışma taahhüdüm (AI davranışı)

- Bu dosyayı backend generation refactor için birincil referans kabul edeceğim.
- Kod değişikliğinden önce stack scope + `NormalizedModel` + generation order + safe update uyumunu kontrol edeceğim.
- Çelişki durumunda `analyze/CODING_RULES.md` ve `analyze/rules.md` ile hizalayacağım.
