# Resource config

Her admin modülü iki dosyadan oluşur (host'ta `modules/<m>/`):

| Dosya | Sahibi | İçerik |
| --- | --- | --- |
| `<m>.generated.config.ts` | Generator, her generate'te yeniden yazar | `defineResourceSchema({...})` → `<camel>Schema` (yalnızca veri) |
| `<m>.generated.ts` | Bir kez oluşturulur, sonra kullanıcıya aittir | `extendResource(schema, {...})` → `<camel>Resource` (davranış) |

`modules/resources.generated.ts` bütün `<camel>Resource`'ları bir dizide toplar.

## `ResourceSchema` (`src/schema/resource.ts`)

| Alan | Anlamı |
| --- | --- |
| `schemaVersion` | `1` (`RESOURCE_SCHEMA_VERSION`); kırıcı değişiklikte artar |
| `name` | Registry anahtarı, kebab (`user-subscriptions`); ilişkilerde `ref` bunu gösterir |
| `endpoint` | Admin taban yolu (`/api/userSubscriptions/admin`); paket türetmez |
| `label?` | Menü / başlık metni |
| `fields` | `FieldConfig[]` |
| `defaultSort?`, `pageSize?` | Liste varsayılanları |
| `sortable?` | `false` → hiçbir kolon sıralanmaz, `defaultSort` yok sayılır (BE liste ucu sıralamıyorsa) |
| `path?` | Route segmenti; yoksa `name` |
| `menu?.order` | Sol menü sırası |
| `operations?` | `create / update / delete / export` alt kümesi; yoksa bütün yazma işlemleri (export hariç), `[]` = salt okunur. `export` opt-in: yalnız listedeyse toolbar'da "Dışa aktar" (aşağıda) |
| `titleField?` | Kaydı adlandıran alan (ör. `ticker`, `email`); silme onayı «değer» silinsin mi? diye sorar (`ataAdmin.deleteTitleNamed`). Yoksa ya da değer boşsa genel metin. Generator: `ui.titleField`, yoksa `ticker` / `code` / `email` / `name` … ya da zorunlu unique kısa metin alanı (0.1.9) |

**Export (CSV, sözleşme §2 "Export"):** `operations` `export` içeriyorsa toolbar'da "Dışa aktar" düğmesi `ExportDialog`'u açar: kolon seçimi (`id` + `writeOnly` olmayan alanlar; varsayılan işaretli `id` + `list: true` alanlar, "Tümünü seç"), başlıklar yerelleştirilmiş alan etiketleri. İstek `DataProvider.exportCsv` → `POST {endpoint}/export` (`{ filters, sortBy, sortOrder, fields, headers }`, tablonun geçerli filtre ve sırası; sayfa yok), `responseType: 'blob'`; dosya adı `Content-Disposition`'dan (yoksa `<name>.csv`). Hata host toast'unda, pencere açık kalır. Generator, model `api.adminOperations` `export` içeriyorsa config'e yazar.

`defineResourceSchema` literal tipleri korur; `InferRow<typeof schema>` satır tipini verir (`row.status` tiplidir).

## Alanlar (`src/schema/fields.ts`)

Ortak: `name`, `label`, `isArray`, `required`, `nullable`, `readonly`, `hideOnCreate`, `hideOnUpdate`, `writeOnly`, `list` (tablo kolonu), `sortable`, `filter`, `default`, `component`, `format` (`email`), `numberFormat` (`int`), `dateFormat` (`date`), `constraints` (`{ minLength, maxLength, pattern }` tekil metinde, `{ min, max }` tekil sayıda; dizilerde yok).

| `kind` | Ek alanlar | Tablo | Form | JSON |
| --- | --- | --- | --- | --- |
| `string` | `component?: 'textarea' \| 'image'`, `format?: 'email'` | metin / küçük resim | metin, çok satır, URL + önizleme, e-posta | string |
| `number` | `numberFormat?: 'int'` | sayı | sayı; `int` adım 1 | number |
| `decimal` | — | metin | `inputmode=decimal` metin | string |
| `boolean` | — | işaret | anahtar | boolean |
| `datetime` | `dateFormat?: 'date'` | tarih | tarih + saat; `date` yalnızca gün (`YYYY-MM-DD`) | ISO string veya `YYYY-MM-DD` |
| `enum` | `options`, `numbers?` | etiket | select; `numbers` varsa `numbers[i]` gönderir (açık değer) | string veya number |
| `relation` | `ref`, `display?`, `populate?` | `display` alanı | autocomplete (hedefin `get-all`'u) | id ya da obje |
| `object` | `fields`, `typeName?` | okunur özet + JSON penceresi | iç içe form (dizide satır ekle / sil) | obje |
| `map` | `valueKind` | özet | anahtar / değer listesi | obje |
| `json` | — | kısaltılmış JSON | JSON metni | serbest |
| `file` | `accept?` | — | dosya seçici | `File`; yalnızca action `input`'unda, varsa istek multipart gider |

- `filter`: `eq | regex | range | date-range | boolean | enum | relation`. Yalnızca `filter`'ı olan alanlar filtre çubuğunda çıkar.
- `sortable`: kolon sunucu sıralaması. Varsayılan skaler, dizi olmayan alanlarda açık; `false` kapatır. `true` ilişki / obje / dizi alanını sıralanabilir yapmaz.
- `default`: sabit değer ya da `{ dynamic: 'now' | 'uuid' | 'currentUserId' }` (create formu açılınca hesaplanır).
- `writeOnly` (ör. şifre; model `hidden` + yazılabilir): cevapta gelmez, tabloda ve filtrede yok; formda gizli giriş, edit'te boş başlar ve boşsa gönderilmez; `required` yalnızca create'te.
- Update body'si formdaki yazılabilir alanların tamamıdır (`toWriteBody`); `readonly` / `hideOnUpdate` alanlar ve şema dışı anahtarlar düşer, ilişkiler id'ye iner. Edit'te boşaltılan opsiyonel ya da `nullable` tekil alan `null` gider, BE alanı temizler (sözleşme §5, JSON Merge Patch); zorunlu alan ve boş `writeOnly` gönderilmez, dizi `[]` ile boşalır (0.1.8).

## `extendResource` (`src/schema/extend.ts`)

```ts
export const userSubscriptionsResource = extendResource(userSubscriptionsSchema, {
  icon: WorkspacePremiumIcon,
  actions: [
    {
      id: 'grant-premium',               // → POST {endpoint}/:id/actions/grant-premium
      label: 'Premium yap',
      placement: 'row',
      visible: row => row.status !== 'active',
      input: [{ name: 'days', kind: 'number', required: true }],
      confirm: { title: 'Kullanıcı premium yapılsın mı?' },
    },
  ],
    {
      id: 'export-csv',
      label: 'CSV indir',
      placement: 'toolbar',
      visible: ({ listBody }) => Boolean(listBody.filters?.status),   // yalnızca durum filtresiyle
      run: ({ listBody }) => downloadCsv(listBody.filters),
    },
    { id: 'resync', label: 'Eşitle', placement: 'detail' },      // detay drawer'ının alt bölümünde
  ],
  fields: {
    status: { cell: StatusChip },
    provider: { loadOptions: ({ signal }) => fetchProviders(signal) },  // dinamik select
  },
  slots: { aboveTable: Summary },
  detail: { component: ReportResults },
});
```

| Alan | Anlamı |
| --- | --- |
| `icon` | Sol menü ikonu |
| `actions` | `placement: 'row' \| 'detail'` → `POST {endpoint}/:id/actions/:id`; `'toolbar' \| 'bulk'` → `POST {endpoint}/actions/:id` (`{ ids, ...input }`). `run` verilirse çağrı yerine o çalışır. `input` küçük bir form, `confirm` onay diyaloğu. Başarı metni BE `uiMessage`'ından |
| `actions[].visible / disabled` | Satır / detay aksiyonunda `(row) => boolean`; toolbar / toplu aksiyonda `({ listBody, selectedIds }) => boolean` |
| `fields` | Alan başına `cell` (tablo ve detay hücresi), `formField` (form bileşeni), `loadOptions` ve `file` override'ı |
| `fields.<ad>.file` | Değer dosya adı, dosya BE'de: `{ path?, thumbnailVariant?, openVariant?, hasThumbnail?(row) }`. Hücre `GET {endpoint}/:id/{path ?? 'file-url'}?variant=` → `{ url }` ile adresi arka planda alır (TanStack, 60 sn taze). Küçük resim yüklenemezse bir kez `openVariant`'a düşer; ada tıklamak `openVariant`'ı yeni sekmede açar. `cell` verilirse o geçerli |
| `fields.<ad>.loadOptions` | `({ signal }) => Promise<string[]>`: seçenekleri çalışma anında yükler (resource + alan başına önbellekli). `enum` alanında statik `options`'ın yerine geçer; `string` alanında formda select, `filter: 'enum'` ile filtrede seçim kutusu çıkarır. Etiket yine `admin.<resource>.enums.<alan>.<değer>` |
| `slots` | `toolbarStart`, `aboveTable`, `belowTable` |
| `detail` | Salt okunur detay drawer'ı; satırda "Detay" ikonu açar. `placement: 'detail'` aksiyonu varsa kendiliğinden açık; `true` ya da `{ fetch?, component?, hideFields? }`. `fetch` (varsayılan `true`) kaydı `getOne` ile çeker, `false` listedeki satırı gösterir. `component` alanların altına eklenir (`{ row, refresh, close }`). `false` → detay yok, `detail` aksiyonları satırda |
| `detail.related` | Detayda ilişkili kayıt tabloları, `component`'ın altında: `[{ resource, filters(row), fields?, title?, pageSize? }]`. Hedef registry'den bulunur, `get-all` `filters(row)` ile süzülür (ör. `row => ({ eventId: row.id })`), sunucu sayfalamalı (varsayılan 10). Hedefin `row` ve `detail` aksiyonları satırda çıkar; aksiyon sonrası hedef ve detayın resource'u yenilenir. `fields` kolonları ve sırasını seçer |

Özel aksiyon, hücre ve slot'lar yalnızca `<m>.generated.ts`'e yazılır; `.generated.config.ts` her generate'te ezilir.
