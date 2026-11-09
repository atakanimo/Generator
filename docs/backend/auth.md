# Ortak auth katmanı

> Durum (2026-11-09): uygulandı. "Yeni … projesi" Express / .NET / Python host'unu auth ile kurar; SharedFrame, AlphaTerminal, Varlik360 ve CeyizDefterim bu katmanda (commit yok).

Üç BE stack'i aynı uçları, aynı cevap şeklini ve aynı güvenlik kurallarını üretir. Kurallar özeti: [`.cursor/rules/auth.mdc`](../../.cursor/rules/auth.mdc). Tek tanım: [`src/shared/authModules.ts`](../../src/shared/authModules.ts) (modüller, uçlar, env anahtarları, `Users` modeli, kilitli alanlar).

## Kapsam

- **Çekirdek (her zaman):** login, refresh, logout, me, change-password, `Users` modeli, ilk admin.
- **İsteğe bağlı modüller** (bootstrap diyaloğunda seçilir, hepsi varsayılan açık, `workspace.auth.modules`'a yazılır). Hepsi yalnız `user` hesapları içindir; admin yalnız e-posta + şifreyle girer (aşağıda "Admin ve kullanıcı"):

| Modül | Uçlar | Env |
| --- | --- | --- |
| `register` | register, verify-email, send-otp | mail (aşağıda) |
| `password-reset` | forgot-password, reset-password | mail |
| `google` | google (+ set-password) | `GOOGLE_CLIENT_IDS` |
| `apple` | apple (+ set-password, Apple token iptali) | `APPLE_CLIENT_IDS`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` |
| `account-delete` | `DELETE /account` | — |

Mail: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`. `SMTP_HOST` boşsa mail gönderilmez, log'a yazılır (`mail.console to=… subject=… text=…`; doğrulama betikleri OTP'yi buradan okur). .NET'te anahtarlar `Smtp__Host`, `Mail__From`, `Auth__GoogleClientIds` biçimindedir.

## Sözleşme

Uçlar `<önek>/auth` altında: Express / .NET `/api`, Python `/api/v1`. Zarf [../api-contract.md](../api-contract.md) §1 ile aynı; bölüm §8 bu tabloyu özetler.

| Uç | Modül | Bearer | Gövde | `data` |
| --- | --- | --- | --- | --- |
| `POST /login` | çekirdek | | `{ email, password }` | `AuthSession` |
| `POST /refresh` | çekirdek | | `{ refreshToken }` | `AuthSession` (yeni çift) |
| `POST /logout` | çekirdek | | `{ refreshToken? }` | `null`; o oturum iptal |
| `GET /me` | çekirdek | ✓ | — | `AuthUser` (+ `onSession` alanları) |
| `POST /change-password` | çekirdek | ✓ | `{ currentPassword, newPassword }` | `null`; bütün refresh token'lar iptal |
| `POST /register` | register | | `{ email, password, name, …ek alanlar }` | `null`; OTP gönderilir |
| `POST /verify-email` | register | | `{ email, code }` | `AuthSession` |
| `POST /send-otp` | register | | `{ email, purpose: 'verify' \| 'reset' }` | `null` |
| `POST /forgot-password` | password-reset | | `{ email }` | `null`; e-posta yoksa da aynı cevap |
| `POST /reset-password` | password-reset | | `{ email, code, newPassword }` | `null`; bütün oturumlar iptal |
| `POST /google` | google | | `{ idToken }` | `AuthSession` + `isNewUser` |
| `POST /apple` | apple | | `{ identityToken, authorizationCode?, fullName? }` | `AuthSession` + `isNewUser`; `authorizationCode` Apple refresh token'ını saklatır ("Apple token iptali") |
| `POST /set-password` | google veya apple | ✓ | `{ newPassword }` | `null`; şifresiz (sosyal) hesap ilk şifresini oluşturur, oturumlar kalır; şifre varsa 400 |
| `DELETE /account` | account-delete | ✓ | — | `null` |
| `POST /admin/set-password` | çekirdek (admin) | ✓ admin | `{ userId, newPassword }` | `null`; admin panelinden şifre atama |

```ts
type AuthUser = { id: string; email: string; name: string; role: 'admin' | 'user'; provider: 'password' | 'google' | 'apple'; emailVerified: boolean; hasPassword: boolean };
type AuthSession = { accessToken: string; refreshToken: string; expiresIn: number; user: AuthUser; isNewUser?: boolean };
```

Host'a özel alanlar (ör. `subscription`, `plan`) `onSession` hook'undan `data`'ya eklenir; sözleşme alanlarının üstüne yazılamaz.

### Hata kodları

| Durum | HTTP |
| --- | --- |
| Yanlış şifre / olmayan e-posta (aynı mesaj) | 401 |
| Sosyal girişte doğrulanmamış e-posta başka hesapta kayıtlı (`emailInUse`) | 400 |
| Geçersiz, süresi dolmuş ya da iptal edilmiş token / refresh token | 401 |
| `status: suspended` | 403 |
| Admin uçlarında `role !== 'admin'` | 403 |
| E-postası doğrulanmamış kullanıcı login'i (`EMAIL_NOT_VERIFIED`) | 463 |
| Admin'in kendi hesabını silmesi (`DELETE /account`, `adminNotAllowed`) | 403 |
| Admin hesabına Google / Apple ile giriş (`adminPasswordOnly`) | 403 |
| Admin'in `set-password`'u (`adminNotAllowed`) | 403 |
| `set-password`: hesabın şifresi zaten var (`passwordAlreadySet`) | 400 |
| Rate limit | 429 |

## `Users` modeli

Bootstrap `Users`'ı sıradan bir manifest modeli olarak yazar ve generate eder (admin CRUD dahil). Normal API başta kapalıdır; editörden `list` / `getOne` / `update` açılabilir (sahiplik `self`: yalnız kendi satırı). `create` ve `delete` normal API'de hiç açılmaz: kayıt `register`'dan, silme `DELETE /auth/account`'tan geçer. Auth alanları `adminOnly` ya da `readonly`'dir, normal API onları yazamaz. Projeye özel alanlar (ör. `region`, `regionId`) model editöründen eklenir; auth kodu onlara dokunmaz.

Kilitli alanlar (`AUTH_LOCKED_USER_FIELDS`): `email` (tekil, küçük harf), `passwordHash` (`access.hidden`, hiçbir cevapta dönmez, filtrelenmez), `name`, `role` (`admin | user`, varsayılan `user`), `status` (`active | suspended`), `emailVerified`, `provider`, `providerUserId`, `lastLoginAt`.

Kilit `lockAuthUsersModel` ile uygulanır ve manifest'te `workspace.auth` varken her yazma yolunda çalışır: manifest yazımı (`applyManifestWrite`), model editörü (`project:createModel` / `updateModel`), generate (Express / .NET / Python). Model editörü kilitli alanı silse ya da değiştirse bile kayıt ve üretim auth tanımını geri koyar. Renderer'da kilitli alanların görsel kilidi henüz yok (açık konu).

### İç tablolar (model değil, admin CRUD yok)

- `refresh_tokens`: `userId`, `tokenHash` (SHA-256), `expiresAt`, `revokedAt?`, `userAgent?`, `ip?`.
- `otp_codes`: `userId`, `purpose` (`verify | reset`), `codeHash`, `expiresAt`, `attempts`, `consumedAt?`.

Mongo'da (Express, Python, .NET-Mongo) index'li koleksiyon; .NET PostgreSQL / SQL Server'da entity + configuration (`Domain/Auth`, `Persistence/Auth`), ilk migration'a girer. .NET model taraması `Domain/Auth/`'u model saymaz.

## Roller

Yalnız `admin` ve `user`. Rol `users.role`'de; env'den okunmaz (`ADMIN_USER_IDS`, `ADMIN_ROLE` kaldırıldı).

Her istekte kullanıcı DB'den yüklenir: kayıt yoksa 401, `suspended` ise 403, rol DB'deki değerdir. Token'daki `role` claim'i bilgi amaçlıdır; rol değişikliği ve askıya alma hemen etkili olur. Kontrol noktaları: Express `authMiddleware` / `adminAuthMiddleware`, .NET `OnTokenValidated` + `AdminPolicy`, Python `deps.py` (`CurrentUser`, `require_admin`).

Bir kullanıcıyı admin yapmak: admin panelinde Kullanıcılar → `role`; şifre atama `POST /auth/admin/set-password`. Admin CRUD'dan rol düşürmeye karşı koruma yok.

### Admin ve kullanıcı

Admin hesapları yalnız e-posta + şifreyle girer; isteğe bağlı modüllerin hepsi `user` hesapları içindir. Diyalogda "Admin paneli de kur" altında aynı kural yazar (`AUTH_ADMIN_RULE`).

| Uç | Admin için |
| --- | --- |
| `login` | Çalışır; `emailVerified` kontrolü (463) yalnız `user`'a uygulanır (admin'e doğrulama kodu gitmez) |
| `change-password`, `admin/set-password` | Çalışır (admin şifresini böyle değiştirir ya da başka admin atar) |
| `register` | Admin e-postasında hiçbir şey değişmez; aynı `otpSent` cevabı |
| `send-otp`, `forgot-password` | Admin'e kod gönderilmez; aynı `otpSent` cevabı |
| `verify-email`, `reset-password` | `invalidCode` (400) |
| `google`, `apple` | Bulunan hesap admin'se 403 `adminPasswordOnly` |
| `set-password` | 403 `adminNotAllowed` |
| `DELETE /account` | 403 `adminNotAllowed` (admin'i başka bir admin panelden siler) |

Google / Apple ile açılmış bir hesap sonradan admin yapılırsa sosyal girişle giremez; şifresini başka bir admin `admin/set-password` ile atar.

## Token ve şifre

- Access: HS256 JWT, 15 dk (`JWT_ACCESS_TTL_MINUTES`); claim'ler `sub`, `role`, `iat`, `exp`, `jti`; `iss` / `aud` isteğe bağlı. Secret en az 32 karakter.
- Refresh: opak rastgele değer, 30 gün (`JWT_REFRESH_TTL_DAYS`); DB'de yalnız SHA-256 hash'i. Her `/refresh` yeni çift verir (rotation); eski token tek atomik adımda tüketilir (aynı token'la iki istek → biri 200, öteki 401). Kullanılmış token tekrar gelirse yalnız 401 döner, öteki oturumlar etkilenmez.
- Şifre: bcrypt cost 12 (bcryptjs / `bcrypt` / BCrypt.Net-Next); en az 8 karakter, en fazla 72 bayt, harf + rakam.
- Kullanıcı yoksa sahte bcrypt karşılaştırması yapılır (cevap süresinden e-posta anlaşılmaz).
- OTP: CSPRNG 6 hane, 10 dk, hash'li, en fazla 5 deneme; sonra kod tükenir.
- Rate limit: login / register / OTP / forgot / reset, IP + yol başına dakikada 10 (`Auth__RateLimitPerMinute` / stack eşdeğeri) → 429 zarfı. Refresh sınırlanmaz. IP, tek reverse proxy arkasında `X-Forwarded-For`'un son değeridir (Express `trust proxy 1`, .NET `UseForwardedHeaders`, Python `client_ip`).
- Google / Apple: id token JWKS ile doğrulanır (`aud` env'deki client id'lerden biri olmalı). Kullanıcı sağlayıcı id'siyle, yoksa e-postayla bulunur, o da yoksa `user` rolüyle oluşturulur (`isNewUser: true`).
  - Sağlayıcı e-postayı doğrulamadıysa ve e-posta başka hesapta kayıtlıysa 400 (`emailInUse`).
  - Doğrulanmamış bir şifre hesabına bağlanınca o hesabın şifresi silinir (e-postayı doğrulanmadan kaydeden başkası olabilir).
- Kayıt: e-posta doğrulanmamış bir hesapta kayıtlıysa şifre ve ad son kayıttakiyle değişir, yeni kod gider (hesap kodu doğrulayanındır).

### Apple token iptali

App Store, Apple ile girişi olan uygulamada hesap silinince Apple token'ının da iptal edilmesini ister. `apple` modülü açıkken:

- İstemci `POST /apple`'a `authorizationCode`'u da gönderir. Sunucu kodu Apple'da (`/auth/token`) refresh token'a çevirir ve `users.appleRefreshToken`'a yazar (gizli alan, hiçbir cevapta dönmez; yalnız `apple` modülüyle modelde). Kod başka bir Apple hesabınınsa (`sub` farklı) saklanmaz. Takas olmazsa giriş yine başarılıdır, log'a yazılır.
- `DELETE /account` kullanıcıyı sildikten sonra token'ı Apple'da (`/auth/revoke`) iptal eder. Hata log'a yazılır, silme geri alınmaz.
- İstemci sırrı her çağrıda `.p8` anahtarıyla imzalanan 5 dakikalık ES256 JWT'dir. Env: `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (.p8 içeriği, `.env`'de satır sonları `\n`); .NET'te `Auth__AppleTeamId` / `Auth__AppleKeyId` / `Auth__ApplePrivateKey`. Boşsa takas ve iptal atlanır (uyarı log'u). Takas, identity token'ın `aud`'u olan client id ile yapılır; iptal `APPLE_CLIENT_IDS`'teki kimlikleri sırayla dener.
- Dosyalar: Express `core/auth/apple-token.ts`, Python `core/auth/apple_token.py`, .NET `Api/Auth/AppleTokenClient.cs` (`IAppleTokenClient`).

## İlk admin

1. Bootstrap diyaloğunun **İlk admin** bölümü (e-posta, şifre, ad) Generator'ın yerel ayarından dolu gelir: Electron `userData` altında `auth-defaults.json` (repo'ya girmez; `src/main/ipc/authDefaults.ts`).
2. Generator şifreyi bcrypt ile hash'ler ve host'a K dosya yazar; düz şifre projeye girmez:
   - Express `src/seed/initial-admin.ts`
   - Python `src/<pkg>/seed/initial_admin.py`
   - .NET `Infrastructure/Auth/InitialAdmin.cs`
3. Açılışta seed çalışır: hiç admin yoksa bu kullanıcı `admin` rolüyle oluşturulur (`auth.seed <email>` log'u); varsa hiçbir şey yapmaz.

`scripts/python-host.mjs` aynı dosyayı okur; `AUTH_ADMIN_EMAIL`, `AUTH_ADMIN_PASSWORD`, `AUTH_ADMIN_NAME`, `AUTH_MODULES` env'leriyle değiştirilebilir. Doğrulama betikleri test admin'i kullanır (`AUTH_TEST_ADMIN`, `scripts/verify/auth-scenarios.mjs`).

## Host'taki dosyalar

Asset'lerdeki modül koşulları (`// @auth-file a|b` ilk satırda, `// @if` / `// @else` / `// @endif`; Python'da `#`) seçilmeyen modülleri çıkarır (`src/main/utils/authBlocks.ts`).

- **Python:** çekirdek, uçlar, şemalar ve seed G'dir (`# <auto-generated by Generator />`); her generate'te `workspace.auth.modules`'e göre yeniden yazılır, kapanan modülün G dosyası silinir (`PythonAuthFiles.ts`). `hooks.py`, `router_custom.py`, `service_custom.py` ve `seed/initial_admin.py` K'dir. Başlıksız bir G dosyası projenindir, dokunulmaz; içeriği Generator'ınkiyle aynıysa başlığı eklenir.
- **Express ve .NET:** hepsi K (bir kez yazılır, sonra host'undur).

### Var olan projede modül değiştirme (Python)

Arayüzde "Auth modülleri" (açık Python projesinde) ya da `node scripts/python-host.mjs auth <host> [modüller|-] [--app="Ad"] [--apply]`. `--apply` olmadan yalnız değişecek auth dosyalarını listeler. Uygulayınca: manifest `workspace.auth` (`modules`, `appName`: auth e-postalarının konusu), `Users` kilitli alanları, bütün modüllerin generate'i (auth G dosyaları dahil) ve yalnız yeni açılan modüllerin `.env.example` anahtarları / `PyJWT[crypto]`. Yeni açılan modülün hook'u K `hooks.py`'de yoksa not düşer. İstemciler aynı seçimi `node scripts/host.mjs client-auth` ile alır.

| | Express | .NET | Python |
| --- | --- | --- | --- |
| Asset kaynağı | `express-mongoose/auth/` | `dotnet-efcore/auth/` (+ `providers/relational\|mongodb`) | `python-fastapi/auth/` |
| Çekirdek | `src/core/auth/` | `Application/Auth`, `Infrastructure/Auth`, `Api/Auth` | `src/<pkg>/core/auth/` |
| Uçlar | `src/modules/auth/auth.routes.ts` | `Api/Endpoints/Auth/AuthEndpoints.cs` | `src/<pkg>/modules/auth/router.py` |
| Hook'lar | `modules/auth/auth.hooks.ts` | `Application/Auth/AuthHooks.cs` | `modules/auth/hooks.py` |
| Bootstrap | `ExpressAuthBootstrap.ts` | `DotnetAuthBootstrap.ts` | `PythonAuthBootstrap.ts` |

Hook'lar: `onRegister` (kayıtta / ilk sosyal girişte ek alanları doldurur), `onSession` (session ve `me` cevabına alan ekler), `onAccountDelete` (kullanıcının verisini siler). Express'te kod e-postası `MailMessage.otp` (`purpose`, `code`, `name`) da taşır: host `core/auth/mailer.ts`'te kendi şablonunu kullanabilir.

Paketler: Express `bcryptjs`, `jose` (Google / Apple), `nodemailer` (mail modülleri); Python `bcrypt`, `PyJWT[crypto]` (Google / Apple); .NET `BCrypt.Net-Next` 4.0.3 (sosyal giriş ve mail ek paket istemez).

## İstemciler

Admin, web ve mobil aynı auth katmanını kullanır: G dosyalar K eşlerini içine alır, projede import'lar hep `.generated`'dan. Host kuralı (dosyalar, K yazarken, kullanım): `src/generator-assets/cursor-rules/frontend.common.mdc` "Auth". Üretim `generateClientAuthFiles` (`src/main/generators/client-redux/ClientGenerator.ts`); token saklama ve refresh client-http `services/api/auth.generated.ts` ([../frontend/client-data-layer.md](../frontend/client-data-layer.md#http-katmanı-client-http)). Admin'de `canSignIn` yalnız `admin` rolünü alır (admin iskeleti: [../frontend/admin-host.md](../frontend/admin-host.md)). UI üretilmez: login / register ekranları host'ta yazılır (admin'de `AtaLoginPage`).

```bash
node scripts/host.mjs client <backend host> <uygulama>        # generated modüller + auth
node scripts/host.mjs client-auth <backend host> <uygulama>   # yalnız auth
node scripts/assets-sync.mjs <uygulama> --apply-all           # services/api + types/API/response
```

- G her seferinde, K yalnız yoksa yazılır (`skipped-exists`).
- Eski adlar (`services/common.generated.ts`, `services/api/index.ts`, `platform.ts`, `response.ts`, generated köprünün `auth.ts`'i) Generator başlıklıysa silinir ve not düşülür.
- Backend'de projeye özel auth ucu auth'un custom eşlerine yazılır: .NET `AuthEndpoints.Custom.cs` (`MapCustom(group)`), `AuthService.Custom.cs`, `AuthDtos.Custom.cs`; Express `auth.routes.custom.ts` (`mapCustomAuthRoutes(router)`), `auth.service.custom.ts`, `auth.hooks.ts` (`onRegister`, `onSession`, `onAccountDelete`); Python `router_custom.py` (`map_custom_auth_routes(router)`), `service_custom.py`, `hooks.py`. `assets-sync` custom dosyaları yalnız yoksa yazar.

Dosya başlıkları: G ve asset sync dosyası `// Auto Generated By Generator - <tarih saat>` (Generator'ın, üzerine yazılır); bir kez yazılan K, skeleton ve proje köprüsü `// Generated By Generator - <tarih saat> (bir kez yazıldı)`. Asset sync karşılaştırırken başlık satırını atar.

## Doğrulama

Senaryolar tek dosyada: `scripts/verify/auth-scenarios.mjs` (`runAuthScenarios`). Çalışan sunucuya karşı: seed admin login → me (`hasPassword`), refresh rotation ve eski refresh 401, aynı token'la eşzamanlı iki refresh → bir kazanan, logout sonrası 401, şifre değişince eski refresh 401, aynı 401 mesajı, suspended 403, admin olmayan admin-crud 403, rol düşürülünce aynı token ile 403, doğrulanmamış admin şifreyle girer, admin hesabını silemez (başka admin varken de), admin e-postasıyla register / forgot kod göndermez, admin `set-password` 403, register → OTP → verify, şifreli kullanıcıda `set-password` 400, kullanıcı hesabını siler, OTP 5 denemede kilitlenir, şifre sıfırlama, rate limit 429.

| Kapı | Ne yapar |
| --- | --- |
| `express-bootstrap.mjs` | bootstrap + build + Docker Mongo'da senaryolar |
| `python-bootstrap.mjs` | bootstrap + pytest + Docker Mongo'da senaryolar (`--no-docker` canlı adımı atlar) |
| `dotnet-e2e.mjs` | adım 6: auth host'u + senaryolar (`--auth-only` yalnız bunu çalıştırır; `--db mongodb\|postgres`) |
| `admin-bootstrap.mjs --install` | admin iskeleti + `redux-web` auth dosyaları typecheck + build |
| `regen-client.mjs` | `redux-rn` auth dosyaları mobil host'ta tsc + ikinci generate hiçbir şey yazmaz |
| `regen-python`, `regen-dotnet`, `python-import`, `filter-determinism` | auth'lu bootstrap ile; `Users` satırı ve kilitli alanlar |

## Açık konular

- Google / Apple'ın admin dalı ve şifresiz hesapta `set-password` canlı senaryoda yok (gerçek sağlayıcı token'ı gerekir); kod incelemesiyle.
- Apple kod takası ve token iptali ("Apple token iptali") canlı denenmedi (gerçek Apple anahtarı ve kodu gerekir); 3 stack'te derleniyor / lint temiz.
- Model editöründe kilitli alanların görsel kilidi (`isAuthLockedField` renderer'a bağlanmadı; kilit BE yazma yolunda zaten var).
- SQL Server sağlayıcısı derleniyor, canlı senaryolar çalıştırılmadı.
- .NET-Mongo'da `refresh_tokens` için TTL index yok (süresi geçenler kalır, doğrulamada reddedilir).
- Express için `yarn.lock` güncellenmedi (`bcryptjs` npm ile eklendi).
- G-sarar-K modeli CRUD modüllerine (`events.thunk` vb.) uygulanacak mı? Bugün orada K, G'yi import ediyor ve sayfalar K'dan alıyor.
- `restoreSession` ağ hatasında da oturumu kapalı gösterir (token'lar kalır, sonraki açılış geri yükler); mobilde çevrimdışı açılış giriş ekranında kalır.
