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
| `path?` | Route segmenti; yoksa `name` |
| `menu?.order` | Sol menü sırası |
| `operations?` | `create / update / delete` alt kümesi; yoksa hepsi, `[]` = salt okunur |

`defineResourceSchema` literal tipleri korur; `InferRow<typeof schema>` satır tipini verir (`row.status` tiplidir).

## Alanlar (`src/schema/fields.ts`)

Ortak: `name`, `label`, `isArray`, `required`, `nullable`, `readonly`, `hideOnCreate`, `hideOnUpdate`, `list` (tablo kolonu), `filter`, `default`, `component`.

| `kind` | Ek alanlar | Tablo | Form | JSON |
| --- | --- | --- | --- | --- |
| `string` | `component?: 'textarea' \| 'image'` | metin / küçük resim | metin, çok satır, URL + önizleme | string |
| `number` | — | sayı | sayı | number |
| `decimal` | — | metin | `inputmode=decimal` metin | string |
| `boolean` | — | işaret | anahtar | boolean |
| `datetime` | — | tarih | tarih seçici (dayjs) | ISO string |
| `enum` | `options` | metin | select | string |
| `relation` | `ref`, `display?`, `populate?` | `display` alanı | autocomplete (hedefin `get-all`'u) | id ya da obje |
| `object` | `fields`, `typeName?` | okunur özet + JSON penceresi | iç içe form (dizide satır ekle / sil) | obje |
| `map` | `valueKind` | özet | anahtar / değer listesi | obje |
| `json` | — | kısaltılmış JSON | JSON metni | serbest |

- `filter`: `eq | regex | range | date-range | boolean | enum | relation`. Yalnızca `filter`'ı olan alanlar filtre çubuğunda çıkar.
- `default`: sabit değer ya da `{ dynamic: 'now' | 'uuid' | 'currentUserId' }` (create formu açılınca hesaplanır).
- Update body'si formdaki yazılabilir alanların tamamıdır (`toWriteBody`); `readonly` / `hideOnUpdate` alanlar ve şema dışı anahtarlar düşer, ilişkiler id'ye iner.

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
  fields: { status: { cell: StatusChip } },
  slots: { aboveTable: Summary },
});
```

| Alan | Anlamı |
| --- | --- |
| `icon` | Sol menü ikonu |
| `actions` | `placement: 'row' \| 'detail'` → `POST {endpoint}/:id/actions/:id`; `'toolbar' \| 'bulk'` → `POST {endpoint}/actions/:id` (`{ ids, ...input }`). `run` verilirse çağrı yerine o çalışır. `input` küçük bir form, `confirm` onay diyaloğu. Başarı metni BE `uiMessage`'ından |
| `fields` | Alan başına `cell` (tablo hücresi) ve `formField` (form bileşeni) override'ı |
| `slots` | `toolbarStart`, `aboveTable`, `belowTable` |

Özel aksiyon, hücre ve slot'lar yalnızca `<m>.generated.ts`'e yazılır; `.generated.config.ts` her generate'te ezilir.
