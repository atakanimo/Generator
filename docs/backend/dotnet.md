# BE: .NET (planlandı)

Henüz kod yok. Bu dosya beklenen yapıyı tanımlar; uygulama başlayınca "nasıl çalışıyor" dokümanına dönüşür.

## Değişmeyenler

- Girdi aynı: NormalizedModel v2 ([normalized-model.md](../normalized-model.md)). Modele .NET'e özel alan eklenmez; gerekirse yalnızca `native` altına.
- Çıktı aynı HTTP davranışını verir ([api-contract.md](../api-contract.md)): zarf, uçlar, iç içe `filters`, JSON'da `id`, `decimal` string, strict body, hata kodları.
- Admin FE config stack'ten bağımsızdır; değişmez.

## Beklenen yapı

- İlk hedef: .NET 10 + EF Core 10 + PostgreSQL, Minimal API, Clean Architecture (4 proje, feature klasörleri), kimlik uuid v7.
- Ayrı üretici (`BackendGenerator`'ın dalı değil): `src/main/generators/dotnet-efcore/`, şablonlar `src/main/templates/backend-dotnet-efcore/`, asset'ler `src/generator-assets/dotnet-efcore/`.
- Custom blok yerine partial class / partial method; servis hook'ları, core asset politikası (eksikse oluştur, ezme) ve dosya sahipliği başlığı Express'tekiyle aynı mantıkta.
- MongoDB.Driver seçeneği şimdilik kapsam dışı.
- Kendi doğrulama kapıları ([verification.md](../verification.md)'ye eklenir) ve kendi kuralı (`.cursor/rules/backend-dotnet.mdc`).

Ayrıntılı plan (EF Core + Postgres, klasör yapısı, sözleşme eşlemesi, aşamalar): [plans/backend-dotnet-efcore.md](../plans/backend-dotnet-efcore.md).
