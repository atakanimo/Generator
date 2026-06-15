# Bugs

## BUG-001 - Node/Mongoose stack detected but models not found

- **Date:** 7 Mayıs 2026
- **Status:** Resolved
- **Severity:** High
- **Area:** Project scan / model discovery

### Summary (BUG-002)

UI tarafında teknoloji doğru detect ediliyor (`Node.js / Express / Mongoose`) ancak model listesi boş geliyor.

### Current behavior

- Stack detection başarılı.
- `Scan Project Files` sonrası:
  - `No model files found. Please check your project structure.`
- Hedef projede `src/models` yok; model dosyaları modül klasörlerinde:
  - `src/modules/**/<entity>.model.ts`

### Expected behavior

- Node/Mongoose projelerde model discovery yalnızca kurala göre çalışmalı:
  1. `src/modules/**` altında `*.model.ts` ve `*.model.js` taraması
- `src/models` veya `models` taraması yapılmamalı.
- `src/models` bulunmaması tek başına hata sebebi olmamalı.

### Reproduction

1. Project root olarak aşağıdaki yapıya benzer bir backend seç:
   - `src/core/**`
   - `src/modules/**` (her module içinde `*.model.ts` dosyaları)
   - `src/models` klasörü yok
2. Uygulamada scan başlat.
3. Stack doğru detect edildiği halde model listesi boş döner.

### Notes

- İlgili kural `beAnalyze` ve `AiRules` içine eklendi:
  - Node/Mongoose model discovery `src/modules/**` yapısını first-class desteklemeli.
- Fix uygulandı:
  - `projectScanner` Node stack için `src/modules/**` taramasına geçirildi.
  - UI bilgi metni sabit `src/models` metninden çıkarıldı; scan strategy metni sabit kurala bağlandı.

## BUG-002 - Scan UX and detected-stack messaging

- **Date:** 7 Mayıs 2026
- **Status:** Resolved
- **Severity:** Medium
- **Area:** Project selection UI / scan trigger

### Summary

Project selection ekranında klasör seçildikten sonra kullanıcıdan ayrıca `Scan Project Files` tıklaması bekleniyordu ve detected stack alanındaki metin beklentiyle tam uyumlu değildi.

### Requested behavior

- Hiçbir şey seçilmeden önce bile `Detected Technology Stack` kartında tarama stratejisi açıkça gösterilsin.
- `Browse Folder` ile klasör seçildiğinde scan otomatik başlasın.
- Detect sonrası:
  - kartta duplicate detected metin olmasın.
  - sadece yeşil başarı satırı (`Detected stack: ...`) kalsın.

### Applied fix

- `ProjectSelectPage` içinde:
  - `Browse Folder` seçimi sonrası `scanProjectFiles` otomatik tetiklenir hale getirildi.
  - kart başında sabit scan strategy açıklaması eklendi (alt alta):
    - Node.js -> `src/modules/**` + `*.model.ts|*.model.js`
    - .NET -> `Entities/Models`
  - detect sonrası duplicate metin kaldırıldı; sadece yeşil `Detected stack` satırı bırakıldı.

## BUG-003 - Generated Mongoose model template outputs missing names/types

- **Date:** 7 Mayıs 2026
- **Status:** Resolved
- **Severity:** High
- **Area:** Backend generator / Mongoose model template context

### Summary

Bazı projelerde üretilen `*.model.ts` dosyasında interface/model/schema isimleri ve field type’ları boş geliyordu (ör. `export interface  extends  { _id: ; ... }`).

### Current behavior (before fix)

- `src/modules/<module>/<module>.model.ts` üretiliyor, ancak:
  - `interfaceName`, `schemaName`, `modelExportName` gibi alanlar boş
  - field’larda `tsType` / `mongooseType` boş
- Sonuç: TypeScript derlenemiyor.

### Expected behavior

- Her model dosyası isim ve type bilgileriyle eksiksiz üretilmeli:
  - `export interface I<Pascal> extends Document { ... }`
  - `const <Pascal>Schema = new Schema<I<Pascal>>({ ... })`
  - `export const <Pascal> = mongoose.model<I<Pascal>>('<Pascal>', <Pascal>Schema)`

### Root cause

- `model.hbs` template’i `interfaceName/schemaName/modelExportName` ve field bazında `tsType/mongooseType` bekliyordu,
  ancak generator bu context alanlarını template’e sağlamıyordu.

### Fix

- `BackendGenerator` model template için gerekli context’i üretip sağladı.
- `model.hbs` field kaynağı, diğer template’lerle çakışmaması için `modelFields` üzerinden okunacak şekilde güncellendi.

## BUG-004 - Generated CRUD file does not follow BaseCrudService standard

- **Date:** 7 Mayıs 2026
- **Status:** Open
- **Severity:** High
- **Area:** Backend generator / CRUD template (`crud.hbs`)

### Summary

Üretilen `*.crud.ts` dosyası, hedef projedeki standart olan `BaseCrudService` tabanlı sınıf + instance pattern’ini kullanmıyor; bunun yerine basit bir `find/create/update/remove` obje literal üretiyor.

### Current behavior

- Generator output örneği:
  - `import { SymbolTypes } from './symbol-types.model';`
  - `export const symbolTypesCrud = { getAll, getById, create, update, remove }`

### Expected behavior

- Hedef projedeki standart:
  - `import { BaseCrudService } from '@core/services/base-crud.service';`
  - `import { SymbolTypes, type ISymbolTypeModel } from './symbolTypes.model';`
  - `class SymbolTypesCrud extends BaseCrudService<ISymbolTypeModel> { ... }`
  - `export const symbolTypesCrud = new SymbolTypesCrud();`
- Custom blocks (`<custom-imports>`, `<custom-methods>`) korunmalı.

### Notes / Suspected root cause

- `src/main/templates/backend/crud.hbs` template’i hâlâ legacy/minimal CRUD output üretiyor.
- `beAnalyze.md` içinde tanımlı CRUD standardı (BaseCrudService) ile template eşleşmiyor.
