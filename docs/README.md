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
| [frontend/admin-base-config.md](frontend/admin-base-config.md) | Admin FE config üretimi ve dosya kuralı |
| [frontend/client-data-layer.md](frontend/client-data-layer.md) | Mobil / web veri katmanı üretimi: tipler, servis, thunk, slice (UI yok) |
| [admin-base-package.md](admin-base-package.md) | `@atakanimo/ata-admin-base` paketi: geliştirme, host kurulumu |
| [generator-ui.md](generator-ui.md) | Generator arayüzü: ekranlar, IPC, model editörü |
| [verification.md](verification.md) | Doğrulama betikleri (`scripts/verify/`) ve kapılar |
| [history/varlik360-migration.md](history/varlik360-migration.md) | Varlik360 geçişinin özeti ve açık işler |
| [plans/backend-dotnet-efcore.md](plans/backend-dotnet-efcore.md) | .NET + EF Core: kararlar, açık işler |
| [plans/client-data-layer.md](plans/client-data-layer.md) | Mobil / web istemci veri katmanı (tipler, servis, thunk, slice) üretimi |

AI kuralları `.cursor/rules/*.mdc` altında; her kural ilgili dokümana bağlanır.
