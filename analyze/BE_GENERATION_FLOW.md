# BE Generation Flow (Current State - Updated)

**Amaç:** Backend dosya üretiminde şu anki gerçek çalışma sırasını netleştirmek.  
**Kaynak:** Kod akışı (`renderer -> preload -> main -> generator`)  
**Tarih:** 7 Mayıs 2026

---

## 1) End-to-end ana akış

1. Kullanıcı `SchemaDesignPage` içinde **Generate Code** tetikler.
2. Renderer, Redux thunk `generateBackend(...)` çağırır.
3. Thunk, preload bridge üzerinden `window.electronAPI.project.generateBackend(...)` çağırır.
4. Preload, `ipcRenderer.invoke('project:generateBackend', payload)` ile main process'e geçer.
5. Main process handler (`project:generateBackend`), IPC wrapper `generateBackend(...)` fonksiyonunu çalıştırır.
6. IPC wrapper, option'ları normalize eder ve `new BackendGenerator(options).generate()` çağırır.
7. `BackendGenerator.generate()` dizinleri hazırlar, backend dosyalarını üretir, route inject adımlarını (opsiyonel) yürütür.
8. Template render + file write tamamlanınca sonuç renderer'a geri döner.

---

## 2) Çağrı zinciri (dosya bazında)

- UI trigger: `src/renderer/src/pages/SchemaDesignPage.tsx`
- Redux thunk: `src/renderer/src/features/project/projectSlice.ts`
- Preload IPC bridge: `src/preload/index.ts`
- IPC registration: `src/main/index.ts`
- Backend wrapper: `src/main/ipc/backendGenerator.ts`
- Core generator: `src/main/generators/BackendGenerator.ts`
- Template engine: `src/main/utils/templateEngine.ts`
- Helpers: `src/main/utils/templateHelpers.ts`
- File utils/write: `src/main/utils/fileUtils.ts`

---

## 3) BackendGenerator içindeki mevcut sıra

`BackendGenerator.generate()` içinde mevcut operasyon sırası:

1. `setupDirectories()` + `ensureProjectDirectories(...)`
2. `ensureCoreBootstrapFiles()` (sadece Express+Mongoose stack için, create-if-missing)
3. `generateBackendFiles(...)` (manifest sırasına göre)
4. Route inject (opsiyonel, update moduna bağlı):
   - `addRouteToIndex(...)` (sadece `shouldAddRoute` true ve Node source ve `updateExistingFiles=true`)
   - `addAdminRouteToIndex(...)` (sadece `isAdminUser` true ve Node source ve `updateExistingFiles=true`)

`generateBackendFiles(...)` içindeki mevcut dosya üretim sırası:

1. `model` (`<module>.model.ts`)
2. `crud` (`<module>.crud.ts`)
3. `filters` (`<module>.filters.ts`)
4. `types` (`<module>.types.ts`)
5. `service` (`<module>.service.ts`)
6. `service.admin` (`<module>.service.admin.ts`) - `Include Admin API` true ise
7. `schema` (`<module>.schema.ts`)
8. `routes` (`<module>.routes.ts`)
9. `routes.admin` (`<module>.routes.admin.ts`) - `Include Admin API` true ise

Not: Kodda "parallel" ifadesi geçse de üretim adımları fiilen sıralı çalışır.

---

## 4) Update mode davranışı (kritik)

`updateExistingFiles=true` olduğunda mevcut davranış:

1. Mevcut dosya okunur
2. Custom block içerikleri extract edilir
3. Template render edilir
4. Custom block içerikleri yeni output'a merge edilir
5. Dosya yazılır

Marker bozukluğu tespitinde artifact üretimi durdurulur (deterministic fail).

---

## 5) Template ve çıktı haritası (mevcut)

Kullanılan backend template dosyaları:

- `src/main/templates/backend/route.hbs`
- `src/main/templates/backend/service.hbs`
- `src/main/templates/backend/types.hbs`
- `src/main/templates/backend/schema.hbs`
- `src/main/templates/backend/model.hbs`
- `src/main/templates/backend/crud.hbs`
- `src/main/templates/backend/filters.hbs`
- `src/main/templates/backend/route.admin.hbs` (opsiyonel)
- `src/main/templates/backend/service.admin.hbs` (opsiyonel)

Üretilen hedef klasörler:

- `src/modules/<module-name>/` (tüm artifact’lar co-located)

---

## 6) Refactor öncesi netleştirilecek farklar

`AiRules.md` / `rules.md` / `CODING_RULES.md` ile kıyaslandığında:

Bu farklar Phase-1 içinde kapatıldı:

1. Safe update standardı (extract -> merge -> write) uygulandı.
2. Backend module standardı (9 artifact) module-centric output ile hizalandı.
3. Ordered generation manifest ile genişletildi (9 artifact).
4. Admin dosya tipleri main/preload/renderer result tiplerinde hizalandı.

---

## 7) Refactor için önerilen ilk uygulama sırası

1. Result type contract'larını main/preload/renderer arasında hizala.
2. `updateExistingFiles` için tek bir merge pipeline ekle.
3. Custom marker extractor/validator/merger utility yaz.
4. Backend generation order'ı declarative bir queue'ya taşı.
5. Eksik backend artifact'leri (crud/filters/schema/model) kontrollü şekilde ekle.
6. E2E smoke ve update-preservation testleri ekle.
