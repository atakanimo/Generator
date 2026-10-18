# API sözleşmesi

Bütün BE stack'leri (bugün Express + Mongoose; ileride .NET, Prisma) **aynı HTTP davranışını** verir. `@atakanimo/ata-admin-base` ve mobil istemci yalnızca bu sözleşmeyi bilir. TS tipleri: `packages/admin-base/src/contract/api.ts`, host tarafı `src/generator-assets/core/types/api-contract.ts`.

## 1. Yanıt zarfı

```ts
interface IApiResponse<T> {
  isSuccess: boolean;
  data?: T | null;
  uiMessage: string | null;
  errorData: { header?: string; message: string; code?: number } | null;
}
```

| Durum | HTTP | `isSuccess` | `data` | `uiMessage` | `errorData` |
| --- | --- | --- | --- | --- | --- |
| Başarı | 200 | `true` | sonuç | her zaman dolu (varsayılan `t('common.success')`) | `null` |
| Hata | `errorData.code`, yoksa 500 | `false` | `null` | `null` | dolu |

- `errorData.header` / `message` yerelleştirilmiş, kullanıcıya gösterilen metindir.
- Hata kodları her stack'te aynı sayılardır. Tek kaynak `core/errors/error-codes.ts`: 400, 401, 403, 404, 408, 409, 422, 429, `EMAIL_NOT_VERIFIED` 463, 500, 503.
- Generic asset'te projeye özel kod yok (ör. Varlik360'ın `PREMIUM_REQUIRED: 460` host'ta kalır).

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
| autocomplete | hedefin `get-all`'u | `{ filters: { [display]: "…" }, limit: 20 }` | `PaginatedList<Row>` |

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
| `createdAt`, `updatedAt`, `date` | ISO-8601 UTC string |
| `decimal` | string (`"1234.56"`), giriş ve çıkışta |
| `enum` | string |
| `reference` | populate edilmiş `{ id, ...alanlar }` ya da `"<id>"`; dizilerde `id[]` / obje[] |
| `object` / `object[]` / `map` | düz JSON |

- Stack'e özel alan yok (`__v`, EF navigation döngüleri).
- Kod ve DB isimleri doğal kalır (Mongoose `_id`); `id` yalnızca JSON adıdır. Eşleme tek yerde yapılır (Express: `toWire`).
- Girişte: filtre `id` ve `sortBy: 'id'` stack'in kimlik alanına çevrilir; create / update body'sinde `id` / `_id` reddedilir.
- `id` ve `_id` **ayrılmış alan adlarıdır**; Generator UI ve main reddeder.

## 5. Yazma

- create: `hiddenFromCreate` dışındaki model alanları, strict. update: kısmi, strict; `readonly` / `hiddenFromUpdate` alanlar kabul edilmez.
- `reference` alanlar yalnızca id alır, populate edilmiş obje almaz.
- Ownership alanı (`userId` benzeri): normal API auth'tan alır, body ve filtreden atar; admin API body ve filtrede kabul eder.
- `adminOnly` alanlar normal create / update şemasında yoktur; admin şemasında vardır.

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

Paket kendi hata ya da toast'unu göstermez.

## Kararlar

| # | Konu | Karar |
| --- | --- | --- |
| K1 | JSON kimlik alanı | Yalnızca `id`; geçiş dönemi yok |
| K2 | Liste body'si | Filtreler iç içe `filters` |
| K3 | Autocomplete | Hedefin `get-all`'u + `regex`, `limit: 20` |
| K4 | Postgres id | uuid v7 |
| K5 | `decimal` | JSON'da string |
