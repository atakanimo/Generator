# Admin FE: `@atakanimo/ata-admin-base` config üretimi

Admin ekranlarını `@atakanimo/ata-admin-base` çizer ([admin-base-package.md](../admin-base-package.md)). Generator yalnızca **config** yazar: sayfa, tablo, modal, slice, thunk, servis üretmez; host'a route ya da reducer enjekte etmez. Config BE stack'inden bağımsızdır.

Kod: `src/main/generators/AdminConfigGenerator.ts` (dosya yazımı), `src/main/generators/adminResourceConfig.ts` (saf eşleme), IPC `src/main/ipc/frontendGenerator.ts`.

## Dosya kuralı (FE projesi, ör. `apps/admin/src/`)

Modül klasörü admin route'uyla aynı adı taşır (= resource `name`, kebab: `symbol-types` → `/symbol-types`). `config/` alt klasörü yok.

```
modules/<module>/<module>.generated.config.ts   Generator; her generate'te yeniden yazılır: defineResourceSchema({...}) → <camel>Schema
modules/<module>/<module>.generated.ts          Bir kez oluşturulur, sonra kullanıcıya aittir: extendResource(schema, { actions, cells, icon }) → <camel>Resource
modules/resources.generated.ts                  Generator; bütün modules/<m>/<m>.generated.ts dosyaları (klasör sırasıyla)
```

Host `createAdminRoutes(resources)`'u route + menü dizisine bir kez ekler. Yeni modül host'ta değişiklik istemez. Özel aksiyon ve hücreler `<module>.generated.ts`'e yazılır.

## Eşleme (v2 → `FieldConfig`)

| NormalizedField | FieldConfig |
| --- | --- |
| `kind` | `kind`; `date` → `datetime`, `reference` → `relation`, `decimal` → `decimal`, `map` → `valueKind: 'number'` |
| `reference.target` / `display` / `populate` | `ref` (hedef BE modül adı, kebab) / `display` / `populate` (`_id` düşer) |
| `enum.values` | `options` |
| `object.fields` | `fields` (özyinelemeli) |
| `filter` | `filter`; yalnızca searchable alanlarda. Enum → `enum`, reference → `relation` (BE filtre kurucusuyla aynı kural) |
| `ui.list` / `ui.label` | `list` / `label` (düz metin, i18n anahtarı değil) |
| `required`, `access.*` | `required`, `readonly`, `hideOnCreate`, `hideOnUpdate` |
| `default: null` / `nullable` | `nullable` |
| `ui.component` | `TextArea` → `component: 'textarea'`, `ImageField` → `component: 'image'`; diğerleri yazılmaz |

- `_id` hiç yazılmaz. `access.hidden` alan yazılabilirse (salt okunur değil, create ve update'te birden gizli değil) `writeOnly: true` olur: listede ve filtrede yok, formda gizli giriş (ör. şifre); değilse yazılmaz.
- Kaynak `label`'ı modelin `ui.label`'ı; yoksa entity adından (`SymbolTypes` → `Symbol Types`).
- Resource etiketi entity adından (`SymbolTypes` → `Symbol Types`).
- `operations`: Enable Update / Delete'ten; ikisi de açıksa yazılmaz.
- Admin alanı olmayan kind'lar (`unknown`) yorum + uyarıyla atlanır.

## Endpoint

Türetilmez, okunur: `findAdminMountPath` (`utils/backendAppFile.ts`) BE app dosyasında `<module>.routes.admin` router'ının `app.use('<path>', …)` satırını bulur. Var olan projelerde mount yolları tutarsız olabilir (`/api/symboltypes/admin`). Bulunamazsa `<baseUrl>/<module>/admin` + uyarı.

## Doğrulama

`node scripts/verify/admin-config-check.mjs`: bütün golden-set modelleri → config dosyaları, `apps/admin` içinde paket tiplerine karşı `tsc` + eşleme kontrolleri. Ayrıntı: [verification.md](../verification.md).
