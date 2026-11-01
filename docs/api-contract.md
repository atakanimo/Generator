# API sözleşmesi

Bütün BE stack'leri (bugün Express + Mongoose; ileride .NET, Prisma) **aynı HTTP davranışını** verir. `@atakanimo/ata-admin-base` ve mobil istemci yalnızca bu sözleşmeyi bilir. TS tipleri: `packages/admin-base/src/contract/api.ts`, host tarafı `src/generator-assets/express-mongoose/types/api-contract.ts`.

## 1. Yanıt zarfı

```ts
interface IApiResponse<T> {
  isSuccess: boolean;
  data?: T | null;
  uiMessage: string | null;
  errorData: { header?: string; message: string; code?: number } | null;
  traceId?: string;
}
```

| Durum | HTTP | `isSuccess` | `data` | `uiMessage` | `errorData` |
| --- | --- | --- | --- | --- | --- |
| Başarı | 200 | `true` | sonuç | her zaman dolu (varsayılan `t('common.success')`) | `null` |
| Hata | `errorData.code`, yoksa 500 | `false` | `null` | `null` | dolu |

- `traceId` opsiyoneldir: isteğin kimliği. Gelen `X-Request-Id` (en çok 128 karakter) kullanılır, yoksa üretilir; yanıt başlığında da döner. Express: host'un istek bağlamındaki `requestId` (`@utils/requestContext`); .NET: `TraceIdMiddleware` (`HttpContext.TraceIdentifier` ile aynı). İstek dışında (job) yazılmaz.
- `errorData.header` / `message` yerelleştirilmiş, kullanıcıya gösterilen metindir.
- Hata kodları her stack'te aynı sayılardır. Tek kaynak `core/errors/error-codes.ts`: 400, 401, 403, 404, 408, 409, 422, 429, `PLAN_REQUIRED` 460, `EMAIL_NOT_VERIFIED` 463, 500, `UPSTREAM_ERROR` 502, 503.
- Projeye özel alt kodlar (K9): 461–462, 464–479 (4xx) ve 560–579 (5xx); 460 ve 463 ortak (karar 2026-10-26: `PLAN_REQUIRED` Varlik360 `PREMIUM_REQUIRED` ve StockExchange `PLAN_REQUIRED` ile aynı anlam). Generic asset'te başka projeye özel kod yok.

## 2. Uçlar (resource başına)

`{endpoint}` her model için açıkça yazılır; paket yol türetmez.

| İşlem | Method + yol | Body | `data` |
| --- | --- | --- | --- |
| list | `POST {endpoint}/get-all` | ListBody | `PaginatedList<Row>` |
| getOne | `GET {endpoint}/:id` | — | `Row` |
| create | `POST {endpoint}/create` | CreateBody | oluşan `Row` |
| update | `POST {endpoint}/update/:id` | UpdateBody | güncel `Row` |
| delete | `DELETE {endpoint}/:id` | — | `null` |
| satır aksiyonu | `POST {endpoint}/:id/actions/:actionId` | aksiyon girdisi | serbest |
| toplu aksiyon | `POST {endpoint}/actions/:actionId` | `{ ids?, ...input }` | serbest |
| export (admin, seçilirse) | `POST {endpoint}/export` | ExportBody | — (`text/csv`, zarfsız) |
| autocomplete | hedefin `get-all`'u | `{ filters: { [display]: "…" }, limit: 20 }` | `PaginatedList<Row>` |

### Admin API

- Varsayılan tam CRUD. `api.adminOperations` verilirse yalnız o işlemler açılır; `list` her zaman açık (admin ekranı listedir). Kapalı işlemin ucu yoktur (404 / 405); admin config `operations` (create / update / delete) aynı listeden üretilir. Kural tek yerde: `resolveAdminOperations` (`src/shared/normalizedModel.ts`); üç stack aynı.

### Export (admin, PY12)

- Yalnız `api.adminOperations` `export` içeriyorsa üretilir (varsayılan "hepsi açık" kuralı export'u kapsamaz). Kural: `adminExportEnabled` (`src/shared/normalizedModel.ts`). Admin config `operations` listesine `export` yazılır; admin-base toolbar'da "Dışa aktar" penceresini yalnız o zaman gösterir.
- **ExportBody** (strict, bilinmeyen anahtar 400): `{ filters?, sortBy?, sortOrder?, fields?: string[], headers?: string[] }`. `filters` / `sortBy` / `sortOrder` liste isteğiyle aynı kurallar (§3); sayfalama yok.
- **Kolonlar:** `fields` boş ya da yoksa dışa aktarılabilen bütün kolonlar: `id`, model sırasıyla alanlar, varsa `createdAt`, `updatedAt`. Dışa aktarılabilen = satırda dönebilen her alan (`hidden` hariç); `detailOnly` ve `computed` dahil (seçilirse okunur). Bilinmeyen ya da `hidden` alan 400. `headers` verilirse `fields` ile aynı uzunlukta olmalı (değilse 400) ve başlık satırıdır (FE yerelleştirilmiş kolon adlarını gönderir); yoksa başlık alan adlarıdır.
- **Satırlar:** liste sorgusunun aynısı (filtre, kapsam / ownership, `before_list` hook'u, varsayılan sıra), populate ve `mapRows` dahil. Toplam **50.000**'i aşarsa 400 (mesajda sınır; filtre daraltılır).
- **Hücre:** `null` boş; metin olduğu gibi; sayı noktalı ondalık; boolean `true` / `false`; tarih ve decimal satırdaki (wire) metin; tekil ilişki hedefin `reference.display` alanı (yoksa id); dizi (ilişki dizisi dahil: display değerleri), obje, map, json tek hücrede sıkışık JSON. Formül enjeksiyonu: `=`, `+`, `-`, `@`, sekme ya da CR ile başlayan **metin** hücrenin başına `'` eklenir; sayılar ve sayı gibi görünen metin (`^-?\d+(\.\d+)?$`, ör. decimal `-12.50`) değişmez.
- **Dosya:** RFC 4180 (`,` ayırıcı, `\r\n` satır sonu; `,` / `"` / CR / LF içeren hücre çift tırnakta, `"` → `""`), UTF-8 BOM'lu. Cevap `200 text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="<modül>-<YYYY-MM-DD>.csv"` (UTC tarih; modül = model adının kebab hali, ör. `subscription-plans`). Hata cevapları normal zarf (400 / 401 / 403).

### Normal (mobil) API

- Model başına yalnızca seçilen işlemler açılır (`api.normalOperations`). Tam CRUD varsayılan değildir.
- Yazma işlemleri (`create` / `update` / `delete`) yalnızca ownership'i olan modellerde açılır; kayıtlar auth kullanıcısına göre kapsanır.
- `hidden` alanlar **hiçbir** cevapta (admin dahil) dönmez.

## 3. Liste isteği

```ts
type ListBody = {
  filters?: { id?: string; [field: string]: unknown };
  page?: number;              // 1'den başlar, varsayılan 1
  limit?: number;             // varsayılan 50, en çok 100
  sortBy?: string;            // alan adı; 'id' de geçerli
  sortOrder?: 'asc' | 'desc';
};
type PaginatedList<T> = { items: T[]; total: number; hasMore: boolean; currentPage: number; currentLimit: number };
```

- Filtreler yalnızca `filters` içinden okunur. Kökteki alan filtre değildir.
- Body ve `filters` **strict**: bilinmeyen anahtar → 400.
- Varsayılan sıralama: `createdAt desc, id desc` (BE'de hook ile değiştirilebilir).
- **Null sırası (karar 2026-10-26):** `null` en küçük değer sayılır: `asc`'de başta, `desc`'te sonda. MongoDB, Express ve SQL Server böyle sıralar; .NET PostgreSQL'de sıralamaya önce "null mı" anahtarı eklenir (`QueryableExtensions.ExplicitNullOrder`). Bilinen fark: SQL Server `uniqueidentifier`'ı son 6 bayta göre sıralar, `sortBy: id` orada oluşturma sırası vermez.
- **409 alan adı (karar 2026-10-26):** unique çakışmasında (servis ön kontrolü ya da yarışta veritabanı) mesajdaki alan JSON alan adıdır. İlişkisel .NET'te unique index adı `ux_<tablo>__<jsonAlan>` (`HasDatabaseName`), sınıflandırıcı alanı ondan alır; MongoDB index adı zaten `<jsonAlan>_1`.

| `filterType` | Gönderilen değer | Anlamı |
| --- | --- | --- |
| `reference` | `"<id>"` | eşitlik |
| `regex` | `"abc"` | büyük / küçük harf duyarsız içerir |
| `range` | `{ min?, max? }` ya da sayı | `min ≤ x ≤ max` / eşitlik |
| `date-range` | `{ from?, to? }` ya da tek tarih | UTC: `from` gün başı ≤ x < `to` + 1 gün / o gün |
| `boolean` | `true` / `false` | eşitlik |
| `enum` | `"a"` ya da `["a", "b"]` | eşitlik / içinde |
| diğer | değer | eşitlik |

### Autocomplete

- Ayrı lookup ucu yok. Hedef resource'un `get-all`'u, ilişkinin `display` alanında `regex`, `limit: 20`.
- Generator, `display` alanı hedefte regex filtrelenebilir değilse uyarır.
- `display` obje ise arama yok (ilk 20 kayıt). Hedefin admin ucu yoksa autocomplete kapalı, düz id girişi.

## 4. Satır (Row) şekli

| Alan | JSON |
| --- | --- |
| kimlik | her stack'te `id: string`; JSON'da `_id` yok |
| `createdAt`, `updatedAt`, `date` | ISO-8601 UTC string. `dateFormat: 'date'` ise yalnızca `YYYY-MM-DD` (Mongo'da da bu string olarak saklanır; aralık filtresi string karşılaştırmasıyla `from ≤ x ≤ to`) |
| `number` | number. `numberFormat: 'int'` tam sayı, yoksa ondalık serbest |
| `decimal` | string (`"1234.56"`), giriş ve çıkışta |
| `enum` | string. Sayısal enum'da (`enum.numbers`) number: modeldeki açık değer, sıra numarası değil |
| `string` + `format: 'email'` | string; şema e-posta biçimini doğrular |
| `reference` | populate edilmiş `{ id, ...alanlar }` ya da `"<id>"`; dizilerde `id[]` / obje[] |
| `object` / `object[]` / `map` | düz JSON |

- `reference` populate yalnızca okuma uçlarında: list (`get-all`) ve getOne obje (`{ id, ...populate }`) döner; create / update cevabında ilişki **id** (`"<id>"` / `id[]`) olarak döner. admin-base create / update sonrası satırı kullanmaz, sorguları yeniler (`invalidateQueries`).
- Doldurulmamış opsiyonel alan `null` olarak ya da hiç gelmeyebilir (Express gelmez, .NET `null` yazar); istemci ikisini aynı sayar.
- Stack'e özel alan yok (`__v`, EF navigation döngüleri).
- Kod ve DB isimleri doğal kalır (Mongoose `_id`); `id` yalnızca JSON adıdır. Eşleme tek yerde yapılır (Express: `toWire`).
- Girişte: filtre `id` ve `sortBy: 'id'` stack'in kimlik alanına çevrilir; create / update body'sinde `id` / `_id` reddedilir.
- `id` ve `_id` **ayrılmış alan adlarıdır**; Generator UI ve main reddeder.

## 5. Yazma

- create: `readonly` ve `hiddenFromCreate` dışındaki model alanları, strict. update: kısmi, strict; `readonly` / `hiddenFromUpdate` alanlar kabul edilmez. Her stack'te aynı (2026-10-21).
- `reference` alanlar yalnızca id alır, populate edilmiş obje almaz.
- Ownership alanı (`userId` benzeri): normal API auth'tan alır, body ve filtreden atar; admin API body ve filtrede kabul eder.
- `adminOnly` alanlar normal create / update şemasında yoktur; admin şemasında vardır.
- `detailOnly` alanlar (ör. rapor analizi) liste sayfasında okunmaz: liste satırında `null`, getOne'da değer. Admin config: tabloda kolon yok (detay gösterir).
- `computed` alanlar (ör. canlı fiyat, başka koleksiyondan gelen sektör) saklanmaz: hiçbir stack'in saklama katmanında yok, hiçbir gövdede yok, filtre ve `sortBy` reddeder (400; Express'te `sortBy` allow-list'i henüz yok), satırda opsiyonel ve hook doldurur (`map_rows` / `mapRows` / `MapRows`; list, getOne, export). Admin config: `readonly`, `sortable: false`, filtre yok.
  - Ayrım: dokümanda tutulmayıp sadece satırda dönen alan `computed`'dir. `readonly` (+ `hiddenFrom*`) saklanan ama API'den yazılamayan alandır; generator onu modele, filtreye ve sıralamaya koyar.
- **Update'te `null` kuralı (JSON Merge Patch, RFC 7386; karar 2026-10-23, üç stack + admin-base 0.1.8):**
  - Gövdede olmayan alan değişmez.
  - Opsiyonel (`required` değil) ya da `nullable` tekil alana `null` alanı temizler: Mongo'da `$unset` (satırda alan yok, istemci `null` okur), SQL'de `NULL`. Tekil `reference` ve tekil obje de bu kurala uyar (obje bütün olarak yazılır, alt alanlar birleştirilmez).
  - Zorunlu alana (`required && !nullable`) `null` → 400.
  - Dizi (`reference[]`, obje dizisi dahil) `null` almaz (400); `[]` ile boşalır.
  - Kural tek yerde: `updateNullClears` (`src/shared/normalizedModel.ts`). Express: update zod şemasında `.nullable()` + `toMergePatch` (`$set` / `$unset`). Python: `NotNull[T]` (zorunlu / dizi) + `exclude_unset` + repository `$unset`. .NET: update gövdesi `PatchBody` (gönderilen özellik `Has(nameof(X))`), `MapUpdate` gönderilen opsiyonel alanı `null` dahil yazar, zorunlu / dizi için `NotNull` kuralı.

## 6. Aksiyonlar

- Satır: `POST {endpoint}/:id/actions/:actionId`. Toplu: `POST {endpoint}/actions/:actionId`, body `{ ids?, ...input }`.
- Normal zarf döner; başarı metni `uiMessage`'dan gelir.
- Bugün elle yazılır (Express: `custom-routes` + `custom-methods` blokları).

## 7. FE HTTP katmanı: host interceptor görevleri

Axios interceptor **host** projededir, pakette değil. Paketin beklediği:

1. Başarı → `LocalResponse` ile resolve (`data` = zarfın `data`'sı).
2. Hata → `LocalResponse` ile reject (`errorData` dolu).
3. `config.skipLoading === true` → global loading açılmaz.
4. `config.skipSuccessToast === true` → başarı toast'u yok.
5. `axios.isCancel(error)` → toast yok (loading sayacı yine azalır).
6. Token ve 401 yönetimi host'un işidir.
7. Bayraklar **header değil, axios config alanıdır**; sunucuya gitmez.
8. `responseType: 'blob'` (export): başarıda axios yanıtını döner (zarf yok; `data` Blob, `headers['content-disposition']` dosya adı); hata gövdesi Blob'daki JSON zarftan `LocalResponse`'a çevrilip reject edilir. Paket her iki biçimi (yanıt nesnesi ya da çıplak Blob) kabul eder.

```ts
declare module 'axios' {
  interface AxiosRequestConfig { skipLoading?: boolean; skipSuccessToast?: boolean }
}
```

| Paket isteği | Bayraklar |
| --- | --- |
| list, getOne | `skipSuccessToast` |
| autocomplete | `skipSuccessToast`, `skipLoading` |
| create, update, delete, aksiyon | yok (global loading + BE `uiMessage` toast'u) |
| export | `skipSuccessToast`, `responseType: 'blob'` (global loading açık) |

Paket kendi hata ya da toast'unu göstermez.

## Kararlar

| # | Konu | Karar |
| --- | --- | --- |
| K1 | JSON kimlik alanı | Yalnızca `id`; geçiş dönemi yok |
| K2 | Liste body'si | Filtreler iç içe `filters` |
| K3 | Autocomplete | Hedefin `get-all`'u + `regex`, `limit: 20` |
| K4 | Postgres id | uuid v7 |
| K5 | `decimal` | JSON'da string |
