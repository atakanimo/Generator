# Ortak rate limit (plan)

Üç BE stack'i (Express, .NET, Python) aynı rate limit kurallarını taşır. Kod Generator'dan gelir (G), sayılar env'dedir, manifest'e bir şey yazılmaz, proje oluştururken soru sorulmaz. Uygulanmadı (2026-11-08).

## Bugün

| | Generator şablonu | Projede ek olarak |
|---|---|---|
| Express | `core/auth/rate-limit.ts`: elle middleware, yalnız auth uçları, `AUTH_RATE_LIMIT_PER_MINUTE` | Varlik360 `core/middleware/rate-limit.middleware.ts` (`express-rate-limit`): genel 150 / 15 dk, giriş gerektiren her uçta 30 / dk, admin okuma 600 / 15 dk, yazma 120 / 15 dk (route route `app.ts`'te), kullanılmayan `authRateLimiter`; değerler kodda |
| Python | `core/auth/rate_limit.py`: `Depends`, yalnız auth uçları | StockExchange `core/http/middleware/rate_limit.py` (`slowapi`): genel 120 / dk, anahtar `user:<sub>` / `ip:<ip>`, Redis seçeneği, güvenilir proxy listesi |
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
| Özel (ör. `qr-kit-preview`) | K dosyada | Policy'de (`ip` / `user`) | Uca adıyla bağlanır |

Admin değerleri Varlik360'tan: panel her sayfa açılışında, filtrede ve değişiklikten sonra listeyi yeniden çeker.

### Bağlama

- **Global middleware (G):** yolu ve metodu okur, `general` / `admin-read` / `admin-write` seçer. OPTIONS ve sağlık ucu atlanır. Admin uçları route route bağlanmaz.
- **Admin yolu** stack'e göre:

  | Stack | Admin yolu |
  |---|---|
  | Express | `/api/<modül>/admin/…`, `/api/admin/…` |
  | .NET | `/api/<route>/admin/…`, `/api/admin/…` |
  | Python | `{API_PREFIX}/admin-crud/…` (üretilen, [python-fastapi.md](python-fastapi.md) K6), `{API_PREFIX}/admin/…` |

- **`auth` ve özel policy'ler** uca tek tek bağlanır; o istekler global sayaca da girer.
- **Kullanıcı anahtarı:** global middleware token'ın imzasını doğrular, DB'ye gitmez (Express / Python `tokens` modülü). .NET'te `UseRateLimiter` `UseAuthentication`'dan sonra, `User` hazır.

### Env

Üç stack'te aynı adlar. Biçim `<adet>/<saniye>`; `0` o profili kapatır. .NET düz adları `IConfiguration` ile okur.

```
RATE_LIMIT_ENABLED=true
RATE_LIMIT_AUTH=10/60
RATE_LIMIT_GENERAL=120/60
RATE_LIMIT_ADMIN_READ=600/900
RATE_LIMIT_ADMIN_WRITE=120/900
TRUSTED_PROXY_CIDRS=127.0.0.1/32,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16
```

Özel policy env'den ezilebilir: `RATE_LIMIT_<AD>` (ör. `RATE_LIMIT_QR_KIT_PREVIEW=30/60`). Kalkanlar: `AUTH_RATE_LIMIT_PER_MINUTE`, `Auth__RateLimitPerMinute`, StockExchange'in `RATE_LIMIT_DEFAULT`, `RATE_LIMIT_STORAGE_URI`, `RATE_LIMIT_HEADERS_ENABLED`.

### Yöntem ve depolama

- Sabit pencere, üç stack'te aynı. .NET hazır `FixedWindowLimiter`; Express ve Python kendi küçük kodu. `express-rate-limit` ve `slowapi` bağımlılıkları kalkar.
- Sayaç bellekte. Store arayüzü ayrı tutulur; Redis açık konu.

### Yanıt

- 429, zarf, kod `TOO_MANY_REQUESTS`, tek mesaj anahtarı `rateLimit.tooManyRequests`.
- 429'da `Retry-After`; sınırlı her yanıtta `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`. CORS bunları `expose` eder.
- İstemci (admin-base, `client-http`) için değişiklik yok: 429 sıradan hata zarfıdır, refresh / logout tetiklemez.

### İstemci IP'si

StockExchange modeli ortaklaşır (G `client-ip`): istek `TRUSTED_PROXY_CIDRS` içindeki bir adresten geliyorsa `X-Real-IP` → `X-Forwarded-For` son değeri → bağlantı adresi; değilse yalnız bağlantı adresi. IP blacklist `X-Forwarded-For` kullanmadan çağırabilir. Express `trust proxy` listeyi alır; .NET `ForwardedHeaders` `KnownNetworks`'ü bu listeden kurar.

### Proje oluştururken soru

Sorulmaz.

| Aday soru | Neden sorulmaz |
|---|---|
| Hangi profiller açık | Hepsi açık; kapatmak env'de `0`. Admin'i olmayan projede admin profili devreye girmez |
| Limit / pencere | Ortama göre değişir (dev / prod), oluşturma anında bilinmez; env |
| Anahtar IP mi kullanıcı mı | Güvenlik kararı, profile göre sabit |
| Bellek mi Redis mi | Projeler tek instance; Redis gelince env |
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
| Yeni (G) | Express `src/generator-assets/express-mongoose/…/src/core/rate-limit/{rate-limit,profiles,client-ip,index}.ts` (`EXPRESS_CORE_BOOTSTRAP_FILES`'a eklenir) |
| | Python `src/generator-assets/python-fastapi/core/http/{rate_limit,client_ip}.py` |
| | .NET `src/generator-assets/dotnet-efcore/Api/Common/RateLimitSetup.cs` |
| Yeni (K, yalnız yoksa) | `rate-limit.policies.ts`, `rate_limit_policies.py`, `RateLimitPolicies.cs` (boş) |
| Silinir | `express-mongoose/auth/src/core/auth/rate-limit.ts`, `python-fastapi/auth/src/__app__/core/auth/rate_limit.py` |
| Değişir | `auth.routes.ts`, `router.py`, `AuthEndpoints.cs`: yeni import / policy sabiti |
| | `auth/Api/Auth/AuthApiSetup.cs`: `AddRateLimiter` çıkar; `AuthDtos.cs`: `RateLimitPerMinute` çıkar |
| | `Api/Common/ApiSetup.cs`: `AddRateLimits` + `UseRateLimiter`; forwarded header ayarı `Program.cs`'ten buraya |
| | Skeleton: Express `app.ts` (tek `app.use`, `trust proxy`), Python `api/main.py` (middleware), .NET `Program.cs` (`UseRateLimiter` ve forwarded blok çıkar), `.env.example` ×2 |
| | `DotnetAuthBootstrap.ts`: `Auth__RateLimitPerMinute` → rate limit env satırları host bootstrap'a |
| | Express skeleton `locales/{tr,en}.ts`, Python auth mesajları → ortak mesaj, .NET `Messages.cs` |
| Doküman / kapı | Bu dosya; [auth.md](auth.md) rate limit satırı, [../api-contract.md](../api-contract.md) 429 + header'lar |
| | `scripts/verify/auth-scenarios.mjs`: header'lar ve `general` senaryosu |

## Projelerde

### Varlik360 (Express)

- **Oluşur:** `src/core/rate-limit/*` (G), `src/core/rate-limit/rate-limit.policies.ts` (K, boş).
- **Silinir:** `src/core/middleware/rate-limit.middleware.ts`, `src/core/auth/rate-limit.ts`, `package.json` `express-rate-limit`, `locales/{tr,en}.ts` `generalLimitExceeded` / `strictLimitExceeded` / `authLimitExceeded` / `adminLimitExceeded`.
- **Değişir:** `src/app.ts` (`generalRateLimiter` + 14 `adminApiRateLimiter` bağlaması → tek `app.use`), `core/middleware/index.ts` export'ları, `auth.middleware.ts` (`strictRateLimiter` sarmalayıcısı çıkar), `auth.routes.ts` import'u, `.env` / `.env.example`.
- **Davranış:** giriş gerektiren uçlarda IP başına 30 / dk → kullanıcı başına 120 / dk; genel IP başına 150 / 15 dk → 120 / dk.

### StockExchange (Python)

- **Oluşur:** `core/http/rate_limit.py`, `core/http/client_ip.py` (G), policy dosyası (K).
- **Silinir:** `core/http/middleware/rate_limit.py` (`slowapi`), `core/auth/rate_limit.py`, `core/http/exceptions.py` `rate_limit_exception_handler` + `RateLimitExceeded` kaydı, `api/main.py` `SlowAPIASGIMiddleware` + `app.state.limiter`, `pyproject.toml` `slowapi`, `core/config.py` `RATE_LIMIT_DEFAULT` / `RATE_LIMIT_STORAGE_URI` / `RATE_LIMIT_HEADERS_ENABLED` / `AUTH_RATE_LIMIT_PER_MINUTE`.
- **Değişir:** `client_ip_from_scope` kullananlar `client_ip.py`'ye: `core/logging/file_jsonl.py`, `modules/ip_blacklist/service.py`, `modules/audit_logs/service.py`, `tests/modules/ip_blacklist/test_ip_blacklist.py`, `tests/modules/audit_logs/test_activity_log.py`. `TRUSTED_PROXY_CIDRS` kalır.
- **Dokunulmaz:** `integrations/providers/common/rate_limiter.py` (dış API'ye giden çağrı, `TokenBucket`).
- **Elle:** VPS `.env`; önce prod'da `RATE_LIMIT_STORAGE_URI` ile Redis verilmiş mi bakılır.

### SharedFrame (.NET)

- **Oluşur:** `src/SharedFrame.Api/Common/RateLimitSetup.cs` (G), `src/SharedFrame.Api/RateLimitPolicies.cs` (K: `qr-kit-preview` `30/60`, `user`).
- **Silinir:** `Common/ApiSetup.cs` `AddRateLimiter` bloğu (asset sync ile G hâline döner), `Auth/AuthApiSetup.cs` `AddRateLimiter` bloğu, `Application/Auth/AuthDtos.cs` `RateLimitPerMinute`, `QrKitEndpoints.PreviewRateLimitPolicy`.
- **Değişir:** `Endpoints/QrKit/QrKitEndpoints.cs`, `Endpoints/Events/EventEndpoints.Custom.cs` (yeni policy sabiti), `Endpoints/Auth/AuthEndpoints.cs`, env `Auth__RateLimitPerMinute` → `RATE_LIMIT_AUTH`.
- **Dokunulmaz:** `EventZipExportService` "24 saatte 3 export" (iş kuralı).

### CeyizDefterim (.NET)

- **Oluşur:** `RateLimitSetup.cs` (G), `RateLimitPolicies.cs` (K, boş).
- **Değişir:** `Auth/AuthApiSetup.cs`, `Application/Auth/AuthDtos.cs`, `Endpoints/Auth/AuthEndpoints.cs`, `tests/CeyizDefterim.Api.Tests/ApiFlowTests.cs` (429 testi env adı).

## Açık konular

- Redis store (çok instance).
- Ağır uçlar için operasyon bazlı policy (`api.rateLimit`).
- Eski env adlarını bir sürüm boyunca okuyup uyarı vermek mi, doğrudan kaldırmak mı.
