# NormalizedModel v2

Generator'daki **tek** model tipi: `NormalizedModel` (`src/shared/normalizedModel.ts`, `schemaVersion: 2`). Parser çıktısı, manifest satırı, IPC, renderer durumu ve bütün emitter'lar aynı tipi kullanır. Paralel model tipi eklenmez.

## Model

| Alan | Anlamı |
| --- | --- |
| `entityName` | PascalCase entity adı (`SymbolTypes`) |
| `fields[]` | `NormalizedField` listesi |
| `nestedSchemas?`, `nestedTypeName?` | Modelin yanında tanımlı adlandırılmış alt şemalar, `new Schema<IFoo>` arayüz adı |
| `timestamps?` | `{ createdAt, updatedAt }`; kaynak söylemiyorsa yok |
| `native?` | Stack'e özel model ayrıntısı. Mongoose: `modelName` (`mongoose.model('…')`), `collection` |
| `ownership?` | `{ kind: 'field' \| 'self' }`. Yoksa türetilir: `userId` alanı varsa `field` |
| `api?` | `{ normalOperations?, requiresAuth?, admin?, adminOperations? }` (`adminOperations` yoksa tam admin CRUD, `list` hep açık); manifest'te saklanır |
| `ui?` | `{ label? }`: admin menüsü ve sayfa başlığı (yoksa entity adından); manifest'te saklanır, arayüzde "Model etiketi" |

## Alan

| Alan | Anlamı |
| --- | --- |
| `name` | Alan adı. `id` / `_id` ayrılmıştır (`isReservedFieldName`) |
| `kind` | `string \| number \| decimal \| boolean \| date \| enum \| reference \| object \| map \| json \| unknown` |
| `isArray` | Değiştirici; `array` bir kind değildir |
| `required`, `nullable?`, `unique?`, `trim?` | Doğrulama bayrakları |
| `numberFormat?` | `number` için `int` \| `float`. Yoksa `float`. Editörde yalnızca C# ve Python |
| `dateFormat?` | `date` için `datetime` \| `date`. Yoksa `datetime` (saatli). `date` → `YYYY-MM-DD`, C# `DateOnly` |
| `format?` | `string` için `email` |
| `constraints?` | `minLength`, `maxLength`, `pattern` (tekil `string`: metin uzunluğu) ve `min`, `max` (tekil `number` / `decimal`). Dizi alanlarında yok. BE şemasında ve admin form kuralında; kural tek yerde: `constraintsForField` (`src/shared/fieldConstraints.ts`) |
| `enum?.values`, `enum?.numbers?`, `default?` | Enum etiketleri / değerleri. `numbers` varsa sayısal enum: `numbers[i]`, `values[i]`'nin saklanan ve JSON'daki değeri (C# `Name = 5`, Python `IntEnum`, Mongoose `enum: [0, 5]`). Açık değer: etiket sırası değişse de saklanan sayı değişmez. `default` sabit |
| `reference?` | `target`, `display`, `populate[]`, `include`, `relationType` |
| `object?` | `fields?` (yoksa opak obje), `typeName?`, `schemaName?` |
| `filter?` | `searchable`, `type` (`eq \| regex \| range \| date-range \| boolean \| enum \| reference`) |
| `access?` | `readonly`, `hiddenFromCreate`, `hiddenFromUpdate`, `hidden` (hiçbir cevapta dönmez), `adminOnly`, `computed` (okurken hesaplanır: saklanmaz, gövdede / filtrede / sıralamada yok, satırda opsiyonel; modülün `map_rows` / `mapRows` hook'u doldurur), `detailOnly` (ağır gövde: liste okumasında projeksiyonla dışarıda, liste satırında `null`; getOne döner) |
| `ui?` | `label`, `list`, `component`, `defaultValue` |
| `native?` | Ham parser tipi, bilinmeyen seçenekler, TS tipi, JSDoc. Yalnızca aynı stack'in emitter'ı okur |

İlkeler:
- Modelde stack ismi yok (`ObjectId`, `Schema.Types`, `DbSet`…); istisna `native`.
- Opsiyonel alan kaynaktaki varlığı yansıtır (var = set). Round trip kayıpsızdır.
- `canonicalModel` / `canonicalField` saklanan JSON'un anahtar sırasını belirler; manifest satırları bundan geçer.

## İç içe şekiller

- Adlandırılmış alt şema (`limits: SubscriptionLimitsSchema`) → `kind: 'object'`, `object.typeName` / `schemaName`, `object.fields` bağlı.
- Alt doküman dizisi (`items: [ItemSchema]`) → `kind: 'object'`, `isArray: true`, `object.fields` bağlı.
- Satır içi obje (`extra: { ... }`) → `kind: 'object'`; ObjectId alt alanı `kind: 'reference'`.
- `Map<string, number>` → `kind: 'map'`. Mongoose `Mixed` → `json`. Modellenmemiş tip → `unknown` (`native.type` ile korunur).

## Yardımcı modüller

| Modül | Görevi |
| --- | --- |
| `src/shared/fieldTypeToken.ts` | kind ↔ parser tip token'ı (`kindFromTypeToken`, `typeTokenOf`, `nativeTypeFor`, `templateScalarToken`), filtre token'ı ↔ `filter.type`. Elle string eşlemesi yazılmaz |
| `src/shared/fieldKind.ts` | Alan sınıflandırma ve Zod ifadesi (`classifyField`, `emitZodFieldExpr`) |
| `src/shared/modelMerge.ts` | `mergeModel(code, saved, sourceType)`: model dosyası (tipler, şema seçenekleri) + manifest satırı (etiket, bileşen, filtre, ilişki, erişim, API) |
| `src/shared/modelDraft.ts` | Model editörü: `ModelDraft = { model, seed? }`, `editorTypeOf` / `withEditorType` |
| `src/shared/ipcTypes.ts` | Renderer ↔ main IPC sözleşmesi; tek kaynak |

## Saklama: manifest v3

- Tek depo: proje kökünde `.generator/manifest.json` (v3). `.scaffold` yok.
- Eski sürüm manifest okunmaz: model satırları yok sayılır (loglanır), workspace tercihleri korunur, ilk v3 yazımından önce bir kez `manifest.v<N>.backup.json` olarak yedeklenir.
- `project:parseModel` main'de parse + manifest satırı + `mergeModel` yapar ve birleşik v2 modeli döner.
- Model açılırken dosya hash'i alınır (`ParseModelResult.sourceHash`). Generate anında dosya değişmişse hiçbir şey yazılmaz, "modeli yeniden açın" hatası döner.

## Stack eşlemesi

| `kind` | Mongoose | Prisma (PG) | EF Core (PG) | JSON |
| --- | --- | --- | --- | --- |
| `string` | `String` | `String` | `string` | string |
| `number` | `Number` (`int` → Zod `.int()`) | `Float` / `Int` | `double`; `numberFormat: 'int'` → `int` | number |
| `decimal` | `Decimal128` | `Decimal` | `decimal` | string |
| `boolean` | `Boolean` | `Boolean` | `bool` | boolean |
| `date` | `Date`; `dateFormat: 'date'` → `String` (`YYYY-MM-DD`, `match` deseni) | `DateTime` | `DateTimeOffset`; `dateFormat: 'date'` → `DateOnly` | ISO string; `date` → `YYYY-MM-DD` |
| `enum` | `String` + `enum`; `numbers` → `Number` + `enum: [numbers]` | `enum X` | string dönüşümü; `numbers` → `Name = n` + sayı | string veya number |
| `reference` | `ObjectId` + `ref` | relation + FK | FK + navigation | id / obje |
| `object` / `object[]` | alt şema | `Json` | owned type `ToJson()` | obje / obje[] |
| `map` | `Map` | `Json` | `Dictionary` (jsonb) | obje |

| Kimlik stratejisi | Stack | Tanım |
| --- | --- | --- |
| objectId | Express + Mongoose | `_id: ObjectId`, JSON'da `id` |
| objectId | .NET + MongoDB.Driver | `[BsonRepresentation(BsonType.ObjectId)] string Id` |
| uuid v7 | Express + Prisma | `String @id @default(uuid(7)) @db.Uuid` |
| uuid v7 | .NET + EF Core | `Guid Id`, `Guid.CreateVersion7()` |

İki stratejide de JSON'daki `id` string'dir.
