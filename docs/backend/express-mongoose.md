# BE: Express + Mongoose + TypeScript

Bu stack'in üreticisi `src/main/generators/express-mongoose/BackendGenerator.ts`, şablonları `src/main/templates/backend-express-mongoose/*.hbs`, core asset'leri `src/generator-assets/express-mongoose/**`. Sözleşme: [api-contract.md](../api-contract.md).

Stack: TypeScript 5.9 (Node.js 22+), Express 4, MongoDB + Mongoose 8, Zod 3 (doğrulama), jsonwebtoken (HS256), i18next (tr / en), pino. Paket yöneticisi npm. Kimlik Mongo `_id` (ObjectId), JSON'da `id`.

## Yeni proje

Arayüzde: Project Location kartında **Yeni Express projesi** → boş klasör + uygulama adı → IPC `project:bootstrapExpress` → `bootstrapExpressProject` (`ipc/expressBackend.ts`; klasörde `package.json` varsa reddeder) → `bootstrapExpressHost` (`generators/express-mongoose/ExpressHostBootstrap.ts`): iskelet `src/generator-assets/express-mongoose/_skeleton/` (K, yalnız yoksa yazılır; belirteçler `__app__` = npm adı kebab-case, `__App__` = verilen ad) + core asset'ler (`ensureExpressCoreAssets`, generate'in kullandığı liste) + manifest `backendStack: nodejs-mongoose`. Klasör açılır ve taranır. Düğmenin yanındaki bilgi ikonu aşağıdaki yapıyı, teknolojileri ve komutları gösterir (tek tanım: `src/shared/backendStacks.ts`).

```bash
cp .env.example .env     # JWT_SECRET (en az 32 karakter, yoksa uygulama açılmaz), MONGODB_URI
npm install
npm test                 # iskelet testleri (node:test + tsx; Mongo gerekmez)
npm run dev              # tsx watch → http://localhost:3000/api/health
# Model: "Model Ekle" (editör) → Schema Designer → generate. Router'ın src/app.ts'e bağlanması için
# "Update existing files" açık olmalı (kapalıyken route import + app.use elle eklenir).
npm run typecheck
npm run build && npm start   # tsc + tsc-alias → dist/
```

Mongo yerelde: `docker run -d -p 27017:27017 mongo:7`. Mongo kapalıyken uygulama açılır, sağlık ucu `mongoConnected: false`.

```
package.json  tsconfig.json (yol takma adları)  tsconfig.build.json  .env.example  .gitignore  .generator/manifest.json
src/index.ts                 (K) sunucu: dotenv, JWT_SECRET kontrolü, listen, connectDB
src/app.ts                   (K) createApp(): cors, requestId, istek bağlamı, dil, JSON; router bağlamaları; 404 + hata handler'ı
src/config/                  (K) env.ts (requireJwtSecret), i18n.ts
src/locales/tr.ts, en.ts     (K) common.*, ortak crud.*, auth.*
src/db/connection.ts         (K) mongoose.connect
src/helpers/                 (K) t(), getCurrentLanguage
src/utils/requestContext.ts  (K) AsyncLocalStorage: requestId, dil, userId, roller
src/core/index.ts            (K) @core barrel (validate dahil)
src/core/middleware/         (K) cors, request-id, request-context, i18n, auth, admin-auth, validate, error (@middlewares)
src/core/{errors,filters,logging,pagination,response,schema,services,types}/   (asset)
src/modules/health/health.routes.ts   (K) GET /api/health
src/modules/<m>/             (G) model, crud, filters, types, service(.admin), schema, routes(.admin); (K) hooks
tests/health.test.ts         (K)
```

Auth: `Authorization: Bearer <JWT>`; kullanıcı id'si `userId` ya da `sub`, `exp` zorunlu, `JWT_ISSUER` / `JWT_AUDIENCE` ayarlıysa denetlenir. Admin: `role` (string ya da liste) `ADMIN_ROLE`'ü (varsayılan `admin`, üç stack'te aynı) içerir ya da id `ADMIN_USER_IDS`'te (Varlik360 kuralı). Dil: `lang` / `x-lang` başlığı, `?lang=`, `Accept-Language`; varsayılan `tr`. `X-Request-Id` (yoksa `X-Trace-Id`) okunur, yanıta ve zarfın `traceId`'sine yazılır.

Bilinen: Express model editöründe `numberFormat` (int) seçimi yok ve Mongoose model dosyası bu bilgiyi taşımaz (`src/shared/modelDraft.ts`); editörden oluşturulan modelde sayı alanı ondalık kabul eder. Kapı: `scripts/verify/express-bootstrap.mjs` ([verification.md](../verification.md)).

## Çağrı zinciri

`SchemaDesignPage` → `projectSlice.generateBackend` → preload → IPC `project:generateBackend` → `ipc/backendGenerator` → `BackendGenerator.generate`.

`generate` sırası:
1. Klasörler (`setupDirectories`, `ensureProjectDirectories`).
2. Core bootstrap (`ensureCoreBootstrapFiles`): eksik core dosyaları oluşturulur.
3. Modül dosyaları (aşağıdaki sırayla).
4. Route enjeksiyonu: yalnızca `updateExistingFiles=true` iken, idempotent. Normal işlemi olmayan modele normal route eklenmez. Hedef dosya `findBackendAppFile` (`utils/backendAppFile.ts`; base URL de buradan okunur): `src/app.ts`, `src/index.ts`, `src/server.ts` (ve kökteki eşleri) arasında router bağlayan (`app.use('/…', …)`) ilk dosya; Varlik360'ta `src/app.ts` (`createApp`). Route dosyası zaten import edilip bağlanmışsa (`findAdminMountPath` / `findNormalMountPath`, yol ne olursa olsun) eklenmez. Import dosyadaki mevcut router import'larının biçimini izler (`@modules/…` ya da `./modules/…`); `app.use` son router mount'undan sonra, onun girintisiyle (hata / swagger handler'larından önce). Host'a özel ara katmanlar (Varlik360 `adminApiRateLimiter`) eklenmez

## Üretilen dosyalar: `src/modules/<module>/` (kebab-case)

| # | Dosya | Şablon | İçerik |
| --- | --- | --- | --- |
| 1 | `<m>.model.ts` | `model.hbs` | Mongoose şema + arayüz. Bağlam `buildMongooseModelContext` (BE generate ve model kaydetme aynı bağlamı kullanır) |
| 2 | `<m>.crud.ts` | `crud.hbs` | `BaseCrudService`, `CrudAuthScope`, `HIDDEN_FIELDS`. Mesaj geçmez: hata / başarı metinleri host'un ortak `crud.*` anahtarları |
| 3 | `<m>.filters.ts` | `filters.hbs` | Filtre → Mongo sorgusu. `filterType` zinciri `handlebars-be-filters.ts`'te |
| 4 | `<m>.types.ts` | `types.hbs` | `Get<Entity>Filters`, `<Entity>ListBody`, enum union'ları, `<Entity>ServiceHooks` |
| 5 | `<m>.service.ts` | `service.hbs` | CRUD delegasyonu + hook çağrıları (doğrudan `Model.find*` yok) |
| 6 | `<m>.service.admin.ts` | `service.admin.hbs` | Admin servis (admin açıksa) |
| 7 | `<m>.schema.ts` | `schema.hbs` | Zod: `<Entity>GetAllBodySchema = ListPaginationBodySchema.extend({ filters })`, `<Entity>IdParamSchema`, create / update (+ gerekirse `*AdminSchema`) |
| 8 | `<m>.routes.ts` | `route.hbs` | Normal route (normal işlem varsa ya da dosya zaten varsa) |
| 9 | `<m>.routes.admin.ts` | `route.admin.hbs` | Admin route (admin açıksa) |
| — | `<m>.hooks.ts` | `hooks.hbs` | Bir kez, başlıksız oluşturulur; kullanıcıya aittir |

Bağımlılık: routes → schema + service; service → filters + crud; crud → model; filters / schema → types. Eski `src/models|services|routes|types` klasörlerine dosya yazılmaz.

Sonuç: `GenerateBackendResult.files` = `model, crud, filters, types, service, serviceAdmin, schema, route, routeAdmin, hooks`.

## Dosya sahipliği

- `// Auto Generated By Generator` başlığı olan dosya Generator'ındır; başlıksız dosya kullanıcıya aittir (`generatedFileOwnership.ts`). Generate kullanıcı dosyasını atlar (`user-owned`), model kaydetme reddeder.
- Model dosyaları her generate'te yeniden yazılır. Bu yüzden parser'ın kaynağı kayıpsız okuması zorunludur (enum, default, `select: false` → `access.hidden`, bilinmeyen seçenekler, TS tipi, `?`, JSDoc, `timestamps`, `mongoose.model` adı, `collection`).

## Custom bloklar (update mode)

`updateExistingFiles=true`: mevcut dosya okunur → custom bloklar çıkarılır → render → merge → yazılır. Bozuk marker → o dosya üretilmez.

Marker'lar (`// <ad>` … `// </ad>`, kaynak `utils/customBlockMarkers.ts`):

| Marker | Yer | Kullanım |
| --- | --- | --- |
| `custom-imports` | hepsi | Ek import'lar |
| `custom-types` | model, types | Ek tip / adlandırılmış alt şema (Generator aynı adı ayrıca üretmez) |
| `custom-methods` | crud, filters, service | Ek metot; ek filtre anahtarlarının sorgu mantığı |
| `custom-routes` | routes | Ek route; generated `/:id`'den **önce** durur |
| `custom-schema` | schema | Ek Zod şeması |
| `custom-filter-fields` / `custom-filter-fields-admin` | schema | Normal / admin filtre şemasına ek anahtar |
| `custom-tojson-transform` | model | `toJSON` transform'u (yalnızca `lean: false` okumalarda çalışır) |

**Kural:** generated dosyada custom blok dışına kod yazılmaz; regenerate'te silinir. İş kuralı hook'a, ek uç / metot custom bloğa.

## Servis hook'ları

- Generated servis her CRUD metodundan önce `<m>.hooks.ts`'teki hook'u çağırır:
  - `beforeList` (filtreleri değiştirir), `beforeGetById`, `beforeCreate`, `beforeUpdate`, `beforeDelete`. Hata cevabı dönen hook işlemi durdurur, cevap istemciye gider.
  - `afterCreate(row)`, `afterUpdate(row)`, `afterDelete(row)`: yazma kaydedildikten sonra, yazılan / silinen kayıtla. Geri alınmaz; hook hata fırlatırsa cevap hata olur, kayıt durur. Tutarlılık kontrolü `before*`'tadır.
  - `mapRows(rows)`: bir list sayfasının bütün satırları (ya da getOne'ın tek satırı) tek çağrıda, cevaba yazılmadan önce; toplu IO, N+1 yok. Aynı sırayla döner.
  - Sözleşme ve yardımcılar asset'te: `@core/services/service-hooks` (`ServiceHooks<TFilters, TInput>`, `mapListRows`, `mapOneRow`, `runAfterWrite`). Üretilen servisler yalnızca bunları çağırır; modül başına kopya yardımcı yok. `afterDelete`'e silinen kaydı `BaseCrudService.deleteById(…, { onDeleted })` verir.
  - Satırlar `toWire` öncesi DB kaydıdır (`_id`); `lean: false` okuyan modülde Mongoose dokümanıdır.
  - `defaultSort?: Record<string, 1 | -1>`: istek `sortBy` göndermezse; varsayılan `{ createdAt: -1, _id: -1 }`.
- Export'lar: `<camel>Hooks` (normal), `<camel>AdminHooks` (admin). Tip: `<Entity>ServiceHooks`. Hook yoksa davranış değişmez.
- Servisleri kullanıcıya ait modülde hooks dosyası oluşturulmaz.

## Normal API ve ownership

- `api.normalOperations` normal `routes.ts`'te hangi uçların olacağını belirler. `BackendGenerator.resolveNormalApi`:
  - auth + ownership yoksa yazma işlemlerini düşürür;
  - `self` ownership'te `create`'i düşürür (`Normal API operations dropped` loglanır).
- `normalOperations` yoksa (UI dışı çağıran) hepsi istenmiş sayılır. Manifest'te `api` yoksa `utils/moduleApiDetect.ts` seti mevcut modül dosyalarından okur.
- Yeni modelde normal işlem yoksa route dosyası ve index enjeksiyonu yok. Var olan route dosyası yalnızca custom route'larla yeniden üretilir.
- `ownership.kind: 'field'` → `CrudAuthScope = true` (auth kullanıcısının `userId`'si). Admin update `userId` değiştirebilir.
- `ownership.kind: 'self'` → kapsam `{ _id: authUserId }` (`core/services/crud-scope.ts` `applyAuthScope`); create'te `userId` yazılmaz.
- **Uyarı:** ownership `self`'e geçince (ya da `self`'ten çıkınca) servisteki her `<m>Crud` çağrısının kapsamı değişir. Custom bloktaki `<m>Crud` kullanımları sessizce boş ya da yanlış kayıt dönebilir; Generator uyarmaz. Ownership değişince custom bloklarda `<m>Crud`'u arayın, gerekirse açık kapsam verin ya da admin crud'u kullanın.
- `userId` / `self` kapsamlı modüllerde job kodu admin crud'u (`<entity>AdminCrud`) kullanır; kapsamlı crud istek auth bağlamı ister.
- `adminOnly` alanlar normal create / update şemasında yoktur.

## Export (CSV, PY12)

`api.adminOperations` `export` içeriyorsa (opt-in) admin router'a `POST /export` gelir (api-contract §2 "Export"): `<E>ExportBodySchema` (strict), servis `exportCsv` liste sorgusunun aynısını (filtre, scope, hook'lar, sıra, populate, `mapRows`) sayfasız okur (`limit: EXPORT_ROW_LIMIT + 1`, fazlası 400). Biçim core asset `services/export-csv.ts` (`resolveExportColumns`, `cellText`, `renderCsv`, `sendCsv`); kolonlar ve ilişki display alanları route şablonunda literal. Dosya adı `kebabCase(entityName)-<YYYY-MM-DD>.csv`. Host locale'lerinde `crud.exportUnknownField`, `crud.exportHeaders`, `crud.exportTooMany` (yoksa İngilizce varsayılan).

## Update ve `null` (JSON Merge Patch)

Sözleşme §5: gönderilmeyen alan değişmez, opsiyonel alana `null` alanı temizler, zorunlu alana ya da diziye `null` 400 (zod). `BaseCrudService.updateById` gövdeyi `toMergePatch` (`core/services/merge-patch.ts`) ile `{ $set, $unset }`'e çevirir: `null` → `$unset` (satırda alan kalmaz; istemci `null` okur), `undefined` düşer. Custom kodda `<m>Crud.updateById`'e verilen `null` da alanı siler.

## Gizli alanlar

`access.hidden` alanlar `crud.hbs` `HIDDEN_FIELDS`'e gider (`BaseCrudService`'in 4. argümanı, admin dahil). list / getById / find'da projection, create ve lean sonuçlarında strip (`core/services/crud-projection.ts`). Şemaya `select: false` yazılmaz; gizli alan filtrelenemez. Bu modelleri dönen custom kod `stripHiddenFields`'i kendisi uygular.

## Şablon beklentileri

- Şablonda iş mantığı yok (tip / bayrak / stack dalı). Kararlar helper'larda: `templateHelpers.ts`, `handlebars-be-*.ts`, `handlebars-schema-predicates.ts`. Şablonlar `noEscape: true` ile derlenir.
- Route: `validate` + `TSchema`.
- Schema: `id` filtresi; `IdParamSchema` ObjectId regex'i; enum → `z.enum([...])` (filtrede tek değer ya da dizi); sabit model `default:` → create'te `.default(…)`; `default: null` → `.nullable()`; update şemasında opsiyonel ya da `nullable` tekil alan `.nullable()` (`updateNullClears`), zorunlu alan ve dizi `null` almaz. `*AdminSchema` yalnızca ownership ya da `adminOnly` alan varsa.
- Filters: `id` → `_id`; enum → `$in`; `_id` / `id` adlı alanlar atlanır.
- Liste: `extractListPagination` (yalnızca `filters`'ı okur) + `resolveListSort` (`sortBy: 'id'` → `_id`).
- Cevap: route'lar `AtaResponse` (her `data` `toWire`'dan geçer: `_id` → `id`, populate ve alt dokümanlar dahil; `Decimal128` → string; `Map` → obje). Servisler `SuccessResponse` / `ErrorResponse` / `InternalServerErrorResponse`. Şablona ya da FE'ye `_id` işlemi yazılmaz.
- ObjectId dönüşümü: `Types.ObjectId.createFromHexString(...)`.
- Şablon yoksa hata loglanır, dosya atlanır.
- `Get*Query = Get*Filters` alias'ı geçici; `filters.hbs` ve host'un kendi filtre dosyaları kullanıyor.

## Host çevirileri

CRUD mesajları modül başına değil, host'un locale dosyalarında tek bir `crud` bloğundadır: `listFailed`, `getByIdFailed`, `createFailed`, `updateFailed`, `deleteFailed`, `notFound`, `deleteSuccess` (entity adı geçmez). `BaseCrudService` bunları mesaj verilmeyen her çağrıda, istek dilinde `t('crud.*')` ile çözer. Yeni modül locale'e bir şey eklemez. Bir servis kendi metnini isterse `defaultMessages` ya da metot `errorMessages` ile verir. Varlik360'ta blok `src/locales/en.ts` / `tr.ts`'te; modüllerin eski `<modül>.getAllFailed` … blokları regen sonrası kullanılmaz.

## Core asset'ler

`src/generator-assets/express-mongoose/**` → host `src/core/**`. Handlebars değil, düz dosya.

- **Yalnızca eksikse oluşturulur, asla ezilmez.** Farklı bir host dosyası korunur ve `canonical-deviation-detected` loglanır.
- Yeni asset, host'taki (korunmuş) kardeş dosyanın dışa aktarmadığı bir adı import ediyorsa oluşturulmaz, uyarı loglanır (`utils/coreAssetImports.ts`).
- Bootstrap listesi (`expressCoreAssets.ts` `EXPRESS_CORE_BOOTSTRAP_FILES`; generate'te `BackendGenerator.ensureCoreBootstrapFiles`, yeni host'ta bootstrap çağırır): `errors/error-codes`, `errors/error.helper`, `logging/logger`, `logging/job-log-context`, `logging/pino-stdout-file-tee`, `logging/daily-log-file-path`, `pagination/pagination.helper`, `filters/filter-query.helper`, `response/response.helper`, `response/wire`, `schema/list-pagination.schema`, `types/api-contract`, `services/service-hooks`, `services/base-crud.service`, `services/crud-projection`, `services/crud-scope`, `services/merge-patch`. Yeni asset = listeye ekle, import'larını kapat.
- Asset değişikliği var olan host'a ulaşmaz; regenerate'ten **önce** elle birleştirilir. Host'un kendi eklemeleri korunur.
- Asset'ler mümkün olduğunca saftır (`wire.ts`, `crud-projection.ts`, `crud-scope.ts` mongoose import etmez). Generator'da derlenmez (host alias'ları); test ve host kopyasında `tsc`: [verification.md](../verification.md).
- Şablonların varsaydığı, asset olmayan host modülleri: `@core` (`validate`), `@helpers` (`t`), `@middlewares` (`authMiddleware`, `adminAuthMiddleware`), `@utils/requestContext` (`getRequestContext`, `getCurrentUserId`, `applyRequestIdToResponse`). Yeni host'ta bunları iskelet verir; Varlik360'ta host'un kendileri.

## Keşif

Model keşfi `src/modules/**/*.model.ts` (yalnızca `src/models` değil). Stack önce tespit edilir; Express + Mongoose core'u başka stack'e kopyalanmaz.
