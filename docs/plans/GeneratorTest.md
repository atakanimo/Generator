# Generator: üretilebilen her durum için test planı

Amaç: Generator'ın üretebildiği her alan türü, değiştirici, erişim bayrağı, ilişki ve API seçeneği için üç backend stack'inde (Express + Mongoose, .NET + EF Core, Python + FastAPI) ve FE çıktılarında (admin config, istemci veri katmanı) sorun olup olmadığını görmek. Her senaryo üretilen host'a gerçek HTTP isteğiyle denenir; beklenen davranış [api-contract.md](../api-contract.md) ve [normalized-model.md](../normalized-model.md)'dir. Biçim [DbTests.md](DbTests.md) ile aynı: aşamalar, işaret kutuları, "Sonuç" satırı, bulgular tablosu.

Durum (2026-10-24): **Başlanmadı.** Her aşamanın sonucu "Sonuç" satırına, her sorun "Bulgular"a (`G1`, `G2`, …) yazılır.

## Kurallar

- Generator ya da gerçek projeler (Varlik360, SharedFrame, StockExchange) test klasörü olarak kullanılmaz. Host'lar `/tmp/gentests/<stack>` altında; bitince silinir.
- Electron UI yalnız Aşama 7'de (editör) kullanılır; diğer aşamalar headless: `scripts/python-host.mjs`, `scripts/verify/*.mjs` harness'ları ve `_…-entry.ts` girişleri ([verification.md](../verification.md)).
- Bir senaryo bir stack'te beklenenden farklıysa önce sözleşmeye bakılır: sözleşme açıksa stack düzeltilir; sözleşme sessizse karar yazılır (bulgu + karar). "Bilinen fark" (ör. K15c) bulgu olarak yine yazılır, durumu "bilinen".
- Her düzeltmeden sonra ilgili kapılar koşar (tsc tabanı 3, `test-core-assets`, `regen-dotnet`, `dotnet-e2e`, `python-e2e`, `express-bootstrap`, `admin-config-check`, `regen-client`).

## Stack sütunları

Tablolarda her senaryo için bu sütunlar işaretlenir: ✅ geçti, ❌ bulgu (numarasıyla), ➖ bu stack'te uygulanmaz.

| Kısa ad | Stack | Veritabanı / id |
| --- | --- | --- |
| EX | Express + Mongoose | MongoDB, ObjectId |
| PG | .NET + EF Core | PostgreSQL, uuid v7 |
| MS | .NET + EF Core | SQL Server, uuid v7 |
| MG | .NET + EF Core | MongoDB, uuid v7 |
| MO | .NET + EF Core | MongoDB, ObjectId |
| PY | Python + FastAPI | MongoDB, ObjectId |

## Test model seti

Dosya: `scripts/verify/fixtures/generator-test/models.json` (Aşama 0'da yazılır; NormalizedModel v2, `python-host.mjs model` ve .NET / Express harness'larının okuduğu biçim). Dört model:

### `GtCategories` (tekil reference hedefi)

| Alan | Tür | Ayar |
| --- | --- | --- |
| `name` | string | zorunlu, unique, trim, filtre regex (autocomplete `display`) |
| `code` | string | zorunlu, unique, `pattern: ^[A-Z0-9_]+$` |
| `isActive` | boolean | varsayılan `true`, filtre boolean |

### `GtTags` (reference dizisi hedefi)

| Alan | Tür | Ayar |
| --- | --- | --- |
| `label` | string | zorunlu, unique, filtre regex |
| `color` | enum | `red`, `green`, `dark-blue` (tire içeren değer) |

### `GtItems` (bütün türler)

| # | Alan | Tür | Ayar | Neyi dener |
| --- | --- | --- | --- | --- |
| F1 | `title` | string | zorunlu, trim, `minLength 3`, `maxLength 40`, filtre regex | zorunlu metin, kısıtlar, trim |
| F2 | `subtitle` | string | opsiyonel, `nullable` | opsiyonel / null temizleme |
| F3 | `slug` | string | unique, `pattern ^[a-z0-9-]+$` | unique 409, desen |
| F4 | `email` | string | `format: email` | e-posta doğrulaması |
| F5 | `body` | string | `ui.component: TextArea`, `access.detailOnly` | çok satır, listede `null` |
| F6 | `imageUrl` | string | `ui.component: ImageField` | resim URL'i |
| F7 | `keywords` | string[] | filtre regex | metin dizisi |
| F8 | `price` | number | `min 0`, `max 1000000`, filtre range | ondalık sayı, aralık |
| F9 | `quantity` | number | `numberFormat: int`, zorunlu, varsayılan `0` | tam sayı, 1.5 → 400 |
| F10 | `scores` | number[] | — | sayı dizisi |
| F11 | `amount` | decimal | filtre eq | JSON'da string, hassasiyet (`"1234.5600"`) |
| F12 | `isPublished` | boolean | zorunlu, varsayılan `false`, filtre boolean | boolean |
| F13 | `publishedAt` | date | `datetime`, filtre date-range | ISO UTC, saat dilimi |
| F14 | `releaseDate` | date | `dateFormat: date`, filtre date-range | `YYYY-MM-DD` |
| F15 | `reminders` | date[] | — | tarih dizisi (K15c) |
| F16 | `status` | enum | `draft`, `active`, `archived`; varsayılan `draft`; filtre enum | string enum |
| F17 | `priority` | enum | sayısal: `low=1`, `mid=5`, `high=10`; filtre enum | açık sayı değeri |
| F18 | `channels` | enum[] | `web`, `mobile`, `dark-blue` | string enum dizisi |
| F19 | `levels` | enum[] | sayısal `a=2`, `b=4` | sayısal enum dizisi |
| F20 | `categoryId` | reference → `GtCategories` | zorunlu, populate `name`, `code`; filtre reference | tekil ilişki, populate |
| F21 | `altCategoryId` | reference → `GtCategories` | opsiyonel, populate `name` | null olabilen ilişki |
| F22 | `tagIds` | reference[] → `GtTags` | populate `label` | ilişki dizisi, detach |
| F23 | `dimensions` | object | alt alanlar `width` number, `height` number, `unit` enum (`cm`, `in`), `measuredAt` date | iç içe obje |
| F24 | `variants` | object[] | alt alanlar `sku` string zorunlu, `stock` number int, `tagId` reference → `GtTags` | obje dizisi, alt alanda reference |
| F25 | `meta` | object | alt alanı yok (opak) | opak obje |
| F26 | `counters` | map | değer number | map |
| F27 | `payload` | json | — | serbest JSON |
| F28 | `internalNote` | string | `access.adminOnly` | normal API'de yok |
| F29 | `secret` | string | `access.hidden`, yazılabilir | hiçbir yanıtta yok, admin formda `writeOnly` |
| F30 | `viewCount` | number | `access.readonly` (hook yazar) | gövdede 400 |
| F31 | `createdByName` | string | `access.hiddenFromUpdate` | create'te var, update'te 400 |
| F32 | `approvedNote` | string | `access.hiddenFromCreate` | create'te 400, update'te var |
| F33 | `liveScore` | number | `access.computed` (hook `map_rows` / `mapRows` doldurur) | saklanmaz, filtre / sıralama 400 |
| F34 | `userId` | reference → kullanıcı | ownership alanı | normal API kapsamı |

`timestamps: { createdAt, updatedAt }`; `api.admin: true` (tam CRUD); `api.normalOperations: [list, getOne, create, update, delete]`; `api.requiresAuth: true`; `ui.label: "Test öğeleri"`.

### `GtLimited` (işlem seçimi)

`name` string zorunlu. Üç kopya: `GtListOnly` (`adminOperations: [list]`), `GtReadDelete` (`[list, getOne, delete]`), `GtListUpdate` (`[list, update]`). Normal API yok.

## Aşama 0: Hazırlık

- [ ] `models.json` yazıldı; `python-host.mjs preview --json` ve .NET parser gidiş-dönüşü aynı modeli veriyor (canonical anahtar sırası).
- [ ] Docker: SQL Server (`gen-gentest-mssql` :14331), MongoDB (`gen-gentest-mongo` :27033). Postgres yerel.
- [ ] Host'lar: EX (`express-bootstrap` girişiyle), PG / MS / MG / MO (`regen-dotnet` girişiyle, `--db` / `--id`), PY (`python-host.mjs bootstrap` + `model` + `generate`) → `/tmp/gentests/<kısa ad>`.
- [ ] Test istemcisi: `scripts/verify/out/gentests/run.mjs` (her senaryo bir fonksiyon; `API_BASE`, `JWT_SECRET`, `ID_TYPE` ortamdan; çıktı senaryo numarası + PASS / FAIL + gelen / beklenen). Aynı betik altı host'a karşı koşar.
- [ ] Seed: 2 `GtCategories`, 3 `GtTags`, admin ve normal kullanıcı token'ları.
- Sonuç:

## Aşama 1: Üretim ve derleme

| # | Senaryo | Beklenen | EX | PG | MS | MG | MO | PY |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B1 | İlk generate | Hata / uyarı yok; uyarı varsa listelenir (ör. `display` regex filtrelenebilir değil) | | | | | | |
| B2 | Derleme / lint | EX `tsc` 0; .NET `dotnet build` 0 uyarı 0 hata; PY `ruff check` + `ruff format --check` temiz, `lint-imports` KEPT | | | | | | |
| B3 | İkinci generate | Hiçbir dosya yazılmaz (idempotent) | | | | | | |
| B4 | K dosyası korunur | `hooks` / `service` / `repository` / `<m>.generated.ts` elle değiştirilip yeniden generate: değişiklik kalır, G dosyaları yenilenir | | | | | | |
| B5 | Kaynak hash'i | Model dosyası generate öncesi değişirse hiçbir şey yazılmaz, "modeli yeniden açın" | | | | | | |
| B6 | Migration / index | PG / MS `dotnet ef migrations add` temiz; Mongo host'larında açılışta unique + `createdAt` index'leri | ➖ | | | | | |
| B7 | Üretilen birim / modül testleri | PY `test_admin_crud.py`, .NET `dotnet test` yeşil | ➖ | | | | | |
| B8 | Açılış | Host ayağa kalkar, `GET /health` (varsa) 200 | | | | | | |

- Sonuç:

## Aşama 2: Alan türleri (admin API, `GtItems`)

Her satır: create → getOne → list'te satır → update → getOne. "Saklama" sütunu veritabanında ham değere bakılarak doldurulur (Mongo `find`, SQL `SELECT`).

| # | Alan | Gönderilen | Beklenen JSON | Saklama | EX | PG | MS | MG | MO | PY |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | F1 `title` | `"  Merhaba  "` | `"Merhaba"` (trim) | metin | | | | | | |
| T2 | F2 `subtitle` | gönderilmez | alan yok ya da `null` (ikisi eşdeğer) | yok / NULL | | | | | | |
| T3 | F4 `email` | `"a@b.co"` | aynı | metin | | | | | | |
| T4 | F7 `keywords` | `["x","y"]` | aynı sıra | dizi / JSON | | | | | | |
| T5 | F8 `price` | `12.5` | `12.5` (number) | double | | | | | | |
| T6 | F9 `quantity` | `3` | `3` | int | | | | | | |
| T7 | F10 `scores` | `[1, 2.5]` | aynı | dizi | | | | | | |
| T8 | F11 `amount` | `"1234.5600"` | string; ölçek kuralı yazılır (`"1234.56"` mı `"1234.5600"` mı), stack'ler aynı | Decimal128 / numeric | | | | | | |
| T9 | F12 `isPublished` | `true` | `true` | bool | | | | | | |
| T10 | F13 `publishedAt` | `"2026-10-24T10:15:30+03:00"` | `"2026-10-24T07:15:30.000Z"` (UTC, ms) | date / timestamptz | | | | | | |
| T11 | F14 `releaseDate` | `"2026-10-24"` | `"2026-10-24"` | string / date | | | | | | |
| T12 | F15 `reminders` | iki ISO tarih | ISO UTC dizisi | BSON date dizisi (.NET Mongo: K15c bilinen fark) | | | | | | |
| T13 | F16 `status` | `"active"` | `"active"` | string | | | | | | |
| T14 | F17 `priority` | `5` | `5` (sıra numarası değil) | sayı 5 | | | | | | |
| T15 | F18 `channels` | `["dark-blue","web"]` | aynı | değerleriyle (R2 / R3) | | | | | | |
| T16 | F19 `levels` | `[4,2]` | aynı | sayı dizisi | | | | | | |
| T17 | F20 `categoryId` | `"<id>"` | create / update yanıtında `"<id>"`; list / getOne'da `{ id, name, code }` | ObjectId / FK | | | | | | |
| T18 | F21 `altCategoryId` | `null` / id | `null` ya da populate obje | | | | | | | |
| T19 | F22 `tagIds` | iki id | create'te `id[]`; okumada `[{ id, label }]` aynı sırada | dizi / join tablosu | | | | | | |
| T20 | F23 `dimensions` | tam obje | aynı; `measuredAt` ISO UTC | alt doküman / owned JSON | | | | | | |
| T21 | F24 `variants` | 2 eleman (biri `tagId`'li) | aynı; alt alan reference id metni | | | | | | | |
| T22 | F25 `meta` | `{ "a": { "b": [1] } }` | aynı | | | | | | | |
| T23 | F26 `counters` | `{ "x": 1, "y": 2 }` | aynı | | | | | | | |
| T24 | F27 `payload` | `[1, "a", null, { "k": true }]` | aynı | | | | | | | |
| T25 | Varsayılanlar | yalnız zorunlular | `quantity 0`, `isPublished false`, `status "draft"`, diziler `[]` | | | | | | | |
| T26 | Satır şekli | herhangi satır | `id` string, `_id` / `__v` / navigation yok, `createdAt` / `updatedAt` ISO | | | | | | | |
| T27 | Boş liste | yeni host | `{ items: [], total: 0, hasMore: false, currentPage: 1, currentLimit: 50 }` | | | | | | | |

- Sonuç:

## Aşama 3: Doğrulama (400 / 409 / 422)

| # | Senaryo | Beklenen | EX | PG | MS | MG | MO | PY |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| V1 | Zorunlu alan eksik (`title`, `quantity`, `categoryId` tek tek) | 400, `errorData.message` alanı adlandırır | | | | | | |
| V2 | `title` `"ab"` / 41 karakter | 400 | | | | | | |
| V3 | `title` `"   "` (trim sonrası boş) | 400 | | | | | | |
| V4 | `slug` desen dışı `"A B"` | 400 | | | | | | |
| V5 | `email` `"x@"` | 400 | | | | | | |
| V6 | `price` `-1` / `1000001` | 400 | | | | | | |
| V7 | `quantity` `1.5` / `"3"` | 400 | | | | | | |
| V8 | `amount` `12.3` (number) / `"abc"` | 400 (decimal yalnız string) | | | | | | |
| V9 | `isPublished` `"maybe"` | 400 | | | | | | |
| V10 | `publishedAt` `"dün"` / `releaseDate` `"2026-13-01"` | 400 | | | | | | |
| V11 | `status` `"other"` / `priority` `3` (tanımsız sayı) / `priority` `"mid"` | 400 | | | | | | |
| V12 | `categoryId` `"not-an-id"` | 400 | | | | | | |
| V13 | `categoryId` geçerli biçimde ama olmayan id | 400 | | | | | | |
| V14 | `categoryId` populate obje `{ id, name }` | 400 (ilişki yalnız id) | | | | | | |
| V15 | `variants[0].sku` eksik / `variants[0].stock` `1.5` | 400 | | | | | | |
| V16 | Bilinmeyen anahtar (`foo`) | 400 (strict) | | | | | | |
| V17 | Gövdede `id` / `_id` | 400 | | | | | | |
| V18 | `viewCount` (readonly) create / update | 400 | | | | | | |
| V19 | `approvedNote` create'te / `createdByName` update'te | 400 | | | | | | |
| V20 | `liveScore` (computed) gövdede | 400 | | | | | | |
| V21 | `slug` tekrar | 409, `errorData.code 409` | | | | | | |
| V22 | `GtCategories.name` büyük / küçük harf farkı (`"A"` / `"a"`) | Davranış yazılır; stack'ler aynı olmalı (SQL Server collation `CS`) | | | | | | |
| V23 | Yarış: aynı `slug` iki paralel istek | biri 200, biri 409 (unique index; 500 değil) | | | | | | |
| V24 | Hata zarfı | `isSuccess false`, `data null`, `uiMessage null`, `errorData { header, message, code }`, `traceId` | | | | | | |
| V25 | Dil | `Accept-Language: en` / `tr` → `errorData` metni o dilde | | | | | | |

- Sonuç:

## Aşama 4: Update ve `null` kuralı (JSON Merge Patch)

| # | Senaryo | Beklenen | EX | PG | MS | MG | MO | PY |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| U1 | Kısmi update (`{ title }`) | Diğer alanlar değişmez | | | | | | |
| U2 | Opsiyonel tekil alana `null` (`subtitle`, `price`, `publishedAt`, `releaseDate`, `status` opsiyonelse, `amount`) | Alan temizlenir: Mongo'da `$unset`, SQL'de NULL; okumada yok / `null` | | | | | | |
| U3 | Opsiyonel tekil reference `altCategoryId: null` | Temizlenir | | | | | | |
| U4 | Tekil obje `dimensions: null` / yeni obje | Temizlenir / bütün olarak yazılır (alt alanlar birleştirilmez) | | | | | | |
| U5 | Zorunlu alana `null` (`title`, `categoryId`, `quantity`) | 400 | | | | | | |
| U6 | Diziye `null` (`keywords`, `tagIds`, `variants`) | 400; `[]` ile boşalır | | | | | | |
| U7 | `updatedAt` | Her update'te artar; `createdAt` değişmez | | | | | | |
| U8 | Update yanıtında ilişki | `categoryId` id metni; sonra getOne populate obje | | | | | | |
| U9 | Olmayan id / bozuk id | 404 / 404 | | | | | | |
| U10 | Boş gövde `{}` | 200, değişiklik yok (`updatedAt` kuralı yazılır) | | | | | | |

- Sonuç:

## Aşama 5: Liste: filtre, sıralama, sayfalama

Seed: 12 `GtItems` (filtrelerin ayırt edebileceği değerlerle).

| # | Senaryo | Beklenen | EX | PG | MS | MG | MO | PY |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| L1 | Sayfalama `page 2, limit 5` | 5 satır, `hasMore true`, `currentPage 2`, `currentLimit 5`, `total 12` | | | | | | |
| L2 | `limit 101` / `page 0` | 400 ya da sınırlanır (sözleşme: en çok 100), stack'ler aynı | | | | | | |
| L3 | Varsayılan sıra | `createdAt desc, id desc`; eşit `createdAt`'te `id` ile kararlı | | | | | | |
| L4 | `sortBy` her skaler alan, `asc` / `desc` | Doğru sıra; `null` değerlerin yeri stack'ler arasında aynı (yazılır) | | | | | | |
| L5 | `sortBy` dizi / obje / map / json / computed / bilinmeyen alan | 400 | | | | | | |
| L6 | `sortBy: "id"` | id sırası | | | | | | |
| L7 | regex `title: "mer"` | büyük / küçük harf duyarsız içerir; Türkçe `İ / i` davranışı yazılır | | | | | | |
| L8 | regex özel karakter `"a.b"` / `"("` | Kaçışlanır, 500 yok | | | | | | |
| L9 | range `price: { min: 10, max: 100 }` / tek sayı | aralık / eşitlik | | | | | | |
| L10 | date-range `publishedAt: { from, to }` | UTC: `from` gün başı ≤ x < `to` + 1 gün | | | | | | |
| L11 | date-range `releaseDate` (date) | string karşılaştırma `from ≤ x ≤ to` | | | | | | |
| L12 | boolean `isPublished: false` | eşitlik | | | | | | |
| L13 | enum `status: "active"` / `["draft","active"]` | eşitlik / içinde | | | | | | |
| L14 | sayısal enum `priority: 5` / `[1, 10]` | aynı | | | | | | |
| L15 | reference `categoryId: "<id>"` | eşitlik | | | | | | |
| L16 | reference dizisi filtresi `tagIds: "<id>"` | bu etiketi içeren satırlar | | | | | | |
| L17 | `filters.id` | tek satır | | | | | | |
| L18 | Filtre `body` (detailOnly) / `liveScore` (computed) / `secret` (hidden) | 400 | | | | | | |
| L19 | Kökte filtre (`{ title: "x" }`, `filters` dışında) | 400 (strict) | | | | | | |
| L20 | Birden çok filtre | VE ile birleşir | | | | | | |
| L21 | Liste satırında `body` | `null`; getOne'da dolu | | | | | | |
| L22 | Liste satırında `liveScore` | hook'un yazdığı değer, getOne'da da | | | | | | |
| L23 | Autocomplete (hedefin `get-all`'u `{ filters: { name: "x" }, limit: 20 }`) | `GtCategories` eşleşenler | | | | | | |

- Sonuç:

## Aşama 6: İlişkiler ve silme

| # | Senaryo | Beklenen | EX | PG | MS | MG | MO | PY |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R1 | Kullanılan `GtCategories` kaydını sil (tekil reference) | 409 | | | | | | |
| R2 | `tagIds`'de kullanılan `GtTags` kaydını sil | 200; id dizilerden çıkar (R4 kararı) | | | | | | |
| R3 | `variants[].tagId`'de kullanılan etiketi sil | Davranış yazılır (alt alan reference silme denetimi); stack'ler aynı | | | | | | |
| R4 | Populate hedefi silinmiş (doğrudan DB'den) satır | 500 yok; populate `null` ya da yalnız id, stack'ler aynı | | | | | | |
| R5 | `GtItems` sil | 200, `data null`; tekrar getOne 404 | | | | | | |
| R6 | Silme sonrası liste `total` | bir azalır | | | | | | |
| R7 | İki seviye populate (`variants[].tagId` → `label`) | Desteklenmiyor: id metni (bilinen sınır) | | | | | | |

- Sonuç:

## Aşama 7: Erişim, auth, normal API, işlem seçimi

| # | Senaryo | Beklenen | EX | PG | MS | MG | MO | PY |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | Token yok / bozuk / süresi dolmuş | 401 | | | | | | |
| A2 | Normal kullanıcı admin ucunda | 403 | | | | | | |
| A3 | `secret` (hidden) | create'te kabul, hiçbir yanıtta (admin dahil) yok, DB'de var | | | | | | |
| A4 | `internalNote` (adminOnly) | admin'de var; normal create / update gövdesinde 400, normal yanıtta yok | | | | | | |
| A5 | Normal API ownership | Kullanıcı yalnız kendi kayıtlarını listeler / görür; başkasının id'si 404 | | | | | | |
| A6 | Normal create'te `userId` gövdede | Yok sayılır ya da 400 (yazılır); kayıt token kullanıcısına ait | | | | | | |
| A7 | Normal filtrede `userId` | 400 / yok sayılır | | | | | | |
| A8 | Admin API'de `userId` | gövdede ve filtrede kabul | | | | | | |
| A9 | `GtListOnly`: getOne / create / update / delete | 404 ya da 405 (yazılır), list 200 | | | | | | |
| A10 | `GtReadDelete`: create / update | 404 / 405; getOne, delete 200 | | | | | | |
| A11 | `GtListUpdate`: getOne / create / delete | 404 / 405; update 200 | | | | | | |
| A12 | `normalOperations` dışı normal uç | ucu yok | | | | | | |
| A13 | `requiresAuth: false` model (ek kopya) | token'sız 200 | | | | | | |
| A14 | `traceId` | `X-Request-Id: t-1` → yanıtta ve başlıkta `t-1`; yoksa üretilir; 129 karakter → üretilir | | | | | | |
| A15 | Hook'ta istek sahibi | `current_actor()` / `ICurrentUser` / request context ile `createdByName` yazan hook çalışır | | | | | | |

- Sonuç:

## Aşama 8: Stack'ler arası eşlik

- [ ] Aşama 2–7'nin istekleri `contract-parity.mjs`'e yeni bir suite olarak (`generator-test`) eklenir: aynı istekler EX, PG, MG, MO, PY'ye gider, yanıtlar (id ve zaman alanları normalize edilerek) karşılaştırılır.
- [ ] Farklar tablosu: senaryo, stack, gelen, beklenen, karar (düzelt / bilinen fark).
- Sonuç:

## Aşama 9: İçe aktarma (parser) gidiş-dönüşü

| # | Senaryo | Beklenen | Mongoose | C# | Python |
| --- | --- | --- | --- | --- | --- |
| I1 | Üretilen model dosyası parse → NormalizedModel | `models.json` ile aynı (canonical) | | | |
| I2 | Elle yazılmış eşdeğer model (fixture) | Aynı model; tanınmayan tip `unknown` + `native.type` korunur | | | |
| I3 | Rapor (`preview --report`) | Desteklenmeyen şeyler uyarı olarak listelenir, sessiz kayıp yok | | | |
| I4 | Import → generate → ikinci import | Değişiklik yok | | | |

- Sonuç:

## Aşama 10: FE çıktıları

### Admin config (`AdminConfigGenerator`)

| # | Senaryo | Beklenen | Sonuç |
| --- | --- | --- | --- |
| C1 | `GtItems` → `gt-items.generated.config.ts` | Her F alanı doğru `kind` (`date` → `datetime`, `reference` → `relation`, map `valueKind`), `options`, `numbers`, `constraints`, `format`, `numberFormat`, `dateFormat`, `filter` yalnız searchable alanlarda | |
| C2 | Erişim | `readonly`, `hideOnCreate`, `hideOnUpdate`; `secret` → `writeOnly: true`; `body` tabloda yok; `liveScore` `readonly`, `sortable: false`, filtre yok | |
| C3 | `operations` | `GtListOnly` / `GtReadDelete` / `GtListUpdate` doğru; tam CRUD'da yazılmaz | |
| C4 | `endpoint` | BE app dosyasından okunur (`findAdminMountPath`); bulunamazsa uyarı | |
| C5 | `<m>.generated.ts` | İlk generate'te oluşur, sonra değişmez | |
| C6 | `resources.generated.ts` | Bütün modüller, klasör sırasıyla | |
| C7 | `tsc` | admin-base tiplerine karşı 0 hata (`admin-config-check` gibi) | |
| C8 | Playground | `packages/admin-base` playground'unda `GtItems` config'i sahte BE ile: liste, filtre, form, detay; her alan türünün hücresi ve form girişi | |

### İstemci veri katmanı (`client-redux`)

| # | Senaryo | Beklenen | Sonuç |
| --- | --- | --- | --- |
| D1 | `redux-rn` ve `redux-web` preset'leriyle `GtItems` | `services/`, `store/thunks/`, `store/slices/` G + K dosyaları; `common.generated.ts` | |
| D2 | Tipler | `I<E>`: `id: string`, tarih `string`, decimal `string`, `secret` yok, `internalNote` yok (normal), populate edilen ilişki `{ id; name; code }`, opsiyonel `?` ve `| null` | |
| D3 | Input tipleri | create / update input'ta ilişki yalnız id, readonly / computed yok | |
| D4 | Yalnız `normalOperations` | Kapalı işlemin servis fonksiyonu / thunk'ı yok (`GtLimited` için G dosyası boş) | |
| D5 | Slice | `append` ile liste ekleme, `merge<E>Saved` populate'i korur, delete id'yi `action.meta.arg`'dan alır | |
| D6 | `tsc` | Varlik360 mobile ve SharedFrame web kopyalarında taban değişmez (`regen-client`) | |

- Sonuç:

## Aşama 11: Model editörü (Electron, elle)

DbTests Aşama 1'deki CDP yöntemiyle.

| # | Senaryo | Beklenen | Sonuç |
| --- | --- | --- | --- |
| E1 | `GtItems`'ın her alanı editörden kurulabiliyor | 34 alan; kurulamayanlar bulgu (ör. computed / detailOnly / sayısal enum / obje alt alanı reference) | |
| E2 | Tür değişince eski bayraklar temizlenir | String → Number'da `trim` kalmaz (O1) | |
| E3 | `numberFormat` yalnız .NET / Python'da görünür | Express'te yok | |
| E4 | Ayrılmış ad `id` / `_id` | Reddedilir | |
| E5 | Kaydet → manifest → yeniden aç | Kayıpsız | |
| E6 | İşlem kutuları (`adminOperations`) | Seçim manifest'e ve üretime yansır | |

- Sonuç:

## Bulgular

| # | Aşama / senaryo | Stack | Bulgu | Karar / düzeltme | Durum |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

## Temizlik

- [ ] Docker konteynerleri (`gen-gentest-mssql`, `gen-gentest-mongo`) silindi; `/tmp/gentests` ve Postgres test veritabanları silindi.
- [ ] Düzeltmelerden sonra bütün kapılar: tsc taban 3, `test-core-assets`, `regen-dotnet`, `dotnet-e2e`, `python-e2e`, `express-bootstrap`, `admin-config-check`, `regen-client`.
