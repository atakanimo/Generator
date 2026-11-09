# Generator dokümanları

Generator (Electron) bir projenin model dosyalarını okur, **NormalizedModel v2**'ye çevirir ve bundan BE modüllerini ve admin FE config'ini üretir.

```
Model dosyası → Parser (stack'e özel) → NormalizedModel v2 → manifest v3
  ├→ BE emitter (stack'e özel)          → HTTP API sözleşmesi
  ├→ Admin config emitter (stack'ten bağımsız) → @atakanimo/ata-admin-base ResourceSchema
  └→ İstemci veri katmanı (stack'ten bağımsız) → mobil / web servis + RTK thunk / slice
```

| Doküman | Konu |
| --- | --- |
| [api-contract.md](api-contract.md) | Stack'ten bağımsız HTTP sözleşmesi (zarf, uçlar, liste gövdesi, satır şekli, host interceptor) |
| [normalized-model.md](normalized-model.md) | NormalizedModel v2, manifest v3, merge, stack eşlemesi |
| [coding-rules.md](coding-rules.md) | Kod yazma kuralları, doğrulama sırası, commit politikası |
| [backend/express-mongoose.md](backend/express-mongoose.md) | Express + Mongoose: üretilen dosyalar, custom bloklar, hook'lar, core asset'ler, ownership |
| [backend/dotnet-efcore.md](backend/dotnet-efcore.md) | .NET 10 + EF Core: host düzeni, G / K dosyalar, partial'lar, servisler, ownership, parser, migration |
| [backend/python-fastapi.md](backend/python-fastapi.md) | Python + FastAPI + MongoDB: yeni proje kurulumu, host düzeni, G / K dosyalar, hook'lar, alan türleri, `null` kuralı, modül testi, Pydantic içe aktarma |
| [backend/auth.md](backend/auth.md) | Ortak auth katmanı (üç stack + istemciler): sözleşme, `Users` modeli, token, ilk admin, istemci auth üretimi |
| [backend/rate-limit.md](backend/rate-limit.md) | Ortak rate limit planı (üç stack): profiller, env, bağlama, projelerde oluşan / silinen dosyalar. Uygulanmadı |
| [frontend/admin-base-config.md](frontend/admin-base-config.md) | Admin FE config üretimi ve dosya kuralı |
| [frontend/admin-host.md](frontend/admin-host.md) | Yeni admin paneli: tema, menü, login, store, i18n iskeleti |
| [frontend/client-data-layer.md](frontend/client-data-layer.md) | Mobil / web veri katmanı üretimi (tipler, servis, thunk, slice; UI yok) ve ortak HTTP katmanı (client-http asset sync, platform tespiti) |
| [admin-base-package.md](admin-base-package.md) | `@atakanimo/ata-admin-base` paketi: geliştirme, host kurulumu |
| [generator-ui.md](generator-ui.md) | Generator arayüzü: ekranlar, IPC, model editörü |
| [verification.md](verification.md) | Doğrulama betikleri (`scripts/verify/`) ve kapılar |
| Açık konular | Her dokümanın sonundaki "Açık konular" bölümü |

## Kurallar

- Generator'ın kendi AI kuralları `.cursor/rules/*.mdc` altındadır; her kural ilgili dokümana bağlanır.
- Host projelerin (SharedFrame, AlphaTerminal, Varlik360, CeyizDefterim) kuralları ortaktır: kaynak `src/generator-assets/cursor-rules/` (`AtaProjectCommon`, `general`, `backend`, `frontend.common`, `frontend.admin`, `frontend.web`, `frontend.mobile`). Proje için ortak kural bu dosyalardadır, `docs/`'ta tekrarlanmaz.
- Dağıtım: `node scripts/rules-sync.mjs [host…]` önizler, `--apply` yazar; host verilmezse dört proje ve Generator'ın kendi `AtaProjectCommon` / `frontend.admin` kopyası. Host'a uygulamalarına göre dosya gider. Her dosyanın sonunda `## Bu projeye özel` ve `rules-sync` işareti vardır: işaretin üstü kaynaktan yazılır, altı projenindir.
