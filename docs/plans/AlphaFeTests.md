# AlphaTerminal (StockExchange) FE: üretilen dosyaların test planı

Bu doküman Cursor'a (ya da başka bir ajana) verilir. Generator StockExchange'in FE dosyalarını ürettikten sonra, üretilen her dosyadaki fonksiyonların ve ekranların gerçekten çalışıp çalışmadığını adım adım dener. Sonuçlar bu dosyaya işlenir: her satırın "Sonuç" hücresine ✅ / ❌ + bulgu numarası (`AF1`, `AF2`, …), bulgular en alttaki tabloya.

Durum (2026-10-25): **12 / 12 ekran üretildi, admin'e bağlandı ve tarayıcıda denendi (grup 1–4). Özel aksiyonlar 5 / 5 yazıldı ve arayüzde denendi (AF12, E13). 5.1: E3, E4, E6, E7, E9, E11, E13 ✅; E5 atlandı (normal kullanıcı token'ı yok), E10 ✅ (API). 5.1'de E5 dışındakiler sonuçlu (E10 test kullanıcısı yerelde kaldı). Bölüm 6: X1–X3, X5, X6 ✅; X4 npm yayınına bağlı (AF6).** Üçerli gruplar: 1) Plans, IP blacklist, Audit log; 2) Scheduled reports, Report watchlist, Deep Dive reports; 3) Deep Dive prompts, Providers, Markets; 4) Symbols, Users, User subscriptions. BE tarafında 12 ekranın hepsi Generator'dan üretildi (StockExchange `documents/py-resource-generation-plan.md`).

### Üretim ve çalıştırma (her grup için)

- Config üretimi (Electron yok): `node ~/Projects/Generator/scripts/python-host.mjs admin-config <StockExchange> apps/admin <Entity,Entity,…>` (endpoint host'un `admin_router_generated.py` prefix'i + `API_PREFIX`'ten okunur).
- Yeni BE kodu: Generator `.claude/launch.json` → `stockexchange-api-local` (`.venv` uvicorn, :8766, yerel Mongo; `alpha-api` konteyneri eski imajla kalır). Admin: `stockexchange-admin-localbe` (:5174, `VITE_API_BASE_URL=http://localhost:8766`).
- Giriş: admin hesabıyla pencereden (ajan şifre girmez). Admin'in API adresi `localhost:8766` olmalı (`127.0.0.1` farklı site sayılır, yenileme çerezi gitmez ve sayfa yenilenince oturum düşer; AF11).

## Ajan için kurallar

- Proje: `/Users/atakanatabey/Projects/VarlikALL/StockExchange` (AlphaTerminal). Admin FE `apps/admin`, kullanıcı FE `apps/web`, API `src/alpha_terminal` (FastAPI, önek `/api/v1`).
- **G dosyalarına elle dokunma** (`*.generated.config.ts`, `resources.generated.ts`, `*.generated.ts` servis / thunk / slice). Hata G dosyasındaysa bulguya yaz: düzeltme Generator'da yapılır ve dosya yeniden üretilir. K dosyaları (`modules/<m>/<m>.generated.ts`, `<x>.service.ts`, `<x>.thunk.ts`, `<x>.slice.ts`) düzeltilebilir; ne değiştiğini bulguya yaz.
- Sayfalarda `try/catch` / `.then` yok: thunk + `unwrap` + destructuring (repo kuralları `.cursor/rules/frontend.mdc`, `general.mdc`).
- Commit yok. Yerel veritabanı gerçek veri içeriyor: yazma testlerini (create / update / delete) yalnız bu dokümanın söylediği **test kayıtlarıyla** yap ve sonunda sil; mevcut provider / market / prompt kayıtlarını değiştirdiysen eski değerine geri al.
- Bir test kullanıcı kararı gerektiriyorsa (davranış belirsiz) tahmin etme: bulguya "karar bekliyor" yaz ve devam et.

## Ön koşullar

- [x] Yerel API çalışıyor (yeni kodla; migration'lardan sonra eski imaj veriyi okuyamaz): `GET /api/v1/health` 200. (2026-10-25: `stockexchange-api-local` :8766)
- [x] Admin hesabı ile giriş (2026-10-25, kullanıcının verdiği access token'la; 15 dk). Normal kullanıcı (403 testleri) denenmedi.
- [x] `apps/admin` `@atakanimo/ata-admin-base` sürümü **≥ 0.1.8** (2026-10-25: `file:../../../../Generator/packages/admin-base`, 0.1.8; npm'e yayınlanınca sürüme dönülür, bkz. AF6) (update `null` kuralı, `writeOnly`, `detailOnly`, `loadOptions`; `package.json`'da bugün `^0.1.5`). Yayınlanmadıysa geliştirmede `file:` bağımlılığı ([admin-base-package.md](../admin-base-package.md) "Host kurulumu").
- [x] Host kurulumu tamam (2026-10-25: `main.tsx` `AtaAdminProvider` + `createAtaRestProvider({ http: adminHttp })`, `App.tsx` `createAdminRoutes(resources)`, `vite.config.ts` `dedupe`, `tsconfig.app.json` `paths.axios`; menü bugünkü el yazımı sidebar, yollar resource adına çevrildi): `AtaAdminProvider` + `createAtaRestProvider({ http: API })`, `createAdminRoutes(resources)` route ve menüde, `adminBaseTexts` / `adminBaseTextsEn` i18next'te, interceptor sözleşme §7'ye uygun ([api-contract.md](../api-contract.md)).
- [x] Üretilen dosyalar yerinde (grup 1: `subscription-plans`, `ip-blacklist`, `audit-logs`; grup 2: `scheduled-reports`, `daily-report-watchlist`, `deep-dive-reports`):
  - `apps/admin/src/modules/<m>/<m>.generated.config.ts` (G), `apps/admin/src/modules/<m>/<m>.generated.ts` (K), `apps/admin/src/modules/resources.generated.ts` (G).
  - `apps/web` için istemci veri katmanı yalnız `api.normalOperations`'ı olan modellerde üretilir; bugün 12 modelin hepsinde boş, yani web'de üretilen dosya yok (Bölüm 4 o zaman uygulanır).

## 1. Statik kontroller

| # | Kontrol | Beklenen | Sonuç |
| --- | --- | --- | --- |
| S1 | `cd apps/admin && npx tsc -b` | 0 hata (tabandan fazlası yok; taban önce kaydedilir) | ✅ taban 0, sonra 0 |
| S2 | `npm run lint` | Üretilen dosyalarda hata yok | ✅ 36 sorun (öncekiyle aynı, hepsi eski sayfalarda); yeni / üretilen dosyalarda 0 |
| S3 | `npm run build` | Başarılı | ✅ |
| S4 | `resources.generated.ts` | 12 modül, klasör sırasıyla; her biri `<m>.generated.ts`'ten | ✅ 12 modül |
| S5 | Her `<m>.generated.config.ts` | `endpoint` `/api/v1/admin-crud/<kebab>` (aşağıdaki tablo), `operations` BE'nin admin işlemleriyle aynı | ✅ 12 modül (AF1 düzeltmesinden sonra) |
| S6 | Alan eşlemesi | Bölüm 3'teki her kaynağın alan listesi config'te: tür, `required`, `readonly`, `hideOnCreate` / `hideOnUpdate`, `writeOnly`, `options`, `constraints`, `format`, `numberFormat`, `filter` | ✅ 12 modül (AF2, AF9, AF13, AF14, AF17 düzeltmelerinden sonra) |
| S7 | Eski elle yazılmış sayfalar | Üretilen resource'la çakışan route yok (ör. `/providers` iki kez tanımlı değil) | ✅ `/plans`, `/ip-blacklist`, `/audit-log` el yazımı route'ları kaldırıldı (`/plans` → `/subscription-plans`, `/audit-log` → `/audit-logs` yönlendirme); sayfa dosyaları adım 7'de silinir. Grup 2: `/scheduled-reports`, `/daily-report-watchlist`, `/deep-dive-reports` el yazımı route'ları kaldırıldı (yollar aynı). Grup 3: `/markets`, `/providers`, `/deep-dive-prompts` aynı şekilde. Grup 4: `/users` kaldırıldı; `/symbols` ve `/user-subscriptions`'ın eski sayfası yok (menüde de yoklar, adresle açılıyor) |

| Modül klasörü | Endpoint | Admin işlemleri |
| --- | --- | --- |
| `subscription-plans` | `/api/v1/admin-crud/subscription-plans` | tam CRUD |
| `ip-blacklist` | `/api/v1/admin-crud/ip-blacklist` | list, create, delete |
| `audit-logs` | `/api/v1/admin-crud/audit-logs` | list, getOne |
| `scheduled-reports` | `/api/v1/admin-crud/scheduled-reports` | list, getOne, delete |
| `daily-report-watchlist` | `/api/v1/admin-crud/daily-report-watchlist` | list, delete |
| `deep-dive-reports` | `/api/v1/admin-crud/deep-dive-reports` | list, getOne, delete |
| `deep-dive-prompts` | `/api/v1/admin-crud/deep-dive-prompts` | list, update |
| `providers` | `/api/v1/admin-crud/providers` | list, update |
| `markets` | `/api/v1/admin-crud/markets` | list, update |
| `symbols` | `/api/v1/admin-crud/symbols` | list, getOne, create, delete |
| `users` | `/api/v1/admin-crud/users` | list, getOne, create, update |
| `user-subscriptions` | `/api/v1/admin-crud/user-subscriptions` | list, getOne |

## 2. Her kaynakta ortak testler

Her kaynak için bu tablo kopyalanır (Bölüm 3'te kaynağa özel olanlar ayrıca). Ağ isteklerini tarayıcının ağ sekmesinden (ya da `read_network_requests`) doğrula: yol, metot, gövde, bayraklar.

| # | Test | Beklenen |
| --- | --- | --- |
| O1 | Menüden sayfayı aç | Başlık model etiketi; tablo dolu; istek `POST {endpoint}/get-all` gövde `{ page: 1, limit: 50 }` (ya da varsayılan), `skipSuccessToast` (toast yok) |
| O2 | Sayfalama | Sonraki sayfa `page: 2`; toplam sayı doğru |
| O3 | Sıralama | Sıralanabilir kolon başlığı → `sortBy`, `sortOrder`; dizi / obje / computed kolon sıralanamaz |
| O4 | Filtre çubuğu | Yalnız `filter`'ı olan alanlar; uygulayınca `filters` içinde gider; regex içerir, enum seçim, boolean, tarih aralığı (`{ from, to }`), ilişki autocomplete (hedefin `get-all`'u, `limit: 20`, `skipLoading`) |
| O5 | Filtreyi temizle | `filters` boş |
| O6 | Kapalı işlemler | Kapalı işlemin düğmesi yok (create / edit / delete / detay) |
| O7 | Hücreler | Tarih yerel biçimde, enum etiketi, ilişki `display` alanı, obje / dizi okunur özet + tıklayınca JSON penceresi, boolean işaret |
| O8 | Detay (getOne açıksa) | Satırdaki detay ikonu → `GET {endpoint}/:id`, drawer'da alanlar; `detailOnly` alan burada dolu |
| O9 | Create (açıksa) | Form: zorunlu işaretleri, kısıt hataları istemcide; gönderim `POST {endpoint}/create`; başarı toast'u (BE `uiMessage`); liste yenilenir |
| O10 | Update (açıksa) | Form mevcut değerle dolu; readonly / `hideOnUpdate` alan yok ya da kilitli; gövde yalnız yazılabilir alanlar; boşaltılan opsiyonel alan `null` gider; ilişki id'ye iner |
| O11 | Delete (açıksa) | Onay penceresi (`SİL` büyük harf, `<html lang="tr">`); `DELETE {endpoint}/:id`; liste yenilenir |
| O12 | BE hatası | 400 / 409 / 422 → host interceptor toast'u (`errorData.message`), paket ayrıca toast göstermez; form açık kalır |
| O13 | Dil | Dil değişince paket metinleri (`ataAdmin.*`) ve BE mesajları (Accept-Language) değişir |
| O14 | Yetki | Normal kullanıcı tokenıyla sayfa 403 / ForbiddenPage |
| O15 | Yükleme | Liste isteğinde global loading; autocomplete'te yok |

## 3. Kaynağa özel testler

### 3.1 Plans (`subscription-plans`): tam CRUD

| # | Test | Beklenen | Sonuç |
| --- | --- | --- | --- |
| P1 | Ortak O1–O15 | | ✅ liste (3 plan, iç içe obje hücreleri), filtre çubuğu, detay drawer'ı, edit formu → `POST …/update/:id` 200, form kapanır, toast. "canceled" toast'u AF10'da düzeltildi. Sıralama / sayfalama / dil / 403 denenmedi |
| P2 | Create: `code` `TEST_PLAN`, `tier` enum, `price` / `limits` / `features` / `rateLimit` iç içe formlar, `marketsAllowed` metin dizisi | Kayıt oluşur; iç içe obje alanları doğru gövdede | ✅ API (gövde iç içe objelerle, `isActive: false`); oluşan kayıt arayüzde listede (E3) |
| P3 | `code` tekrarı | 409 toast | ✅ API 409 "Bu değer zaten kullanılıyor: code" |
| P4 | `code` 65 karakter | İstemci kuralı (maxLength 64) ya da BE 400 | ✅ API 400 (maxLength 64) |
| P5 | Update: `description` boşalt | `null` gider, BE alanı siler | ✅ UI: edit'te Description boşaltıldı → yanıt `description: null`, iç içe objeler aynı |
| P6 | Aktif aboneliği olan planı sil | BE hatası (silinemez) toast | atlandı: gerçek plan (Pro) silme denemesi kural bozuksa veri kaybettirir; kural BE testinde (`count_active_for_plan`) |
| P7 | Test planını sil | 200 | ✅ UI: satırdan sil → `DELETE …/6addec25…` 200, 3 plan kaldı |

### 3.2 IP blacklist: list, create, delete

| # | Test | Beklenen | Sonuç |
| --- | --- | --- | --- |
| IP1 | Ortak testler | Edit düğmesi yok | ✅ liste (337), edit düğmesi yok, filtre çubuğu; API'de update 404 |
| IP2 | Create `203.0.113.7`, sebep boş | `reason` `manual ban`, `createdBy` admin id, `source` `manual` | ✅ API + UI (form yalnız Ip ve Reason; kayıt `manual ban`, `manual`, admin id) |
| IP3 | Create `999.1.1.1` | 422 "Geçersiz IP" | ✅ API 422 + UI toast "Geçersiz IP adresi." (E6) |
| IP4 | Aynı IP tekrar | 409 | ✅ API 409 + UI toast "Bu değer zaten kullanılıyor: ip" (var olan IP ile, kayıt oluşmadı; E6) |
| IP5 | Readonly alanlar (`hitCount`, `lastSeenAt`, `expiresAt`, `matchedPath`) | Create formunda yok, tabloda var | ✅ create formunda yok, tabloda var |
| IP6 | Test IP'sini sil | 200 | ✅ UI: Ip filtresi (`203.0.113`) → 1 kayıt → sil onayı → `DELETE` 200, "Toplam 0 kayıt" |

### 3.3 Audit log: list, getOne

| # | Test | Beklenen | Sonuç |
| --- | --- | --- | --- |
| AL1 | Liste | `actorUserId` kullanıcının adı / e-postası (populate); `action` enum filtresi; `at` tarih aralığı | ✅ API: populate `{ id, name, email }`, enum ve date-range filtresi; tabloda aktör e-postası, 281 kayıt ✅ UI |
| AL2 | Detay | `details` obje JSON penceresinde | ✅ API getOne; detay drawer'ında `details` JSON ✅ UI |
| AL3 | `actorUserId` filtresi | Kullanıcı autocomplete (users `get-all`) | ✅ (grup 4'ten sonra) users resource'u geldi; aynı autocomplete UB1'de çalışıyor |
| AL4 | Yazma düğmeleri | Yok | ✅ config `operations: []` |

### 3.4 Scheduled reports: list, getOne, delete

| # | Test | Beklenen | Sonuç |
| --- | --- | --- | --- |
| SR1 | Liste | `runDate`, `cadence`, `status`, `topN` kolonları; `results` / `fullResults` / `shortResults` obje dizisi özetleri | ✅ 235 rapor; detay + sil ikonları. Not: `cadence` / `status` enum ama filtresi metin (manifest `regex`) |
| SR2 | Detay | Sonuç dizileri ve `stats` drawer'da | ✅ `GET …/:id` 200; 25 / 380 / 10 öğe özetleri, `stats`, `notes` |
| SR3 | Silme | **Gerçek raporu silme.** Silme yalnız test için oluşturulmuş bir raporla denenir; yoksa "atlandı" yaz (rapor silinince watchlist satırları da silinir) | atlandı (test raporu yok) |

### 3.5 Report watchlist: list, delete

| # | Test | Beklenen | Sonuç |
| --- | --- | --- | --- |
| WL1 | Liste | `ticker`, `rank`, `recommendation`, `tradeSide`; computed kolonlar (`livePrice`, `changeFromEntryPct`, `distanceToTp1Pct`, `distanceToTp2Pct`) dolu, sıralanamaz, filtrede yok | ✅ 2.733 kayıt, yalnız sil; canlı alanlar dolu (ör. RYSAS.IS 23.18, −%11,1), filtrede yok |
| WL2 | Sayısal filtre (`rank`, `alphaScore`) | eşitlik / aralık | filtre alanları var, denenmedi |
| WL3 | CSV export aksiyonu (K: `<m>.generated.ts`, eski uç `GET /api/v1/admin/daily-report-watchlist/export`) | Dosya iner, filtreler uygulanır | ⬜ aksiyon henüz yazılmadı (AF12) |
| WL4 | Rapora göre sil aksiyonu (eski uç `DELETE /api/v1/admin/daily-report-watchlist/by-report/{report_id}`) | Yalnız test verisiyle; yoksa atlandı | ✅ BE `POST …/daily-report-watchlist/actions/delete-by-report` + FE toolbar; UI: olmayan rapor id'si → 200 "Rapor için 0 izleme listesi kaydı silindi." (E13) |

### 3.6 Deep Dive reports: list, getOne, delete

| # | Test | Beklenen | Sonuç |
| --- | --- | --- | --- |
| DD1 | Liste | `analysis` kolonu yok / `null` (detailOnly); `userId` kullanıcı adı / e-postası | ✅ 1 rapor, `analysis` kolonu yok, User e-posta |
| DD2 | Detay | `analysis` dolu (getOne) | ✅ |
| DD3 | Filtre | `userId` autocomplete, `ticker`, `marketCode`, tarih aralıkları | ✅ `userId` autocomplete (UB1 ile aynı bileşen); diğer filtreler denenmedi |
| DD4 | Silme | Yalnız test raporu; yoksa atlandı | atlandı |

### 3.7 Deep Dive prompts: list, update

| # | Test | Beklenen | Sonuç |
| --- | --- | --- | --- |
| PR1 | Liste | Tek satır (`promptKey` `synthesis`), `revision`, `updatedBy` (kullanıcı adı) | ✅ tek satır (`synthesis`), revision, updatedBy |
| PR2 | Edit | `systemPromptEn` / `systemPromptTr` çok satırlı; `promptKey`, `revision`, `updatedBy` düzenlenemez | ✅ formda yalnız `systemPromptEn` / `systemPromptTr` (çok satırlı); `promptKey`, `revision`, `updatedBy` yok |
| PR3 | 499 karakterlik prompt | İstemci kuralı (minLength 500) ya da BE 400 | ✅ API 400 "systemPromptEn: String should have at least 500 characters" (E9) |
| PR4 | Geçerli değişiklik kaydet | `revision` +1, `updatedBy` giriş yapan admin | ✅ revision 1 → 2, `updatedBy` admin (`{ id, name, email }`). Not: değer değişmeden kaydetmek de revision'ı artırıyor (form bütün alanları gönderiyor, hook değişiklik sayıyor); istenirse hook aynı değeri değişiklik saymaz |
| PR5 | Varsayılanları göster (K aksiyonu, `GET /api/v1/admin-crud/deep-dive-prompts/defaults`) | Kod varsayılanları | `GET …/defaults` BE'de duruyor; FE'de ayrı düğme yok (sıfırlama onay penceresi yeterli görüldü) |
| PR6 | Varsayılana sıfırla (K aksiyonu, `POST /api/v1/admin-crud/deep-dive-prompts/reset`) | Prompt'lar koddaki değere döner, `revision` artar. **Test öncesi mevcut prompt'u kaydet, sonunda geri yaz.** | ✅ UI "Varsayılana sıfırla" → toast "Prompt'lar kod varsayılanına sıfırlandı."; mevcut metin zaten varsayılanla aynıydı; yedekten geri yazıldı (metin aynı, revision 2 → 4) (E13) |

### 3.8 Providers: list, update

| # | Test | Beklenen | Sonuç |
| --- | --- | --- | --- |
| PV1 | Liste | 10 sağlayıcı; `name`, `enabled`, `plan`, `providerType` | ✅ 10 sağlayıcı, yalnız düzenle |
| PV2 | Edit | `name` yok / kilitli; `rateLimit`, `retry`, `timeout` iç içe formlar; `features` opak obje (JSON) | ✅ `name` formda yok; `rateLimit` / `retry` / `timeout` iç içe; `backoffSeconds` dizisi JSON; `features` JSON |
| PV3 | `retry.backoffSeconds` boş dizi | 422 (domain doğrulaması) | ✅ API 422 "…backoffSeconds en az bir değer içermeli." (E9) |
| PV4 | `notes` değiştir → geri al | 200, iki kez | ✅ (değiştirmeden kaydet: `isyatirim` → `POST …/update/:id` 200, veri aynı kaldı) |
| PV5 | Sağlık aksiyonu (K, eski uç `POST /api/v1/admin/providers/{name}/health`) | Satır aksiyonu `name` ile çağırır, sonuç toast / pencere | ✅ BE `POST …/providers/:id/actions/health` + FE satır aksiyonu; UI: isyatirim → toast "registry ✓, DB yapılandırması ✓" (E13) |

### 3.9 Markets: list, update

| # | Test | Beklenen | Sonuç |
| --- | --- | --- | --- |
| MK1 | Liste | 6 market; `marketCode`, `currency`, `timezone`, `enabled` | ✅ 6 market |
| MK2 | Edit | `marketCode` kilitli; `universe`, `filters`, `technical`, `features`, `ranking`, `report`, `cache` iç içe formlar | ✅ `marketCode` formda yok; iç içe formlar. İkinci seviye objeler (`universe.symbolFilters`, `technical.earlyGate`, `ranking.weights`, `cache.liveQuote` …) config'te yoktu → kaydetmek onları siliyordu (AF13). Düzeltmeden sonra JSON alanı olarak geliyor |
| MK3 | `providers` alt objesi | Her `*ProviderId` sağlayıcı seçimi (providers autocomplete, ad gösterir, id gönderir) — config'te alt alan ilişkisi değilse bulgu | ✅ (AF14 sonrası) sağlayıcı seçimleri ad gösteriyor (`yfinance`, `gemini_flash` …), id gönderiyor |
| MK4 | `currency` `"usd1"` | İstemci deseni ya da BE 400 | ✅ API 400: `usd1` en fazla 3 karakter, `us1` desen `^[A-Za-z]{3}$` (E9) |
| MK5 | Var olmayan provider id | 422 | ✅ API 422 "Sağlayıcı bulunamadı" (`providers.quotePrimaryProviderId`); DE kaydı değişmedi (E9) |
| MK6 | `notes` değiştir → geri al | 200; market resolver yenilenir (analiz ekranı yeni ayarı görür) | ✅ AF13 düzeltmesinden sonra: DE değiştirmeden kaydet → önce / sonra farkı yalnız `updatedAt` (E7) |

### 3.10 Symbols: list, getOne, create, delete

| # | Test | Beklenen | Sonuç |
| --- | --- | --- | --- |
| SY1 | Liste | 5.333 sembol, sayfalı; `marketId` market kodu (populate); varsayılan sıra market → tür → `sortOrder` | ✅ 5.333 sembol, market kodu (populate), detay + sil; varsayılan sıra market / tür / sıra |
| SY2 | Filtre | market autocomplete, `assetType` enum, `ticker` / `name` içerir, `enabled` | ✅ UI: market filtresi seçim kutusu, JP → 230 kayıt (E11) |
| SY3 | Create TR hisse `zzzz` | `ZZZZ.IS` olarak kaydolur, `sortOrder` liste sonu | ✅ UI: TR + stock + `zzzz` → `ZZZZ.IS`; AF16 sonrası create formunda sıra yok, liste sonuna (198) eklendi |
| SY4 | Aynı ticker tekrar | 409 | ✅ UI toast "AAPL bu listede zaten var." (409), form açık kaldı (E11) |
| SY5 | Create ticker `$` | 422 | ✅ UI toast "Geçersiz ticker." (422) (E11) |
| SY6 | Detay ve sil (test sembolü) | 200; liste ve bellek görüntüsü güncellenir | ✅ UI: TUR detay drawer'ı (US, etf, sıra 900) → drawer'dan sil → "Kayıt silindi." (E11) |
| SY7 | Lookup / toplu ekleme aksiyonları (K; eski uçlar `/api/v1/admin/<market>stock/stocks/{ticker}/lookup`, `POST …/stocks`) | Yahoo doğrulaması; yalnız test ticker'ı, sonunda sil | ✅ BE `POST …/symbols/actions/bulk-add` (`{ ids, marketId, assetType, tickers }`; hisse / ETF Yahoo, fon TEFAS; en fazla 10; listede olan Yahoo'ya sorulmaz; hepsi listede 409, hiçbiri doğrulanmazsa 404; kayıt CRUD create'iyle, `reload_symbol_list` hook'ta; kullanıcı kararıyla eski uçların yan etkileri de var: Varlık360 webhook'u, ilk fiyat tarihçesi (hisse / ETF 1 yıl, fon 1 gün), hisselerde temel veri, ETF'te admin pin'i, admin job log'u `symbols_bulk_add`; US hissede yasaklı liste 422; test) + FE toolbar "Toplu ekle". UI: US + etf + `TUR, ARKK, ZZZQQ` → "1 sembol eklendi: TUR; zaten vardı: ARKK; doğrulanamadı: ZZZQQ."; TUR liste sonuna (900) eklendi ve arayüzden silindi (E13) |

### 3.11 Users: list, getOne, create, update

| # | Test | Beklenen | Sonuç |
| --- | --- | --- | --- |
| US1 | Liste | `passwordHash` hiçbir yerde yok; `role`, `status`, `emailVerified` filtreleri | ✅ 11 kullanıcı; `passwordHash` tabloda / filtrede yok; role / status / emailVerified filtreleri |
| US2 | Create: `gentest+1@example.com`, şifre, `emailVerified: true` | Şifre alanı `writeOnly` (gizli giriş); kullanıcı oluşur, varsayılan plan atanır, `status` `active` | ✅ API (2026-10-25, kullanıcı onayıyla): `gentest+1@example.com` (`passwordHash` alanı writeOnly; yanıtta yok), `status` active, varsayılan plan aboneliği açıldı (`activeSubscriptionId` dolu). Kullanıcı yerelde bırakıldı (askıda), sonra silinecek |
| US3 | Create şifresiz / zayıf şifre | 400 / 422 | ✅ API: şifresiz 422 "Şifre zorunlu.", 3 karakter 400 (minLength 8) |
| US4 | Aynı e-posta büyük harfle | 409 | ✅ API: `GENTEST+1@EXAMPLE.COM` → 409 "Bu e-posta zaten kayıtlı." |
| US5 | Edit | `email` kilitli; şifre boş bırakılırsa gönderilmez; yeni şifre yazılınca güncellenir | ✅ edit formu: Password boş başlıyor (`writeOnly`), `email` yok, readonly alanlar yok; kaydedilmedi |
| US6 | Kendini askıya al / kendi admin rolünü kaldır | BE hatası toast | ✅ API: kendini askıya alma 422 "Kendi hesabınızı askıya alamazsınız.", kendi admin rolünü kaldırma 422 |
| US7 | `googleId`'yi temizle | `null` gider | ✅ API: `googleId: null` 200 → `null`. Not: elle `googleId` yazmak 422 (iş kuralı; Google girişinden gelir) |
| US8 | Test kullanıcısını kapat | Silme yok: `status` `suspended` | ✅ API: `status: suspended` 200; şifre güncelleme (`passwordHash`) 200 |

### 3.12 User subscriptions: list, getOne

| # | Test | Beklenen | Sonuç |
| --- | --- | --- | --- |
| UB1 | Liste | `userId` e-posta / ad, `planId` plan adı; `status` enum filtresi; `history` kolonu yok (detailOnly) | ✅ 4 abonelik; kullanıcı e-postası, plan adı (populate); `history` kolonu yok; User filtresi users autocomplete'iyle arıyor ("gun" → gunday…, AF7 çözüldü) |
| UB2 | Detay | `history[]` olayları | ✅ detayda `history[]` (1 olay) |
| UB3 | Plan değiştir aksiyonu (K, `POST /api/v1/admin-crud/user-subscriptions/change-plan`, gövde `{ userId, planId, note? }`) | Yalnız US2'deki test kullanıcısında; geçmişe olay eklenir, kullanıcının aktif aboneliği değişir | ✅ BE `/change-plan` → `POST …/user-subscriptions/:id/actions/change-plan` (`{ ids?, planId, note? }`, test) + FE satır aksiyonu. UI: form (plan autocomplete Enterprise / Free / Pro, not, onay başlığı), boş gönderim "Zorunlu alan", istek gitmedi; vazgeçildi. Başarılı değişim gerçek abonelikte denenmedi (geçmişe kalıcı olay yazar; test kullanıcısı E10'a bağlı), API testinde ✅ |
| UB4 | Olmayan plan | 400 | ✅ API: olmayan plan → 400 "İlişkili kayıt bulunamadı: planId", abonelik değişmedi (E13) |

## 4. İstemci veri katmanı (web; normal API açılan modeller için)

Bir modelde `api.normalOperations` açılıp `apps/web` için üretim yapılırsa her modül için:

| # | Test | Beklenen | Sonuç |
| --- | --- | --- | --- |
| W1 | `services/<x>.service.generated.ts` | Yalnız açık işlemlerin fonksiyonları (`getAll`, `getById`, `create`, `update`, `delete<E>`); doğru yol ve metot; `get-all` gövdesi `{ filters, page, limit, sortBy, sortOrder }` | |
| W2 | Tipler | `I<E>`: `id: string`, tarih `string`, gizli alan yok, populate edilen ilişki `{ id; … }`; input'ta ilişki id | |
| W3 | Thunk'lar (`create<E>Thunks`) | `fetch<E>List` / `fetch<E>ById` / `create<E>` / `update<E>` / `delete<E>`: pending → fulfilled / rejected; `unwrap` hata fırlatır | |
| W4 | Slice | Liste set; `append: true` ekler ve `skipLoading` ile gider; update sonrası `merge<E>Saved` populate edilmiş ilişkiyi korur (id değişmediyse); delete kaydı `action.meta.arg`'dan siler | |
| W5 | Birim testleri | Vitest ile reducer testleri (thunk action'ları elle dispatch) + servis testleri (axios mock'u: yol, gövde, bayrak) | |
| W6 | Ekranda | Thunk'ı kullanan sayfa veri gösterir; `try/catch` yok | |

## 5. Önerilen otomatik testler (Cursor yazar)

- `apps/admin/src/modules/__tests__/configs.test.ts`: her `<m>.generated.config.ts` için endpoint, `operations`, alan adları kümesi Bölüm 3'teki listeyle aynı; `writeOnly` / `readonly` / `hideOn*` bayrakları.
- `apps/admin/e2e/` (Playwright, isteğe bağlı): her kaynak için O1, O4, O8 ve izinli yazma testleri, test kayıtlarıyla; çalıştırmadan önce API ve admin dev sunucusu açık.
- Yazılan testler G dosyalarını değil davranışı dener; Generator yeniden üretince kırılmamalı.

## 5.1 Ertelenen kontroller (en sonda, Bölüm 6'dan önce)

Gruplar sırasında yapılmayıp sona bırakılanlar (kullanıcı kararı, 2026-10-25). Her grup yenilerini buraya ekler.

| # | Kontrol | Ekran | Beklenen | Sonuç |
| --- | --- | --- | --- | --- |
| E1 | CSV export | Report watchlist (ve export seçilen her ekran) | **PY12'ye taşındı** (Generator `docs/plans/backend-python-fastapi.md` §5): genel `POST {endpoint}/export` + admin-base kolon seçme penceresi; elle yazılmış watchlist / evren export'ları o zaman silinir. Burada aksiyon yazılmayacak | ➖ PY12 |
| E2 | Rapora göre sil aksiyonu (AF12) | Report watchlist | Uzantı dosyasına aksiyon; eski uç `DELETE /api/v1/admin/daily-report-watchlist/by-report/{report_id}`; yalnız test verisiyle | ➖ E13'e taşındı |
| E3 | Yeni plan ekle ve sil | Plans | `TEST_PLAN` iç içe formlarla oluşur (P2), `code` tekrarı 409 (P3), uzunluk kuralı (P4), sonra silinir (P7); `description` boşaltma `null` (P5) | ✅ P2–P5, P7 (P6 gerekçeli atlandı); `TEST_PLAN` silindi |
| E4 | Sıralama ve sayfalama | Grup 1 + 2'nin 6 ekranı | Kolon başlığı → `sortBy` / `sortOrder`; sayfa değişimi `page`; dizi / obje / computed kolon sıralanamaz (O2, O3) | ✅ UI (IP blacklist): kolon başlığı → `sortBy: hitCount`, `asc` → `desc`; sonraki sayfa `page: 2`, "26–50 / 337". Computed kolonlar config'te `sortable: false` (watchlist `livePrice` …), obje / dizi admin-base kuralıyla kapalı. Diğer 5 ekranda tek tek tıklanmadı (aynı bileşen) |
| E5 | Normal kullanıcıyla 403 | Bütün üretilen ekranlar | Normal kullanıcı token'ıyla sayfa ForbiddenPage / 403 (O14) | ⏭ atlandı: normal kullanıcı token'ı yok; API'de 403 her modülün `test_auth_and_envelope` testinde |
| E6 | UI'da hata toast'ları | IP blacklist | Aynı IP 409 ve geçersiz IP 422 arayüzde toast olarak (API'de ✅) | ✅ UI: 409 "Bu değer zaten kullanılıyor: ip", 422 "Geçersiz IP adresi."; her istekte tek toast, form açık; kayıt oluşmadı |
| E7 | AF13 düzeltmesinin arayüzde denenmesi | Markets | DE'yi değiştirmeden kaydet → önce / sonra farkı yalnız `updatedAt`; bir JSON alt alanını (ör. `technical.rsi`) değiştir → yalnız o değişir; ardından geri al | ✅ ilk kısım (fark yok); UI'da `technical.rsi` JSON'unda `outBandScore` 0.4 → 0.45 → önce / sonra farkı yalnız o alan + `updatedAt`; API'den geri alındı (fark yok). Not AF18 |
| E8 | Deep Dive prompts arayüz testleri | Deep Dive prompts | PR1–PR4 (tek satır, çok satırlı prompt'lar, `promptKey` / `revision` / `updatedBy` kilitli, 499 karakter kuralı, kaydedince `revision` +1) | ✅ PR1, PR2, PR4; PR3 (499 karakter) E9'da |
| E10 | Users yazma testleri | Users | Test kullanıcısı `gentest+1@example.com` (US2–US4, US6–US8): şifre kuralı, büyük harfli e-posta 409, kendini askıya alma / son admin, `googleId` temizleme; kullanıcı silinemez → sonunda `suspended` ve aboneliği not edilir. Kalıcı test verisi bırakacağı için kullanıcı onayıyla | ✅ API'de (kullanıcı onayı: test kullanıcısı yerelde kalır): US2–US4, US6–US8. Arayüz formuyla denenmedi (US5 form kontrolü daha önce ✅). `gentest+1@example.com` askıda, yerelde duruyor |
| E11 | Symbols kalanlar | Symbols | SY2 market filtresi (AF17 sonrası), SY4 aynı ticker 409, SY5 `$` → 422, SY6 detay drawer'ı ve arayüzden silme | ✅ SY2, SY4, SY5, SY6 (UI) |
| E12 | Symbols sıra kuralı | Symbols | `sortOrder` create formunda yok, eklenen sembol liste sonuna | ✅ (AF16) |
| E13 | Özel aksiyonların arayüz testi | Report watchlist, Providers, Deep Dive prompts | "Rapora göre sil" (test raporu id'siyle ya da olmayan id → 0 kayıt), "Sağlık kontrolü" toast'u, "Varsayılana sıfırla" (önce mevcut prompt kaydedilir, sonra geri yazılır); Symbols "Toplu ekle" (test ticker'ı, sonra sil), User subscriptions "Plan değiştir" (yalnız test aboneliğinde; yoksa olmayan plan → 400) | ✅ beşi de arayüzde: sağlık kontrolü, rapora göre sil (olmayan id → 0), toplu ekle (TUR eklendi / silindi), varsayılana sıfırla (geri yazıldı), plan değiştir (form + doğrulama; başarılı değişim yalnız API testinde) |
| E9 | Doğrulama hataları | Providers, Markets, Deep Dive prompts | PR3 (499 karakterlik prompt), PV3 (`backoffSeconds` boş → 422), MK4 (`currency` deseni), MK5 (olmayan provider → 422) | ✅ API: PR3 400, PV3 422, MK4 400, MK5 422; hiçbir kayıt değişmedi. UI'da form üzerinden denenmedi |

## 6. Son adım: tek axios nesnesi (12 ekran bittikten sonra)

Kullanıcı kararı (2026-10-25): projede tek bir axios nesnesi olacak (`services/api.ts` `api`); admin-base ona köprüsüz bağlanır. Bugünkü interceptor başarıda axios yanıtını döndüğü için grup 1'de geçici köprü kullanıldı (AF4, AF5). Bu adım en sonda, bütün gruplar bittikten sonra yapılır.

| # | İş | Beklenen | Sonuç |
| --- | --- | --- | --- |
| X1 | Interceptor sözleşme §7'ye uyar | Başarıda `LocalResponse` ile resolve (`res.data` değil zarfın kendisi), hatada `LocalResponse` ile reject; blob istekleri (`responseType: 'blob'`) axios yanıtını dönmeye devam eder | ✅ (2026-10-25) `services/api.ts` response interceptor başarıda `parseLocalResponse` zarfını döner (eskiden `res.data = body; return res`), hatada zarfla reject (değişmedi), blob istekleri axios yanıtını döner. 401 yenileme sonrası tekrar istek de zarf döner |
| X2 | Kalan elle yazılmış sayfalar / servisler yeni dönüş tipine | `apiRequest`, `apiLocalRequest`, `apiExportRequest`, `services/*.services.ts`, thunk'lar `res.data` yerine zarfı okur; davranış aynı (sayfalarda `try/catch` / `.then` yok kuralı korunur) | ✅ Doğrudan `api.request` kullanan yalnız `api.ts`'teki yardımcılardı: `requestEnvelope<T>` eklendi; `apiRequest` / `apiLocalRequest` onu kullanır, `apiExportRequest` (blob) aynı. `services/*.services.ts`, thunk'lar ve sayfalar bu yardımcılardan geçtiği için değişmedi; `rawApi` (refresh) interceptor'sız, etkilenmedi |
| X3 | Köprü kalkar | `services/adminHttp.ts` silinir, `createAtaRestProvider({ http: api })` | ✅ `services/adminHttp.ts` silindi; `main.tsx` `createAtaRestProvider({ http: api })` |
| X4 | Tek axios kopyası | admin-base npm sürümünde (AF6) axios peer; `tsconfig.app.json` `paths.axios` alias'ı ve gerekirse `vite.config.ts` `dedupe`'taki axios kaldırılır; `npm ls axios` tek kopya | ⏳ npm yayınına bağlı (AF6): `paths.axios` kaldırılınca `file:` bağlantıda iki axios'un tipleri çakışıyor (`AxiosRequestHeaders` …), alias geri kondu. Paket axios'u peer (`^1.0.0`) tanımlıyor; npm sürümünden kurulunca tek kopya (host 1.15.2) kalır, o zaman alias ve `dedupe`'taki axios kaldırılır. Bugün `npm ls axios`: host 1.15.2 + paket (dev) 1.20.0 |
| X5 | Paket tipi | `AtaHttp` genişletmesi kalsın mı (Varlik360 / SharedFrame zaten `AxiosInstance` veriyor) yoksa `AxiosInstance`'a geri mi dönülsün: karar burada yazılır | ✅ Kullanıcı kararı (2026-10-25): `AtaHttp` genişletmesi kalır (`request`'i olan her şey; `AxiosInstance` da uyar). StockExchange artık köprüsüz `api` verir |
| X6 | Kontrol | `tsc -b` 0, build, lint tabanı; bütün admin sayfaları (üretilen 12 + elle yazılmış: dashboard, jobs, logs, metrics, screen, market pulse, OHLC, fundamentals, varlık sayfaları) tarayıcıda açılır, liste / yazma / export / login / 401 refresh çalışır | ✅ (2026-10-25) `tsc -b` 0, lint 36 (taban), build ✅. Tarayıcı: elle yazılmış sayfalar (dashboard, usassets, trfund, market pulse, jobs) istekleri 200 ve veri gösteriyor (jobs tablosu dolu); üretilen ekranlar köprüsüz (`http: api`) liste (providers 10, watchlist 2.733) ve aksiyon toast'u (sağlık kontrolü) çalışıyor; symbols toplu ekleme API'den gerçek Yahoo + fiyat çekimiyle 200. Denenmedi: CSV indirme (dosya indirme ayrı onay ister), giriş ekranı ve 401 yenileme (token elle konduğu için yenileme çerezi yok; normal girişle kullanıcı dener) |

## Bulgular

| # | Bölüm / test | Dosya | Bulgu | G mi K mı | Karar / düzeltme | Durum |
| --- | --- | --- | --- | --- | --- | --- |
| AF1 | S5 | Generator `src/main/utils/backendAppFile.ts` | Python host'unda admin mount yolu okunmuyordu; endpoint `/api/<m>/admin` tahminine düşüyordu (doğrusu `/api/v1/admin-crud/<m>`) | Generator | `findPythonMountPath`: `modules/*/admin_router_generated.py` prefix'i + `core/config.py` `API_PREFIX` | ✅ düzeltildi |
| AF2 | S6 / AL2 | Generator `adminResourceConfig.ts` | Alt alanı olmayan (opak) obje `kind: 'object'`, `fields: []` üretiyordu: formda boş alt form | Generator | Opak obje → `kind: 'json'` | ✅ düzeltildi |
| AF3 | Üretim | Generator `scripts/python-host.mjs` | Python host'u için admin config'i Electron'suz üretmenin yolu yoktu | Generator | `admin-config <dir> <feDir> <Entity,…>` komutu (IPC `generateFrontend`) | ✅ eklendi |
| AF4 | Ön koşul | admin-base `restProvider.ts`, host `services/adminHttp.ts` | Paket `http` için tam `AxiosInstance` istiyordu; StockExchange interceptor'ı başarıda zarf yerine axios yanıtını dönüyor (sözleşme §7 madde 1'e uymuyor) | paket + K | Geçici: paket `http: AtaHttp` (`request`'i olan her şey), host `adminHttp.request` zarfa iner. **Kalıcı çözüm Bölüm 6 (son adım):** projede tek axios nesnesi, interceptor zarfı döner | ✅ Bölüm 6 X1 / X3: interceptor zarfı döner, köprü silindi |
| AF5 | Ön koşul | host `tsconfig.app.json` | `file:` bağımlılıkta paketin ve host'un axios tipleri çakışıyor | K | Geçici: `paths.axios` → host'un `node_modules/axios`. admin-base npm sürümüne dönünce (AF6) axios peer olarak tek kopya kalır; alias Bölüm 6'da kaldırılır | ⏳ geçici, Bölüm 6 |
| AF6 | Ön koşul | host `package.json` / `package-lock.json` | admin-base 0.1.8 npm'de yok (son 0.1.7); host şimdilik `file:` ile bağlı. **Docker build'i (`apps/admin` imajı) bu yolla çalışmaz** | paket | 0.1.8 yayınlanınca (`npm run release`, tarayıcıda npm girişi) host `^0.1.8`'e döner ve lock yeniden üretilir; ondan önce deploy yok | ⚠️ açık (kullanıcı) |
| AF7 | AL3 | — | Audit log `actorUserId` filtresi `users` resource'unu autocomplete için ister; users admin config'i grup 4'te | — | Grup 4'te users resource'u geldi; autocomplete çalışıyor (UB1) | ✅ |
| AF9 | O8 | Generator `AdminConfigGenerator.ts` | Admin API'de getOne açık olsa da config detay görünümünü açmıyordu (paket `extensions.detail` ister) | Generator | Uzantı dosyası (ilk oluşturulurken) getOne ya da `detailOnly` alanı varsa `detail: true` yazar; host'taki admin-base 0.1.6'dan eskiyse yazmaz (Varlik360 0.1.5). Grup 1 + 2'nin dokunulmamış uzantı dosyaları yeniden üretildi | ✅ düzeltildi |
| AF10 | P1 | host `services/api.ts` | İptal edilen istekte (sayfa değişimi, sorgu yenilemesi) "canceled" hata toast'u (sözleşme §7 madde 5) | K | Interceptor `axios.isCancel(err)` → toast yok | ✅ düzeltildi |
| AF11 | Giriş | Generator `.claude/launch.json` | Admin `127.0.0.1:8766`'ya gidiyordu, sayfa `localhost:5174`: farklı site → yenileme çerezi gitmez, sayfa yenilenince oturum silinir | dev ayarı | `VITE_API_BASE_URL=http://localhost:8766` | ✅ |
| AF12 | WL4, PV5, PR5–6, SY7, UB3 | K `<m>.generated.ts` + K BE router | Eski sayfalardaki özel işlemler yeni ekranlarda yoktu | K | 2026-10-25: rapora göre sil, sağlık kontrolü, prompt sıfırlama sözleşme §6 aksiyonu olarak BE'de (K `admin_router.py` `actions_router`, `main.py`'de bağlı, testli) ve FE'de (uzantı dosyası `actions`) yazıldı; arayüz testi E13. Aynı gün: sembol toplu ekleme (SY7, toolbar `bulk-add`) ve plan değiştir (UB3, satır `change-plan`; eski `/change-plan` yolu taşındı) aynı kalıpta. Tek ticker lookup ayrı aksiyon olmadı: toplu ekleme doğrulamayı yapıyor. CSV export PY12. Tam takım `logs/pytest/2026-10-25-af12-actions-full.log`: 1612 passed, 35 failed, 7 error; FAILED / ERROR listesi taban (`2026-10-25-fe-actions-full.log`) ile aynı | ✅ 5 / 5 (arayüz E13) |
| AF13 | MK2 / MK6 | Generator `adminResourceConfig.ts`, admin-base `schema/write.ts`, `ui/form/values.ts` | **Veri kaybı:** ikinci seviye obje / map alt alanları config'e hiç yazılmıyordu; admin-base yazarken config dışı alt anahtarları düşürüyordu. Alt obje BE'de bütün olarak yazıldığı için DE marketini değiştirmeden kaydetmek `universe.symbolFilters`, `technical.earlyGate` / `rsi`, `ranking.weights` / `finalWeights`, `cache.liveQuote` / `marketNews`'u sildi. Yerel DE kaydı önceki okumadan geri yüklendi (fark yalnız `earlyGate.minAvgVolume20`: `null` ↔ yok) | Generator + paket | Generator: ikinci seviye obje / map → `kind: 'json'` alt alan. admin-base: alt objede config dışı anahtarlar okunan değerle aynen geri gider (üst seviye strict kalır); test eklendi (42 / 42). Arayüzde yeniden deneme E7 | ✅ düzeltildi, arayüzde doğrulandı (E7) |
| AF14 | MK3 | admin-base `RelationAutocomplete`, Generator `normalizedModel.ts` / `adminResourceConfig.ts` | Alt objedeki ilişkiler populate edilmediği için seçimde ham id görünüyordu; alt alan ilişkisinde `display` da yoktu | paket + Generator | Paket: yalnız id gelen tekil değerin satırı hedefin `get-all`'undan (`filters.id`) okunur (`useRelationRow`). Generator: alt alan `reference.display` (manifest) → config `display`. StockExchange Markets `providers.*ProviderId` → `display: 'name'` | ✅ düzeltildi |
| AF15 | Konsol | host `vite.config.ts` | "MUI X: locale not found": `file:` bağlantıda paket ayrı dayjs kopyası kullanıyordu | K | `dedupe`'a `dayjs`, `@mui/x-date-pickers`, `@mui/x-data-grid` | ✅ |
| AF16 | SY3 | StockExchange manifest (`symbols.sortOrder` varsayılanı 0) | Config `default: 0` yazıyor; create formu 0 gönderiyordu, hook'un "verilmezse liste sonu" kuralı çalışmıyordu (`ZZZZ.IS` sıra 0 oldu) | K | Kullanıcı kararı: model değişmez; K `symbols.generated.ts` şemanın kopyasında `sortOrder`'a `hideOnCreate` verir. Create formunda alan yok; aynı gövdeyle eklenen `ZZZZ.IS` sıra 198 (son TCKRC.IS 197) aldı, sonra silindi | ✅ düzeltildi |
| AF17 | SY2 | Generator `adminResourceConfig.ts` | İlişki alanının filtresi modeldeki filtre tipinden (`regex`) yazılıyordu; BE ilişkiyi id ile süzer → metin kutusu çalışmaz | Generator | Hedefi olan ilişkide filtre her zaman `relation` (BE kuralıyla aynı) | ✅ düzeltildi |
| AF18 | E7 | StockExchange markets | Yanıtta DB'de olmayan alt alan `null` geliyor (`technical.dayTrading: null`); aynı objeyi API'den geri göndermek domain doğrulamasında 422 ("valid dictionary … TechnicalDayTradingRevision"). Arayüz kaydı etkilenmiyor (admin-base JSON alt alanını değiştirmeden gönderdiğinde sorun yok; E7 UI kaydı 200) | K | Not: API ile elle yazan araçlar `null` alt alanı çıkarmalı; istenirse hook `null` alt objeyi "yok" sayar | not |
| AF19 | SY6 / SY7 | StockExchange symbols hooks | CRUD silme (`DELETE …/symbols/:id`) yalnız sembol satırını siliyordu; eski silme uçları fiyat barlarını (`ohlcv_data`), canlı fiyat / temel veri önbelleğini, ETF pin'ini de siliyor ve Varlık360'a `isShow: false` gönderiyordu. Toplu ekleme testinde TUR'un 1 yıllık fiyatı çekildi (275 bar), sembol silindi, barlar kaldı. Pin dosyası `data/raw/us_etf_admin_pins.csv` testle oluştu, silindi | K | Kullanıcı kararı (2026-10-25): `symbols/hooks.py` `after_delete` → `_cleanup_deleted`: hisse / ETF son `DETAIL_METRICS_HISTORY_DAYS` (400) gün barları, canlı fiyat önbelleği; hissede temel veri önbelleği + `invalidate_stock_list_cache`; ETF'te pin (varsa); fonda `trfund_prices`; webhook `isShow: false`; job log `symbols_delete`. Hata silmeyi geri almaz, loglanır. Test `test_delete_cleanup`. TUR'un 275 barı yedeklenip silindi (`StockExchange/logs/backups/2026-10-25-ohlcv_data-TUR-US.json`); eylül tarihli metrik önbelleği kaydı (`asset_detail_metrics_cache`) önceden vardı, dokunulmadı | ✅ düzeltildi |
| AF8 | Genel | manifest | Etiketler entity adından (`Ip Blacklist`, `Audit Logs`); Plans'ta `ui.label` var (`Abonelik planları`). Sidebar el yazımı ve i18n'li olduğu için menüde sorun yok; sayfa başlığı İngilizce | manifest | İstenirse modellere `ui.label` (Türkçe) yazılıp yeniden üretilir | not |

## Temizlik

- [x] Test kayıtları silindi / geri alındı (2026-10-25): `TEST_PLAN` silindi, `203.0.113.7` silindi (IP6), `ZZZZ.IS` ve `TUR` silindi, DE `technical` ve Deep Dive prompt'ları yedekten geri yazıldı (fark yok). `gentest+1@example.com` kullanıcı kararıyla yerelde askıda bırakıldı (sonra silinecek). TUR'un fiyat barları yedeklenip silindi (AF19).
- [x] `tsc` / lint / build son durum yazıldı (2026-10-25: tsc 0, lint 36 taban, build ✅; pytest tam takım `logs/pytest/2026-10-25-bulk-add-side-effects-full.log`).
