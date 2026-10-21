# Plan: .NET + EF Core backend

Durum: **D0–D6 tamam (2026-10-19).** Nasıl çalıştığı: [backend/dotnet-efcore.md](../backend/dotnet-efcore.md). Doğrulama: [verification.md](../verification.md#net-ef-core). SharedFrame BE + admin Generator ile kuruldu (§5, 2026-10-19). Sıradaki: Generator arayüz denemesi, SharedFrame'in kalan özel akışları (§5), açık işler (§4).

## 1. Hedef

- Aynı girdi (NormalizedModel v2 + manifest v3), aynı HTTP davranışı ([api-contract.md](../api-contract.md)). `@atakanimo/ata-admin-base` ve mobil arkadaki stack'i bilmez.
- .NET 10, Minimal API, EF Core 10 + PostgreSQL, Clean Architecture, uuid v7.
- Kapsam yeni projeler; Varlik360 Express + Mongo'da kalır. Express üreticisiyle kod paylaşılmaz.

## 2. Kararlar

| # | Konu | Karar |
| --- | --- | --- |
| 1 | .NET sürümü | .NET 10 LTS |
| 2 | Proje yapısı | Clean Architecture, 4 proje, her katmanda modül klasörü |
| 3 | API stili | Minimal API |
| 4 | Doğrulama | FluentValidation |
| 5 | Model kaynağı | Dar TS parser (Generator'ın entity şekli, işaret yorumları) + manifest |
| 6 | `reference[]` | Join tablosu |
| 7 | `object` / `object[]` | EF 10 complex type `ToJson()` |
| 8 | Kapsam | Yeni projeler; Varlik360 taşınmaz |
| 9 | Uygulama katmanı | Servis sınıfı (CQRS / MediatR yok) |
| 10 | Servis yapısı | Tek generic `ICrudService<…>` + `CrudServiceBase<…>` (asset); modül başına `partial interface I<E>Service` (G) + `.Custom.cs` (K) |
| 11 | Create / update cevabı | Express'le aynı: ilişki id; populate yalnızca list / getOne (admin-base cevabı kullanmıyor, sorguları yeniliyor) |
| 12 | Opsiyonel alan | .NET `null` yazar, Express yazmaz; ikisi de "değer yok" (sözleşme §4) |
| 13 | Auth varsayılanı | `api.requiresAuth` yoksa normal uçlar auth ister (Express gibi); anonim yalnızca `false` ile |
| 14 | Klasörler | Stack başına: `generators/`, `templates/backend-*`, `generator-assets/` altında `express-mongoose` / `dotnet-efcore`; admin config ortak |
| 15 | Çözüm dosyası | `.slnx` (.NET 10 varsayılanı); tespit `.sln`'i de kabul eder |
| 16 | Stack kaydı | Manifest `workspace.backendStack` (`'nodejs-mongoose' \| 'dotnet-ef'`) |

## 3. Aşamalar

| Aşama | İş | Sonuç |
| --- | --- | --- |
| D0 ✅ | Elle yazılmış örnek host (SharedFrame, EventTypes) | Smoke 46 / 46 |
| D1 ✅ | Asset'ler + iskelet + bootstrap | Boş host `dotnet build` 0 uyarı |
| D2 ✅ | Basit alanlar, ortak CRUD tabanı | Üretilmiş EventTypes D0 smoke'unu geçer |
| D3 ✅ | `reference` / `reference[]` (populate), `decimal`, `object`, `map`, `json` | Golden set (12 model) derlenir, migration uygulanır |
| D4 ✅ | Ownership, `hidden`, `adminOnly`, `normalOperations` süzmesi | Express ile eşlik: 34 PASS, 5 bilinen fark |
| D5 ✅ | Parser, tespit, manifest `backendStack`, IPC, arayüz | Uygulama akışı betikte uçtan uca; Electron arayüzü elle denenmedi |
| D6 ✅ | Betikler, doküman, kural | `regen-dotnet.mjs`, `dotnet-e2e.mjs`; `docs/backend/dotnet-efcore.md`; `.cursor/rules/backend-dotnet-efcore.mdc` |

Eşlikte bilinen farklar (gerekçeleri `contract-parity.mjs`'te): bozuk id (.NET 404, Express 400), beyaz liste dışı `sortBy` (.NET 400), kullanılan kaydı silmek (.NET 409, Mongo'da FK yok); fixture kayması: `createdAt` filtresi, symbols bileşik unique, `countryLabelKey`.

## 4. Açık işler

- **Arayüz denemesi:** yeni .NET projesi penceresi, model ekleme, generate bildirimi, admin config üretimi (Electron'da elle).
- **Admin FE testi için host:** SharedFrame `apps/admin` admin-base kullanmıyor (eski SharedFrameAdmin, kendi sayfaları). Generator config'ini orada denemek için önce admin-base host'una geçirilmesi gerekir (Varlik360 admin geçişindeki gibi).
- Kısmi update'te nullable alan boşaltılamıyor (`null` = değişmez): `Optional<T>` ya da JSON Merge Patch kararı; Express davranışıyla birlikte.
- 400 mesajları STJ'nin İngilizce metni; alan adı + yerelleştirilmiş metin. Accept-Language (Express `t()` karşılığı) yok.
- `number` her zaman `double`; tamsayı bilgisi modelde yok.
- Obje alt alanında iç içe obje / json / map; kendine m-n ilişki denenmedi; elle yazılmış entity'ye reference FK'sız.
- Golden set fixture'ı Varlik360 kodunun gerisinde (`countryLabelKey`, bileşik unique, `createdAt` filtresi); `DailyPortfolio.portfolioValues` parser'dan hedefsiz `reference[]` geliyor (aslında alt doküman dizisi).
- `regen-varlik360 --p5` iki tespit senaryosunda FAIL (HEAD'de de; .NET'ten bağımsız).
- Asset değişiklikleri var olan host'lara gitmez (create-if-missing). SharedFrame'in `Common` dosyaları D0 sürümünde; geçişte güncel asset'lerle değiştirilmeli (`CrudServiceBase`, `Ref`, `RefJsonConverterFactory`, `JsonbConversion`, filtre aşırı yüklemeleri, 409 eşlemesi, tarih okuma).

## 5. SharedFrame

Örnek host: `~/Projects/SharedFrame` (kök git reposu değil; `apps/web`, `apps/admin` kendi repoları; eski API `legacy/SharedFrameAPI`). Değiştirilen D0 dosyaları `.backup/` altında (gitignore).

**Durum (2026-10-19):**
- BE: 10 modül Generator'ın model editörü fonksiyonlarıyla üretildi (`.generator/manifest.json` kaynak). Elle (K dosyaları / kullanıcı kodu): `Application/Auth` (login, register, me; `IPasswordHasher`, `ITokenIssuer`), `UserHooks` (şifre hash), `Infrastructure/Auth` (Identity PBKDF2 hasher, ilk admin seed'i `Admin__Email` / `Admin__Password`), `Api/Auth/JwtTokenIssuer` (`role=Admin`), `/api/auth/*`, `Application/Storage/IFileStorage` + `Infrastructure/Storage/LocalFileStorage` (S3 yerine yerel disk, `Storage__LocalPath`), `MediaUploadService` + `/api/media-items[/admin]/upload`, `/{id}/file`, `MediaItemAdminHooks` (silinen dosya, sayaç, UploadLog). Migration `SharedFrameDomain`. Elle smoke 20 / 20.
- Admin (`apps/admin`): `@atakanimo/ata-admin-base@^0.1.1`; config'ler Generator'dan (`src/modules/**`), `AtaAdminProvider`, `createAdminRoutes`, sözleşme §7 interceptor, gerçek login (yalnızca admin rolü). Eski kaynak sayfaları `apps/admin/_legacy/` (derlenmez). Tarayıcıda: giriş, menü, ilişkili liste, formla kayıt oluşturma çalışıyor.
- Denetim (2026-10-20): SharedFrame API yalnızca manifest'ten boş klasöre üretildi; Generator dosyaları 114 / 114 birebir aynı, farklar yalnızca bilinçli K özelleştirmeleri (6) ve elle yazılmış auth / depolama (10). Bulunan hata: `mergeModel` enum filtresini `eq`'ya çeviriyordu; .NET'te enum filtresi artık her zaman `IN` (regen-dotnet'e "editor model = merged model" kontrolü eklendi). Test verisi: `scripts/seed-dev.mjs` (test kullanıcısı, etkinlik, fotoğraf). Yerel Homebrew PostgreSQL'de veritabanı kalmadı; SharedFrame yalnızca Docker'da.
- Çalıştırma (2026-10-20'den beri Docker): `docker compose up -d --build` → admin 5173 (nginx), API 5080, Postgres 5433; ayrıntı `SharedFrame/README.md`. Generator `.claude/launch.json` → `sharedframe-admin` artık Docker'daki admin'e bağlanır.

**Test (2026-10-20):** `SharedFrame/scripts/admin-api-smoke.mjs` 10 admin kaynağının hepsinde CRUD + id filtresi + 401 / 403 + strict body + medya yükleme / indirme + ilişki kontrolleri: 92 / 92, tekrar çalıştırılabilir (kendi verisini siler). Tarayıcıda 10 route'un listesi açılıyor, konsol temiz. İlk testler yerel Homebrew PostgreSQL 15'le yapıldı; sonra Docker'a geçildi ve aynı smoke Docker'daki API'ye karşı 92 / 92. İlk tıklama sorunu düzeldi: dar ekranda (< 1200px) menü başlangıçta açık geçici çekmeceydi, ilk tıklama onu kapatıyordu.

**Admin eksikleri kapandı (2026-10-19):** `writeOnly` alan (Generator eşlemesi + admin-base `0.1.2`, npm'de yayında 2026-10-20, SharedFrame ve Varlik360 admin'leri geçti; panelden şifreli kullanıcı oluşturma ve şifresiz düzenleme denendi), model etiketi (`ui.label`; SharedFrame ve Varlik360 manifest'lerinde Türkçe), zaman damgası etiketleri Türkçe, medya yükleme düğmesi + küçük resim (`media-items.generated.ts` uzantısı), `npm run build` düzeldi, `_legacy` silindi.

**Açık:** Dashboard sahte veri; Google girişi, e-posta doğrulama, QR, public yükleme, thumbnail (Hangfire / NetVips), S3; `apps/admin`'de önceden var olan tsc hataları (`vite.config.ts` için `@types/node`, kullanılmayan import'lar) `npm run build`'i kırıyor.

Domain taşıma sırası (bağımlılığa göre):

| Sıra | Modül | Gerektirdiği |
| --- | --- | --- |
| 1 | EventTypes | D0 ✅ (üretilmiş koda geçecek) |
| 2 | Documents | enum ✅ |
| 3 | MembershipPlans | `decimal` ✅ |
| 4 | Templates | `reference` → EventType ✅ |
| 5 | Users | `Role` + auth uçları (custom), `self` ✅, `hidden` ✅ |
| 6 | UserMemberships | `field` ownership ✅, reference → User / Plan |
| 7 | Events | ownership, QR / aksiyonlar (custom) |
| 8 | MediaItems | S3 key, thumb / preview / original; Hangfire + NetVips |
| 9 | UploadLogs | MediaItems'a bağlı, yalnızca admin okur |
| 10 | EventUserActivities | Events + Users |

## 6. Geçmiş (özet)

- D0'dan öğrenilenler artık dokümanda kurala dönüştü: `#nullable enable` (CS8669), `IAppDbContext` partial, regex = küçük harf "içerir", tarih okuma UTC, strict body STJ + `ThrowOnBadRequest`, `…​.fffZ` tarih çıkışı, pipeline hataları zarf, `limit` kırpılır, central package management.
- Ayrıntılı aşama notları git geçmişinde (bu dosyanın önceki sürümü).
