# Ortak auth katmanı (plan)

> Durum: **plan, uygulanmadı** (2026-11-06). Açık karar: refresh token Faz 1'de mi, Faz 2'de mi (öneri: Faz 2).

Üç BE stack'i (Express, .NET, Python) için aynı sözleşmeyle çalışan en temel auth katmanı ve sonra `@atakanimo/ata-admin-base`'e alınacak istemci tarafı. Google / Apple, OTP, e-posta doğrulama, şifremi unuttum, impersonate base'e girmez.

## Bugünkü durum

Doğrulama tarafı (JWT HS256, `sub` / `userId`, `role`, admin yetkisi, `iss` / `aud` isteğe bağlı, `exp` zorunlu) üç iskelette de var ve aynı davranır:

- Express: `src/generator-assets/express-mongoose/_skeleton/src/core/middleware/auth.middleware.ts`, `admin-auth.middleware.ts`
- .NET: `src/generator-assets/dotnet-efcore/Api/Common/AuthSetup.cs`, `Infrastructure/Common/CurrentUser.cs`
- Python: `src/generator-assets/python-fastapi/_skeleton/src/__app__/api/deps.py`

Eksik olan token **üreten** taraf: login, me, logout, şifre değiştirme, kullanıcı modeli, ilk admin. Yeni admin paneli bu uçları bekliyor ([../frontend/admin-host.md](../frontend/admin-host.md)).

Referans hostlar:

| | Varlik360 (Express) | SharedFrame (.NET) | StockExchange (Python) |
| --- | --- | --- | --- |
| Şifre hash'i | bcryptjs, cost 10 | PBKDF2 (Identity) | bcrypt, cost 12 + şifre kuralı |
| Token içeriği | yalnız `{ userId }`, rol yok | `sub`, `email`, `name`; `role` yalnız admin'de | `sub`, `typ`, `role`, `jti`; access 15 dk + refresh 7 gün |
| Admin | `ADMIN_USER_IDS` env listesi | `role` kolonu | `role` kolonu |
| `me` | `POST /me` + cihaz bilgisi | `GET /me` | `GET /me` |
| Login cevabı | `{ user, token, subscription }` | `{ token, user, language }` | `{ user, accessToken, refreshToken, plan }` |
| Oturum iptali | yok | yok | refresh token DB'de, iptal edilebilir |
| Askıya alınmış kullanıcı | yok | yok | her istekte kontrol |
| Rate limit | auth router'ında | genel | login 10/dk/IP |

## Sözleşme

Uçlar `<önek>/auth` altında (Express / .NET `/api`, Python `/api/v1`). Zarf [../api-contract.md](../api-contract.md) ile aynı.

| Uç | Gövde | Cevap (`data`) | Not |
| --- | --- | --- | --- |
| `POST /login` | `{ email, password }` | `{ accessToken, refreshToken: null, user }` | `refreshToken` Faz 1'de hep `null` (Faz 2'de sözleşme bozulmaz) |
| `GET /me` | — | `user` | |
| `POST /logout` | — | `null` | `tokenVersion++`: kullanıcının bütün token'ları geçersiz |
| `POST /change-password` | `{ currentPassword, newPassword }` | `null` | Giriş yapmış kullanıcı; `tokenVersion++` |
| `POST /register` | `{ email, password, name }` | login ile aynı | İsteğe bağlı, stack ayarıyla açılır; admin paneli için gerekmez |

`user` (`AuthUser`): `{ id, email, name, role }`.

### User modeli (asgari)

| Alan | Kural |
| --- | --- |
| `email` | tekil, küçük harfe çevrilmiş |
| `passwordHash` | `access.hidden`; hiçbir cevapta dönmez |
| `name` | |
| `role` | `user` \| `admin` |
| `isActive` | `false` → 403 |
| `tokenVersion` | int, logout / şifre değişikliğinde artar |
| `lastLoginAt`, zaman damgaları | |

Bootstrap manifeste `users` modelini ekler; kullanıcı yönetimi admin CRUD olarak üretilir, şifre hash'leme hook'ta.

### Token

- HS256, secret en az 32 karakter.
- Claim'ler: `sub`, `role` (her zaman), `tv` (tokenVersion), `iat`, `exp`; `iss` / `aud` isteğe bağlı.
- Doğrulama: imza + süre, sonra kullanıcı DB'den okunur; `isActive` ve `tokenVersion` kontrol edilir (StockExchange modeli).
- Varsayılan süre Faz 1'de 1 gün (env ile).

### Şifre

- bcrypt, cost 12 (bcryptjs / BCrypt.Net-Next / bcrypt).
- En az 8 karakter, en fazla 72 bayt (bcrypt sonrasını sessizce keser).
- SharedFrame'in PBKDF2 hash'leri login'de doğrulanıp bcrypt'e çevrilir.

### Güvenlik

- Kullanıcı bulunamasa da sahte hash karşılaştırması (cevap süresinden kayıtlı e-posta anlaşılmaz).
- "E-posta yok" ve "şifre yanlış" için aynı 401 mesajı.
- Pasif kullanıcı 403; login'de IP başına rate limit 429.

### İlk admin

Açılışta `ADMIN_EMAIL` / `ADMIN_PASSWORD` ile bir kez oluşturulur (SharedFrame `AdminSeeder` gibi). Varlik360'taki `ADMIN_USER_IDS` listesinin yerini alır.

## Generator işleri

1. **Sözleşme ve kurallar:** [../api-contract.md](../api-contract.md)'ye Auth bölümü; `.cursor/rules/api-contract.mdc` ve yeni `auth.mdc`.
2. **Kod (her stack):**
   - core asset: hash, token üretme / doğrulama, rate limit;
   - iskelette K dosyalar: auth modülü (router + servis), admin seed;
   - mevcut doğrulayıcılara `tv` / `isActive` kontrolü.
3. **Users modeli:** bootstrap'ta manifest kaydı; admin CRUD + şifre hook'u.
4. **Doğrulama betiği:** üç stack'e aynı senaryolar: login, me, logout sonrası 401, şifre değişince eski token 401, pasif kullanıcı 403, admin olmayan 403, rate limit 429.
5. **admin-base:** auth tipleri (`AuthUser`, `AuthSession`), `ataAuthApi(http, prefix)`, token saklama ("beni hatırla"), 401 yakalama. Admin paneli iskeleti bunları kullanır; redux slice host'ta kalır.

## Faz 2

Refresh token (StockExchange modeli): rotation, DB'de hash'li saklama, `POST /refresh`; admin-base'de tek seferlik yenileme kuyruğu (StockExchange admin `api.ts`). Cookie taşıma isteğe bağlı.

## Hostlarda düzeltilecekler

- **Varlik360:**
  - token'da rol yok, admin env listesinden → `role` kolonu;
  - `update-password` auth istemiyor, e-postayı body'den alıyor → giriş yapmış kullanıcıya bağlanmalı;
  - bcrypt cost 10, en az 6 karakter;
  - `POST /me` cihaz bilgisini de güncelliyor → ayrı uç;
  - mobil `token` okuyor: geçişte `accessToken` ile birlikte `token` da dönmeli.
- **SharedFrame:**
  - logout / oturum iptali yok, token 7 gün; şifre değişince eski token'lar çalışıyor;
  - `role` claim'i yalnız admin'de;
  - login cevabında `token` → `accessToken`.
- **StockExchange:**
  - token hem cookie'ye yazılıyor hem cevapta dönüyor; base'de yalnız cevap (Bearer), cookie seçenek;
  - e-posta doğrulanmamışsa standart dışı 463.
