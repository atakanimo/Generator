# Varlik360 geçişi: özet ve durum

Varlik360 (`/Users/atakanatabey/Projects/VarlikALL/Varlik360`) Generator'ın ilk gerçek hedefi ve golden set'idir. Bu dosya ne yapıldığının kısa özetidir; "nasıl çalışıyor" bilgisi diğer dokümanlarda.

## Yapılanlar

1. **Alan uyumluluğu:** iç içe adlandırılmış obje (`limits`), alt doküman dizisi (`items: [Schema]`), satır içi obje, Map, Decimal128, ObjectId alt alanı parse → model → BE → UI zincirinde desteklendi.
2. **API sözleşmesi** (K1–K5): JSON'da `id`, iç içe `filters`, hedefin `get-all`'u ile autocomplete, Postgres uuid v7, decimal string.
3. **BE (Express + Mongoose):**
   - NormalizedModel v2 tek tip; legacy tipler, `.scaffold` ve v2 manifest okuma kaldırıldı; manifest yalnızca v3.
   - Core asset'ler (`wire`, `crud-scope`, `crud-projection`, `list-pagination.schema`), gizli alanlar, `field` / `self` ownership, `adminOnly`, model başına normal işlem seti.
   - Servis hook'ları ve `defaultSort`, `custom-filter-fields` blokları, model `default` → create şeması, `collection` korunması.
   - Eski parse ile generate koruması (dosya hash'i), core asset import koruması.
4. **Admin FE:** eski Handlebars FE üreticisi silindi; Generator yalnızca `@atakanimo/ata-admin-base` config'i üretiyor. Schema Designer FE ayarları sadeleşti.
5. **Varlik360:**
   - Core elle birleştirildi; bütün üretilmiş modüller pakete taşındı: symbol-types, transactions, symbols, notifications, user-watch-list, app-version-configs, subscriptions, fund-daily-metrics, user-subscriptions, users, daily-portfolio, user-asset-categories, ip-blacklist (elle).
   - Mobil (`apps/mobile`) yeni sözleşmeye geçti (`id`, iç içe `filters`, AsyncStorage migrasyonu).
   - Admin istek sınırı okuma / yazma olarak ayrıldı.
   - Varlik360 `tsc` 0, admin `tsc` 0; 13 paket sayfası ve elle yazılmış sayfalar tarayıcıda test edildi.
   - `routes.ts`'te yalnızca elle yazılan sayfalar kaldı: Dashboard, Metrics, Logs, SendNotification.

## Açık işler

- **Commit:** iki repo da commit'siz. Generator tek commit; commit'ten önce `.scaffold` index kayıtları ve Varlik360 `apps/admin/public/.local-test-token.txt` index'ten çıkarılmalı.
- **Deploy engelleri:**
  - admin, `@atakanimo/ata-admin-base`'i `file:` ile alıyor; paket yayınlanmadan ya da vendorlanmadan CI build'i çalışmaz;
  - `yarn.lock` bu bağımlılığı içeriyor, yayından sonra yeniden üretilmeli;
  - BE ve mobil aynı sürümde çıkmalı.
- **Sonraya:**
  - iç içe (iki seviye) populate (şema + şablon + config);
  - tarih seçicileri `MM/DD/YYYY` / İngilizce (`adapterLocale='tr'`);
  - DataGrid kolon menüsü aria metni İngilizce;
  - host Logs sayfası İngilizce sayfalama;
  - transactions admin işlem seti (yalnızca liste) gözden geçirilmeli.
- **Generator:** `Get*Query = Get*Filters` alias'ının kaldırılması; custom blok dışındaki el kodunun sessizce silinmesine genel koruma (R9) yok.
- Mobil simülatör testi yapılmadı.
