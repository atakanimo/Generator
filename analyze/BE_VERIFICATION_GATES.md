# BE Verification Gates (Updated)

Tarih: 7 Mayıs 2026

## Gate 1 - Contract Consistency

- `GenerateBackendResult` main/preload/renderer katmanlarında aynı artifact anahtarlarını içerir.
- Admin çıktıları (`routeAdmin`, `serviceAdmin`) sözleşmede açıkça tanımlıdır.

## Gate 2 - Ordered Artifact Generation

- Backend generator manifest sırası:
  1. model
  2. crud
  3. filters
  4. types
  5. service
  6. admin.service
  7. schema
  8. routes
  9. routes.admin
- Üretim adımları sıralı yürütülür.
- Output path doğrulaması:
  - tüm artifact’lar `src/modules/<module-name>/` altında üretilir
  - legacy `src/models|src/services|src/routes|src/types` altına yeni dosya yazılmaz

## Gate 3 - Safe Update

- `updateExistingFiles=true` olduğunda delete/recreate yapılmaz.
- Aşağıdaki marker blokları extract + merge edilir:
  - `custom-imports`
  - `custom-types`
  - `custom-methods`
  - `custom-routes`
  - `custom-schema`
- Marker bozukluğu tespitinde dosya üretimi durdurulur.
- Route injection davranışı:
  - `updateExistingFiles=false` iken inject yapılmaz
  - `updateExistingFiles=true` iken inject yapılır

## Gate 4 - Template Coverage

- Manifestteki tüm artifactler için backend template mevcut olmalıdır.
- Eksik template halinde hata loglanmalı ve ilgili artifact skip edilmelidir.
- Template standard kontrolleri:
  - `routes` template’leri `validate` + `TSchema` import eder
  - `schema` template’i `GetAllBodySchema` + `MongoIdParamSchema` üretir
  - `service` template’leri CRUD delegation kullanır (direct `Model.find*` yok)
  - `crud` template’i `BaseCrudService` kullanır
  - `types` template’i `Get<Entity>Filters` ve `<Entity>ListBody` üretir

## Gate 5 - Manual Smoke

- Tek bir model ile backend generate çalıştırılır.
- Update mode açılarak custom block koruması doğrulanır.
- Admin seçeneği açık/kapalı iki senaryoda output seti kontrol edilir.
