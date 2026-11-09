# Alpha Terminal + Varlik360 + Ceyiz + SharedFrame: kalan işler

Son güncelleme 09.11.2026. Hiçbir repoda commit yok.

Kurallar ortak `.cursor/rules` dosyalarında: kaynak `src/generator-assets/cursor-rules/`, dağıtım `node scripts/rules-sync.mjs --apply`. Testler: tam koşu sorulmadan çalıştırılmaz; yalnız kırık / değişen testler.

## Durum

A–G ve B.6 bitti: G-wraps-K auth, tek cevap sözleşmesi (`{ isSuccess, data, uiMessage, errorData, traceId }`), envelope katmanı yok. İlk admin dört projede `atabeyogluatakan.dev@gmail.com` (Varlik360'a `auth.seed.ts` + `src/seed/initial-admin.ts` eklendi). Alpha'da login aktörü Generator Python auth router'ının `_signed_in`'iyle (`request.state.auth_user_id`) activity log'a yazılıyor.

## H. Kapanış

Her proje için `<proje>/tests/e2e/test-scenarios.md`: senaryo tablosu + Playwright kuralları (ortak kural `general.mdc` "Testing"). Ayrı agent senaryoları Playwright testi olarak `tests/e2e/` altına yazar ve koşar.

**H.1 Senaryolar**

| Proje | Dosya | Durum |
| --- | --- | --- |
| SharedFrame | `SharedFrame/tests/e2e/test-scenarios.md` | ✅ senaryolar yazıldı (A–I, admin H); Playwright kodu ⏳ |
| AlphaTerminal | `AlphaTerminal/tests/e2e/test-scenarios.md` | ✅ senaryolar yazıldı (A–J, admin I, partner H); Playwright kodu ⏳ |
| Varlik360 BE + admin | `Varlik360/tests/e2e/test-scenarios.md` | ✅ senaryolar yazıldı (A–I, admin H, webhook G); Playwright kodu ⏳. Önce: OTP maili Gmail'e sabit (Mailpit için env), genel rate limit kapatılamıyor |
| Varlik360 mobil (ayrı repo) | `Varlik360/apps/mobile/tests/e2e/test-scenarios.md` | ✅ senaryolar yazıldı (A–I, Maestro); akışlar ⏳ |
| CeyizDefterim BE + admin | `CeyizDefterim/tests/e2e/test-scenarios.md` | ✅ senaryolar yazıldı (A–J, admin I); Playwright kodu ⏳ |
| CeyizDefterim mobil | `CeyizDefterim/apps/mobile/tests/e2e/test-scenarios.md` | ✅ senaryolar yazıldı (A–I, Maestro); akışlar ⏳ |

**H.2 Genel kontroller (her proje)**

- Her uygulamada `tsc` + `eslint`.
- `grep` ile `envelope|unwrapData|apiLocalRequest|parseLocalResponse|thunkCatch|PageMeta` boş çıkmalı.
- `client-auth` ikinci kez çalıştırıldığında hiçbir şey yazmamalı.
- En sonda tarayıcı ve cihaz turu (şimdiye kadar hiçbir panel tarayıcıda açılmadı):
  - Admin (her proje, çalışan backend ile): giriş, admin olmayanın reddi, Dashboard, Jobs, bir liste sayfası (sayfalama, filtre, form), tema kalıcılığı.
  - Alpha web: giriş, Google ile giriş, plan rozeti, 461 kota, kayıt + OTP.
  - Varlik360 mobil: Alpha listeleri (kaydırma), deep-dive, giriş + OTP.
  - Ceyiz admin: giriş, liste / form, Dashboard.
  - Ceyiz mobil: giriş, kayıt + OTP, Google / Apple, şifremi unuttum, hesap silme, bir liste ekranı.

**H.3 Deploy (sunucuda, en son)**

- **Alpha web Google girişi:** `VITE_GOOGLE_CLIENT_ID` sunucudaki git dışı `apps/web/.env`'e, `GOOGLE_CLIENT_IDS` kök `.env`'e. Google Cloud'da web client'ın "Authorized JavaScript origins"ına prod alan adı eklenir.
- **Alpha migration:** deploy'dan önce `scripts/migrations/2026_shared_auth.py` (`authProviders` / `googleId` → `provider` / `providerUserId`). Sıra: migrate, sonra Jenkins.
- **Varlik360 auth geçişi (sert):** yeni BE açılmadan önce `scripts/migrate-shared-auth.ts` (kuru çalıştırma varsayılan, `--apply` yazar; şifre / sağlayıcı alanları, `ADMIN_USER_IDS` → `role: admin`, tekil e-posta index'i). Sunucu `.env`: `GOOGLE_CLIENT_IDS`, `APPLE_CLIENT_IDS` (+ `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`), `JWT_ACCESS_TTL_MINUTES`, `JWT_REFRESH_TTL_DAYS`, `AUTH_RATE_LIMIT_PER_MINUTE`. Yeni mobil sürüm aynı anda + `app-version-configs` zorunlu güncelleme; herkes bir kez yeniden giriş yapar.
- **CeyizDefterim ilk yayın:** tek `Initial` migration'ı (5 migration birleştirildi, prod'a hiç çıkmamıştı); env `Auth__GoogleClientIds`, `Auth__Apple*`, `Jwt__AccessTtlMinutes`, `Jwt__RefreshTtlDays` (eski `Google__ClientId`, `Jwt__ExpiresMinutes`, `Admin:Email/Password` kalktı). Mobil sürüm BE ile birlikte.
- **İlk admin e-postası:** prod'da admin zaten varsa kaydın e-postası veritabanında elle `atabeyogluatakan.dev@gmail.com` yapılır (seed yalnız boş veritabanında çalışır).
