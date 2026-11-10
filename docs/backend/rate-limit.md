# Ortak rate limit (plan)

Üç BE stack'i (Express, .NET, Python) aynı rate limit kurallarını taşır. Kod Generator'dan gelir (G), sayılar env'dedir, manifest'e bir şey yazılmaz, proje oluştururken soru sorulmaz. Durum (2026-11-10): üç stack'te uygulandı: .NET (Generator + SharedFrame), Express (Generator + Varlik360), Python (Generator + AlphaTerminal).

## Başlangıç durumu

| | Generator şablonu | Projede ek olarak |
|---|---|---|
| Express | `core/auth/rate-limit.ts`: elle middleware, yalnız auth uçları, `AUTH_RATE_LIMIT_PER_MINUTE` | Varlik360 `core/middleware/rate-limit.middleware.ts` (`express-rate-limit`): genel 150 / 15 dk, giriş gerektiren her uçta 30 / dk, admin okuma 600 / 15 dk, yazma 120 / 15 dk (route route `app.ts`'te), kullanılmayan `authRateLimiter`; değerler kodda |
| Python | `core/auth/rate_limit.py`: `Depends`, yalnız auth uçları | AlphaTerminal `core/http/middleware/rate_limit.py` (`slowapi`): genel 120 / dk, anahtar `user:<sub>` / `ip:<ip>`, Redis seçeneği, güvenilir proxy listesi |
| .NET | `AuthApiSetup.cs`: `"auth"` policy | SharedFrame `ApiSetup.cs`: `qr-kit-preview` 30 / dk (kodda), ikinci `AddRateLimiter` (`OnRejected` sonuncusu kazanır). CeyizDefterim: yalnız şablon |

Ortak olan yalnız auth limiter'ı: sabit pencere 1 dk, IP + uç, bellekte, varsayılan 10, 429 zarfı. Genel limiter hiçbir şablonda yok. Python ve .NET şablonu `X-Forwarded-For`'u doğrulamadan alır.

## Kararlar

### Profiller

Sabit dört profil (G) ve projeye özel adlı policy'ler (K).

| Profil | Varsayılan (`adet/saniye`) | Anahtar | Kapsam |
|---|---|---|---|
| `auth` | `10/60` | IP + uç | login, register, verify-email, send-otp, forgot / reset-password, google, apple, set-password. Refresh sınırlanmaz |
| `general` | `120/60` | Geçerli access token varsa `user:<id>`, yoksa `ip:<ip>` | Admin olmayan bütün API istekleri |
| `admin-read` | `600/900` | Kullanıcı (token yoksa IP) | Admin yolunda `GET` ve `POST …/get-all` |
| `admin-write` | `120/900` | Kullanıcı (token yoksa IP) | Admin yolunda diğer istekler |
| Özel (ör. `qr-kit-preview`) | K dosyada | Policy'de (`ip` / `user` / `ip+yol` / başlık + IP tavanı) | Uca adıyla bağlanır |

Admin değerleri Varlik360'tan: panel her sayfa açılışında, filtrede ve değişiklikten sonra listeyi yeniden çeker.

### Bağlama

- **Global middleware (G):** yalnız API önekinin altındaki istekleri sayar (`/api/…`; Python `{API_PREFIX}/…`). Hangfire paneli, Swagger, statik dosyalar sayılmaz. OPTIONS ve sağlık ucu atlanır. Yolu ve metodu okur, `general` / `admin-read` / `admin-write` seçer. Admin uçları route route bağlanmaz.
- **Admin yolu** stack'e göre:

  | Stack | Admin yolu |
  |---|---|
  | Express | `/api/<modül>/admin/…`, `/api/admin/…` |
  | .NET | `/api/<route>/admin/…`, `/api/admin/…` |
  | Python | `{API_PREFIX}/admin-crud/…` (üretilen, [python-fastapi.md](python-fastapi.md) K6), `{API_PREFIX}/admin/…` |

- **`auth` ve özel policy'ler** uca tek tek bağlanır; kendi policy'si olan uç global sayaca girmez (yalnız kendi policy'si sayar). Böylece bir uç `general`'den çıkarılabilir. .NET'te uca `RequireRateLimiting(ad)`; Express ve Python'da global middleware route'tan önce çalıştığı için policy yolu ve metodu policy'de yazılır (Express `path: RegExp` tam yol; Python `path` regex'i `API_PREFIX`'ten sonraki yol, `methods`), ilk eşleşen policy sayar.
- **Ortak IP:** aynı NAT arkasındaki anonim kullanıcılar (salon Wi-Fi'ı, kurum ağı) tek IP'den gelir ve `general` sayacını paylaşır. Böyle trafik alan uç için proje başlık anahtarlı policy yazar: başlık varsa (ör. `X-Guest-Key`) sayaç başlık değeri başınadır, başlık yoksa yalnız IP tavanı sayar; her istek ayrıca IP tavanına girer (uydurma başlıkla sınırsız istek engellenir). .NET: `AddFixedWindowPolicy(…, RateLimitKey.Header, keyHeader, ipCeiling)`; Express: policy'de `key: 'header'`, `keyHeader`, `ipCeiling`; Python: `RateLimitPolicy(key="header", key_header=…, ip_ceiling=…)`. Env `RATE_LIMIT_<AD>` ve `RATE_LIMIT_<AD>_IP`.
- **Kullanıcı anahtarı:** global middleware token'ın imzasını doğrular, DB'ye gitmez (Express / Python `tokens` modülü). .NET'te `UseRateLimiter` `UseAuthentication`'dan sonra, `User` hazır.

### Env

Üç stack'te aynı adlar. Biçim `<adet>/<saniye>`; `0` o profili kapatır. .NET düz adları `IConfiguration` ile okur.

```
RATE_LIMIT_ENABLED=true
RATE_LIMIT_AUTH=10/60
RATE_LIMIT_GENERAL=120/60
RATE_LIMIT_ADMIN_READ=600/900
RATE_LIMIT_ADMIN_WRITE=120/900
TRUSTED_PROXY_CIDRS=127.0.0.1/32,::1/128
```

Özel policy env'den ezilebilir: `RATE_LIMIT_<AD>` (ad büyük harf, `-` → `_`; ör. `RATE_LIMIT_QR_KIT_PREVIEW=30/60`). Kalkanlar doğrudan kaldırılır, eski ad okunmaz (geriye uyumluluk yok): `AUTH_RATE_LIMIT_PER_MINUTE`, `Auth__RateLimitPerMinute`, AlphaTerminal'in `RATE_LIMIT_DEFAULT`, `RATE_LIMIT_STORAGE_URI`, `RATE_LIMIT_HEADERS_ENABLED`. Auth'un varsayılanı aynı kaldığı için (`10/60`) eski adın unutulması davranışı değiştirmez.

`TRUSTED_PROXY_CIDRS` varsayılanı yalnız loopback. Özel ağları varsayılan saymak, Docker'da yayınlanmış porta gelen her dış isteği (kaynağı bridge gateway, `172.x`) güvenilir yapar ve `X-Forwarded-For` sahtelemesine açar. Proxy ağı kurulumda env'e yazılır; ör. API portu yalnız `127.0.0.1`'e açık ve önünde host nginx olan Docker kurulumunda `TRUSTED_PROXY_CIDRS=172.16.0.0/12`.

Testler: entegrasyon testleri tek IP'den kısa sürede çok istek atar; test fabrikası `RATE_LIMIT_ENABLED=false` verir. Rate limit'in kendisini ölçen test kendi değerini verir.

### Yöntem ve depolama

- Sabit pencere, üç stack'te aynı. .NET hazır `FixedWindowLimiter`; Express ve Python kendi küçük kodu. `express-rate-limit` ve `slowapi` bağımlılıkları kalkar.
- Sayaç bellekte (projeler tek instance).

### Yanıt

- 429, zarf, kod `TOO_MANY_REQUESTS`, tek mesaj anahtarı `rateLimit.tooManyRequests`.
- 429'da `Retry-After` (saniye); CORS `expose` eder.
- İstemci (admin-base, `client-http`) için değişiklik yok: 429 sıradan hata zarfıdır, refresh / logout tetiklemez.

### İstemci IP'si

AlphaTerminal modeli ortaklaşır (G `client-ip`): istek `TRUSTED_PROXY_CIDRS` içindeki bir adresten geliyorsa `X-Real-IP` → `X-Forwarded-For` son değeri → bağlantı adresi; değilse yalnız bağlantı adresi. IP blacklist `X-Forwarded-For` kullanmadan çağırabilir. Express `trust proxy` listeyi alır; .NET `ForwardedHeaders` `KnownIPNetworks`'ü bu listeden kurar ve `RemoteIpAddress`'i düzeltir (her zaman açık). .NET `X-Real-IP` okumaz, `X-Forwarded-For`'un son değerini alır; nginx ikisini aynı adresle yazdığı için sonuç aynıdır.

### Proje oluştururken soru

Sorulmaz.

| Aday soru | Neden sorulmaz |
|---|---|
| Hangi profiller açık | Hepsi açık; kapatmak env'de `0`. Admin'i olmayan projede admin profili devreye girmez |
| Limit / pencere | Ortama göre değişir (dev / prod), oluşturma anında bilinmez; env |
| Anahtar IP mi kullanıcı mı | Güvenlik kararı, profile göre sabit |
| Bellek mi Redis mi | Projeler tek instance; sayaç bellekte |
| Güvenilir proxy listesi | Kurulum bilgisi; env, varsayılan özel ağlar |

`NewProjectDialog.tsx` ve manifest değişmez.

## Üretilen dosyalar (route, servis, endpoint)

Değişiklik gerekmez; limiter global middleware'de ve auth katmanında.

| Şablon | Durum |
|---|---|
| Express `route.hbs`, `route.admin.hbs` | `router.use(authMiddleware)` / `adminAuthMiddleware` kalır. `authMiddleware` dizi yerine tek fonksiyon olsa da `router.use` ikisini de alır. `moduleApiDetect.ts` yalnız `authMiddleware` adına bakar, etkilenmez |
| Express `service*.hbs`, `crud.hbs`, `hooks.hbs` | Dokunulmaz |
| Python `admin_router_generated.py.hbs` | Dokunulmaz; `/admin-crud/` global middleware'in admin yolu listesinde olmalı |
| Python `service*`, `repository*` | Dokunulmaz |
| .NET `Api/Endpoints.cs.hbs` (`authCall`) | Dokunulmaz; admin grubu yoldan tanınır |

Açık konu: ağır uçlar (CSV export, dosya yükleme) için manifest'te `api.rateLimit` gibi bir operasyon policy'si. Şimdilik admin export `admin-read`'e sayılır; gerekirse K dosyada özel policy.

## Generator'da

| | Dosya |
|---|---|
| Yeni (G) | Express `src/generator-assets/express-mongoose/rate-limit/rate-limit.ts` → host `src/core/rate-limit/rate-limit.ts` (✅: `createRateLimitMiddleware`, `trustedProxies`, `authRateLimitPolicy`, `RateLimitPolicy`; `EXPRESS_CORE_BOOTSTRAP_FILES`). `trust proxy` listeyi alır, IP `req.ip` |
| | Python `src/generator-assets/python-fastapi/core/http/{rate_limit,client_ip}.py` (✅: `RateLimitMiddleware` saf ASGI, `RateLimitPolicy`, `AUTH_RATE_LIMIT_POLICY`; `client_ip_from_scope`, `env_setting`: önce ortam, sonra `settings`'in `env_file`'ı; 429 metni `crud_text("too_many_requests")`, `contract.error_response` / `request_context` açık) |
| | .NET `src/generator-assets/dotnet-efcore/Api/Common/RateLimitSetup.cs` (✅: `AddRateLimits`, profiller, `AuthPolicy`, `AddFixedWindowPolicy(name, default, RateLimitKey)`, `partial void AddCustomPolicies`) |
| Yeni (K, yalnız yoksa) | `rate-limit.policies.ts` (✅ `customRateLimitPolicies`, `createOnly`), `rate_limit_policies.py` (✅ `CUSTOM_RATE_LIMIT_POLICIES`, kaynak `_skeleton/…/core/http/`, `assets-sync` yalnız yoksa yazar), `RateLimitPolicies.cs` (boş; .NET ✅ `_skeleton/src/__App__.Api/RateLimitPolicies.cs`) |
| Silinir | `express-mongoose/auth/src/core/auth/rate-limit.ts` (✅), `python-fastapi/auth/src/__app__/core/auth/rate_limit.py` (✅) |
| Değişir | `auth.routes.ts`, `router.py`, `AuthEndpoints.cs`: yeni import / policy sabiti |
| | `auth/Api/Auth/AuthApiSetup.cs`: `AddRateLimiter` çıkar; `AuthDtos.cs`: `RateLimitPerMinute` çıkar |
| | `Api/Common/ApiSetup.cs`: `AddRateLimits` + `UseRateLimiter`; forwarded header ayarı `Program.cs`'ten buraya |
| | Skeleton: Express `app.ts` (tek `app.use`, `trust proxy`), Python `api/main.py` (middleware), .NET `Program.cs` (`UseRateLimiter` ve forwarded blok çıkar), `.env.example` ×2 |
| | `DotnetAuthBootstrap.ts`: `Auth__RateLimitPerMinute` → rate limit env satırları host bootstrap'a |
| | Express skeleton `locales/{tr,en}.ts`, Python auth mesajları → ortak mesaj, .NET `Messages.cs` |
| Doküman / kapı | Bu dosya; [auth.md](auth.md) rate limit satırı, [../api-contract.md](../api-contract.md) 429 + header'lar |
| | `scripts/verify/auth-scenarios.mjs`: header'lar ve `general` senaryosu |

## Projelerde

### Varlik360 (Express) ✅

- **Oluştu:** `src/core/rate-limit/rate-limit.ts` (G), `src/core/rate-limit/rate-limit.policies.ts` (K, boş).
- **Silindi:** `src/core/middleware/rate-limit.middleware.ts`, `src/core/auth/rate-limit.ts`, `express-rate-limit` (`package.json` ve iki lock dosyası), `locales/{tr,en}.ts` `generalLimitExceeded` / `strictLimitExceeded` / `authLimitExceeded` / `adminLimitExceeded` (yerine `rateLimit.retryLater`).
- **Değişti:** `src/app.ts` (`generalRateLimiter` + 14 `adminApiRateLimiter` bağlaması → tek `app.use(createRateLimitMiddleware())`, `trust proxy` = `trustedProxies()`), `core/index.ts` ve `core/middleware/index.ts` export'ları, `auth.middleware.ts` (`strictRateLimiter` sarmalayıcısı çıktı, `authMiddleware` tek fonksiyon), `auth.routes.ts` (`authRateLimit` çıktı), CORS `Retry-After`'ı açar, `.env` (`.env.example` yok).
- **Davranış:** giriş gerektiren uçlarda IP başına 30 / dk → kullanıcı başına 120 / dk; genel IP başına 150 / 15 dk → 120 / dk.

### AlphaTerminal (Python) ✅

- **Oluştu:** `core/http/rate_limit.py`, `core/http/client_ip.py` (G), `core/http/rate_limit_policies.py` (K, boş).
- **Silindi:** `core/http/middleware/rate_limit.py` (`slowapi`), `core/auth/rate_limit.py`, `api/main.py` `SlowAPIASGIMiddleware` + `app.state.limiter` + `RateLimitExceeded` kaydı, `slowapi` (`pyproject.toml`, `uv.lock`), `core/config.py` `RATE_LIMIT_*`, `TRUSTED_PROXY_CIDRS`, `TRUST_X_FORWARDED_FOR`, `AUTH_RATE_LIMIT_PER_MINUTE` (limiter env'i kendisi okur).
- **Değişti:** `client_ip_from_scope` kullananlar `client_ip.py`'ye (`file_jsonl.py`, `ip_blacklist`, `audit_logs`, iki test); auth router'ı generate ile (`python-host.mjs auth --apply`); `api/main.py` `RateLimitMiddleware` (CORS'un içinde), CORS `Retry-After`; `.env.example`; compose `api` servisine `TRUSTED_PROXY_CIDRS` (varsayılan `172.16.0.0/12`, eski config varsayılanındaki Docker ağı); `documents/security.md`; güvenlik testi middleware'e bakıyor, Docker bridge testi `TRUSTED_PROXY_CIDRS`'i kendisi verir.
- **Dokunulmaz:** `integrations/providers/common/rate_limiter.py` (dış API'ye giden çağrı, `TokenBucket`).
- **Davranış:** auth limiti aynı (IP + uç, `10/60`); genel `120/minute` → `RATE_LIMIT_GENERAL` `120/60`; admin artık kendi profillerinde (`600/900`, `120/900`).
- **Elle:** VPS `.env`'den `RATE_LIMIT_DEFAULT`, `RATE_LIMIT_STORAGE_URI`, `RATE_LIMIT_HEADERS_ENABLED`, `AUTH_RATE_LIMIT_PER_MINUTE`, `TRUST_X_FORWARDED_FOR` silinir; prod'da Redis kullanılıyorduysa artık bellek.

### SharedFrame (.NET)

- **Oluşur:** `src/SharedFrame.Api/Common/RateLimitSetup.cs` (G), `src/SharedFrame.Api/RateLimitPolicies.cs` (K: `RateLimitSetup.QrKitPreview` `30/60`, `user`).
- **Silinir:** `Common/ApiSetup.Custom.cs` rate limiter bloğu, `Auth/AuthApiSetup.cs` `AddRateLimiter` bloğu ve `RateLimitPolicy`, `Application/Auth/AuthDtos.cs` `RateLimitPerMinute`, `QrKitEndpoints.PreviewRateLimitPolicy`, `appsettings.json` `ForwardedHeaders`.
- **Değişir:** `Endpoints/Events/EventEndpoints.Custom.cs` (yeni policy sabiti), `Endpoints/Auth/AuthEndpoints.cs` (`RateLimitSetup.AuthPolicy`), `.env.example` + iki compose `Auth__RateLimitPerMinute` → `RATE_LIMIT_*`, compose `TRUSTED_PROXY_CIDRS=172.16.0.0/12` (API portu yalnız `127.0.0.1`'de), test fabrikası `RATE_LIMIT_ENABLED=false`.
- **Misafir policy'si:** `RateLimitSetup.PublicGuest` (`public-guest`): `X-Guest-Key` başına `120/60`, IP tavanı `3000/60`; `/api/public` grubunun tamamına bağlı, `general`'e girmez.
- **Dokunulmaz:** `EventZipExportService` "24 saatte 3 export" (iş kuralı).

### CeyizDefterim (.NET)

- **Oluşur:** `RateLimitSetup.cs` (G), `RateLimitPolicies.cs` (K, boş).
- **Değişir:** `Auth/AuthApiSetup.cs`, `Application/Auth/AuthDtos.cs`, `Endpoints/Auth/AuthEndpoints.cs`, `tests/CeyizDefterim.Api.Tests/ApiFlowTests.cs` (429 testi env adı).

## Açık konular

- Ağır uçlar için operasyon bazlı policy (`api.rateLimit`).
